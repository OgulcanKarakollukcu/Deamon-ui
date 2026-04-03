import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CornerQuad } from '../types/scanner'
import { cornersAreClose, smoothCorners } from '../utils/scanner/geometry'

const DETECTION_WIDTH = 640
const DETECTION_INTERVAL_MS = 120
const STABILITY_THRESHOLD_MS = 500
const STABILITY_PIXEL_THRESHOLD = 8
const WORKER_LOG_PREFIX = '[scanner-worker]'

type WorkerEngine = 'opencv' | 'fallback'

interface WorkerLogMessage {
  type: 'LOG'
  level: 'info' | 'warn' | 'error'
  message: string
  details?: unknown
}

interface WorkerErrorMessage {
  type: 'ERROR'
  message: string
  details?: unknown
}

interface WorkerReadyMessage {
  type: 'READY'
  engine: WorkerEngine
}

interface WorkerCornersMessage {
  type: 'CORNERS'
  corners: CornerQuad | null
}

type WorkerMessage =
  | WorkerLogMessage
  | WorkerErrorMessage
  | WorkerReadyMessage
  | WorkerCornersMessage

interface UseEdgeDetectionResult {
  corners: CornerQuad | null
  isDetecting: boolean
  isStable: boolean
  workerReady: boolean
  workerEngine: WorkerEngine | null
  reset: () => void
}

function createScannerWorker(): Worker {
  return new Worker(new URL('../workers/scanner.worker.js', import.meta.url), {
    name: 'scanner-worker',
  })
}

/**
 * Runs real-time document edge detection in a web worker.
 */
export function useEdgeDetection(
  videoRef: RefObject<HTMLVideoElement>,
  isVideoReady: boolean,
  enabled: boolean,
): UseEdgeDetectionResult {
  const workerRef = useRef<Worker | null>(null)
  const frameLoopRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(0)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  const [corners, setCorners] = useState<CornerQuad | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isStable, setIsStable] = useState(false)
  const [workerReady, setWorkerReady] = useState(!enabled)
  const [workerEngine, setWorkerEngine] = useState<WorkerEngine | null>(
    enabled ? null : 'fallback',
  )

  const smoothedCornersRef = useRef<CornerQuad | null>(null)
  const stableTimerRef = useRef<number | null>(null)
  const lastCornersRef = useRef<CornerQuad | null>(null)
  const pendingFrameRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }

      setWorkerReady(true)
      setWorkerEngine('fallback')
      return
    }

    let worker: Worker

    try {
      worker = createScannerWorker()
    } catch (workerError: unknown) {
      console.error(`${WORKER_LOG_PREFIX} failed to create`, workerError)
      return
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const payload = event.data

      if (payload.type === 'LOG') {
        const logger =
          payload.level === 'error'
            ? console.error
            : payload.level === 'warn'
              ? console.warn
              : console.info
        logger(`${WORKER_LOG_PREFIX} ${payload.message}`, payload.details ?? {})
        return
      }

      if (payload.type === 'ERROR') {
        pendingFrameRef.current = false
        console.error(`${WORKER_LOG_PREFIX} ${payload.message}`, payload.details ?? {})
        return
      }

      if (payload.type === 'READY') {
        console.info(`${WORKER_LOG_PREFIX} ready`, { engine: payload.engine })
        setWorkerReady(true)
        setWorkerEngine(payload.engine)
        return
      }

      pendingFrameRef.current = false
      const detectedCorners = payload.corners

      if (!detectedCorners) {
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
        detectedCorners,
        getAdaptiveLerpFactor(smoothedCornersRef.current, detectedCorners),
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
    }

    worker.onmessageerror = (errorEvent: MessageEvent): void => {
      pendingFrameRef.current = false
      console.error(`${WORKER_LOG_PREFIX} message error`, {
        data: errorEvent.data,
        type: errorEvent.type,
      })
    }

    worker.onerror = (errorEvent: ErrorEvent): void => {
      pendingFrameRef.current = false
      console.error(`${WORKER_LOG_PREFIX} worker error`, {
        message: errorEvent.message,
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        error: errorEvent.error,
      })
    }

    workerRef.current = worker
    setWorkerReady(false)
    setWorkerEngine(null)
    console.info(`${WORKER_LOG_PREFIX} init`)
    worker.postMessage({ type: 'INIT' })

    return () => {
      worker.terminate()
      workerRef.current = null
      if (stableTimerRef.current !== null) {
        window.clearTimeout(stableTimerRef.current)
      }
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !workerReady || !isVideoReady || !workerRef.current) {
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
        pendingFrameRef.current
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
      const imageData = context.getImageData(0, 0, DETECTION_WIDTH, detectionHeight)

      pendingFrameRef.current = true
      lastFrameTimeRef.current = timestamp

      workerRef.current?.postMessage(
        {
          type: 'DETECT',
          imageData,
          width: DETECTION_WIDTH,
          height: detectionHeight,
        },
        [imageData.data.buffer],
      )
    }

    frameLoopRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameLoopRef.current !== null) {
        cancelAnimationFrame(frameLoopRef.current)
        frameLoopRef.current = null
      }
    }
  }, [enabled, isVideoReady, videoRef, workerReady])

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

  if (averageDelta > 90) {
    return 0.7
  }
  if (averageDelta > 42) {
    return 0.52
  }
  if (averageDelta > 18) {
    return 0.34
  }

  return 0.18
}
