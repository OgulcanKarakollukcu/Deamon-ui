import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CornerQuad, GuideRegion } from '../types/scanner'
import { cornersAreClose, smoothCorners } from '../utils/scanner/geometry'
import {
  detectChequesWithYolo,
  ensureYoloModelLoaded,
  type YoloChequeDetection,
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
  guideRegion?: GuideRegion | null,
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

      const resolvedGuideRegion = resolveGuideRegion(
        guideRegion,
        DETECTION_WIDTH,
        detectionHeight,
      )
      const targetWidth = DETECTION_WIDTH
      const targetHeight = detectionHeight

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      context.drawImage(videoElement, 0, 0, DETECTION_WIDTH, detectionHeight)

      inFlightRef.current = true
      lastFrameTimeRef.current = timestamp

      detectChequesWithYolo(canvas, targetWidth, targetHeight)
        .then((detections) => {
          inFlightRef.current = false
          const detection = selectTrackedDetection(detections, resolvedGuideRegion)

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
  }, [enabled, guideRegion, isVideoReady, workerEngine, workerReady, videoRef])

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

function resolveGuideRegion(
  guideRegion: GuideRegion | null | undefined,
  maxWidth: number,
  maxHeight: number,
): GuideRegion | null {
  if (!guideRegion) {
    return null
  }

  const x = clamp(guideRegion.x, 0, maxWidth - 1)
  const y = clamp(guideRegion.y, 0, maxHeight - 1)
  const width = clamp(guideRegion.width, 1, maxWidth - x)
  const height = clamp(guideRegion.height, 1, maxHeight - y)

  return { x, y, width, height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function selectTrackedDetection(
  detections: YoloChequeDetection[],
  guideRegion: GuideRegion | null,
): YoloChequeDetection | null {
  if (detections.length < 1) {
    return null
  }

  if (!guideRegion) {
    return detections[0] ?? null
  }

  const guideBox = {
    minX: guideRegion.x,
    minY: guideRegion.y,
    maxX: guideRegion.x + guideRegion.width,
    maxY: guideRegion.y + guideRegion.height,
  }

  let bestDetection: YoloChequeDetection | null = null
  let bestScore = 0

  for (const detection of detections) {
    const score = bboxIou(guideBox, detection.bbox)
    if (score > bestScore) {
      bestScore = score
      bestDetection = detection
      continue
    }

    if (
      score === bestScore &&
      bestDetection &&
      detection.confidence > bestDetection.confidence
    ) {
      bestDetection = detection
    }
  }

  return bestScore > 0 ? bestDetection : null
}

function bboxIou(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const ix0 = Math.max(a.minX, b.minX)
  const iy0 = Math.max(a.minY, b.minY)
  const ix1 = Math.min(a.maxX, b.maxX)
  const iy1 = Math.min(a.maxY, b.maxY)
  const iw = Math.max(0, ix1 - ix0)
  const ih = Math.max(0, iy1 - iy0)
  const inter = iw * ih
  if (!inter) return 0
  const areaA = Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY)
  const areaB = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY)
  const denom = areaA + areaB - inter
  return denom ? inter / denom : 0
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
