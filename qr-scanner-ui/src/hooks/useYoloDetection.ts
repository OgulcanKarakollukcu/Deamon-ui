import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CornerQuad } from '../types/scanner'
import { cornersAreClose, smoothCorners } from '../utils/scanner/geometry'
import {
  detectBestChequeWithYolo,
  ensureYoloModelLoaded,
} from '../utils/scanner/yoloDetector'

const DETECTION_WIDTH = 640
const DETECTION_INTERVAL_MS = 180
const STABILITY_THRESHOLD_MS = 500
const STABILITY_PIXEL_THRESHOLD = 8

type WorkerEngine = 'yolo' | 'fallback'

interface UseYoloDetectionResult {
  corners: CornerQuad | null
  isDetecting: boolean
  isStable: boolean
  workerReady: boolean
  workerEngine: WorkerEngine | null
  reset: () => void
}

/**
 * Real-time cheque detection driven by the fine-tuned YOLO-OBB tfjs model.
 * Mirrors the public surface of `useEdgeDetection` so the camera UI can switch
 * between detection engines without restructuring its render code.
 */
export function useYoloDetection(
  videoRef: RefObject<HTMLVideoElement>,
  isVideoReady: boolean,
  enabled: boolean,
): UseYoloDetectionResult {
  const [corners, setCorners] = useState<CornerQuad | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isStable, setIsStable] = useState(false)
  const [workerReady, setWorkerReady] = useState(!enabled)
  const [workerEngine, setWorkerEngine] = useState<WorkerEngine | null>(
    enabled ? null : 'fallback',
  )

  const frameLoopRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(0)
  const inFlightRef = useRef(false)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  const smoothedCornersRef = useRef<CornerQuad | null>(null)
  const stableTimerRef = useRef<number | null>(null)
  const lastCornersRef = useRef<CornerQuad | null>(null)

  // ---- Model warmup -------------------------------------------------------

  useEffect(() => {
    if (!enabled) {
      setWorkerReady(true)
      setWorkerEngine('fallback')
      return
    }

    let cancelled = false
    setWorkerReady(false)
    setWorkerEngine(null)

    ensureYoloModelLoaded()
      .then(() => {
        if (cancelled) return
        setWorkerReady(true)
        setWorkerEngine('yolo')
      })
      .catch(() => {
        if (cancelled) return
        // YOLO load failed: report as fallback (the UI will surface this and
        // the caller can offer to switch back to OpenCV/CV).
        setWorkerReady(true)
        setWorkerEngine('fallback')
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  // ---- Detection loop -----------------------------------------------------

  useEffect(() => {
    if (!enabled || !workerReady || !isVideoReady || workerEngine !== 'yolo') {
      if (frameLoopRef.current !== null) {
        cancelAnimationFrame(frameLoopRef.current)
        frameLoopRef.current = null
      }
      return
    }

    const tick = (timestamp: number): void => {
      frameLoopRef.current = requestAnimationFrame(tick)

      if (timestamp - lastFrameTimeRef.current < DETECTION_INTERVAL_MS) {
        return
      }

      const videoElement = videoRef.current
      if (
        !videoElement ||
        videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        inFlightRef.current
      ) {
        return
      }

      const videoWidth = videoElement.videoWidth
      const videoHeight = videoElement.videoHeight
      if (!videoWidth || !videoHeight) {
        return
      }

      const detectionHeight = Math.round(DETECTION_WIDTH * (videoHeight / videoWidth))

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas')
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d', {
          willReadFrequently: true,
        })
      }

      const canvas = offscreenCanvasRef.current
      const context = offscreenCtxRef.current
      if (!context) {
        return
      }

      if (canvas.width !== DETECTION_WIDTH || canvas.height !== detectionHeight) {
        canvas.width = DETECTION_WIDTH
        canvas.height = detectionHeight
      }

      context.drawImage(videoElement, 0, 0, DETECTION_WIDTH, detectionHeight)

      inFlightRef.current = true
      lastFrameTimeRef.current = timestamp

      detectBestChequeWithYolo(canvas, DETECTION_WIDTH, detectionHeight)
        .then((detection) => {
          inFlightRef.current = false

          if (!detection) {
            smoothedCornersRef.current = null
            lastCornersRef.current = null
            setCorners(null)
            setIsDetecting(false)
            setIsStable(false)

            if (stableTimerRef.current !== null) {
              window.clearTimeout(stableTimerRef.current)
              stableTimerRef.current = null
            }
            return
          }

          setIsDetecting(true)

          const smoothed = smoothCorners(
            smoothedCornersRef.current,
            detection.corners,
            getAdaptiveLerpFactor(smoothedCornersRef.current, detection.corners),
          )

          if (!smoothed) {
            return
          }

          smoothedCornersRef.current = smoothed
          setCorners(smoothed)

          if (
            lastCornersRef.current &&
            cornersAreClose(smoothed, lastCornersRef.current, STABILITY_PIXEL_THRESHOLD)
          ) {
            if (stableTimerRef.current === null) {
              stableTimerRef.current = window.setTimeout(() => {
                setIsStable(true)
              }, STABILITY_THRESHOLD_MS)
            }
          } else {
            if (stableTimerRef.current !== null) {
              window.clearTimeout(stableTimerRef.current)
              stableTimerRef.current = null
            }
            setIsStable(false)
          }

          lastCornersRef.current = smoothed
        })
        .catch(() => {
          inFlightRef.current = false
        })
    }

    frameLoopRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameLoopRef.current !== null) {
        cancelAnimationFrame(frameLoopRef.current)
        frameLoopRef.current = null
      }
    }
  }, [enabled, workerReady, workerEngine, isVideoReady, videoRef])

  const reset = useCallback((): void => {
    smoothedCornersRef.current = null
    lastCornersRef.current = null
    setCorners(null)
    setIsDetecting(false)
    setIsStable(false)

    if (stableTimerRef.current !== null) {
      window.clearTimeout(stableTimerRef.current)
      stableTimerRef.current = null
    }
  }, [])

  return {
    corners,
    isDetecting,
    isStable,
    workerReady,
    workerEngine,
    reset,
  }
}

function getAdaptiveLerpFactor(
  currentCorners: CornerQuad | null,
  nextCorners: CornerQuad | null,
): number {
  if (!currentCorners || !nextCorners) {
    return 1
  }

  const averageDelta =
    currentCorners.reduce(
      (sum, point, index) =>
        sum +
        Math.hypot(nextCorners[index].x - point.x, nextCorners[index].y - point.y),
      0,
    ) / currentCorners.length

  if (averageDelta > 90) return 0.7
  if (averageDelta > 42) return 0.52
  if (averageDelta > 18) return 0.34
  return 0.18
}
