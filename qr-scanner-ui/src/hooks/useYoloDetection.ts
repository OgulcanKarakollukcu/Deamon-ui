import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { BoundingBox, CornerQuad, GuideRegion, TrackedCheque } from '../types/scanner'
import { smoothCorners } from '../utils/scanner/geometry'
import {
  detectChequesWithYolo,
  ensureYoloModelLoaded,
} from '../utils/scanner/yoloDetector'
import { ByteTrackTracker } from '../utils/scanner/byteTrack'

const DETECTION_WIDTH = 640
const DETECTION_INTERVAL_MS = 180

// --- Stability -----------------------------------------------------------
// The selected track is considered stable once its bbox center stays within
// `STABILITY_CENTER_DELTA_PX` of a fixed anchor and its size within
// `STABILITY_SIZE_RATIO` for `STABILITY_DURATION_MS` continuously.
const STABILITY_DURATION_MS = 360
const STABILITY_CENTER_DELTA_PX = 14
const STABILITY_SIZE_RATIO = 0.10
const STABILITY_MIN_CONFIDENCE = 0.35

// --- Selection -----------------------------------------------------------
// Lower IoU bar for ByteTrack; higher bar for confirming a good frame.
const TRACKER_CONFIDENCE_THRESHOLD = 0.12
// Hysteresis: a new candidate must beat the currently-selected track's score
// by this multiplier before we switch. Prevents jitter between candidates.
const SELECTION_HYSTERESIS_MULTIPLIER = 1.5
const MIN_GUIDE_SELECTION_SCORE = 0.2
const MIN_GUIDE_CONTAINMENT_RATIO = 0.14

type WorkerEngine = 'yolo' | 'fallback'

interface StabilityAnchor {
  centerX: number
  centerY: number
  width: number
  height: number
  startedAt: number
}

interface UseYoloDetectionResult {
  corners: CornerQuad | null
  isDetecting: boolean
  isStable: boolean
  selectedTrackId: number | null
  trackedCheques: TrackedCheque[]
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
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null)
  const [trackedCheques, setTrackedCheques] = useState<TrackedCheque[]>([])
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
  const selectedTrackIdRef = useRef<number | null>(null)
  const trackerRef = useRef(new ByteTrackTracker())
  const stabilityAnchorRef = useRef<StabilityAnchor | null>(null)

  // ---- Model warmup -------------------------------------------------------

  useEffect(() => {
    if (!enabled) {
      trackerRef.current.reset()
      stabilityAnchorRef.current = null
      selectedTrackIdRef.current = null
      setSelectedTrackId(null)
      setTrackedCheques([])
      setCorners(null)
      setIsDetecting(false)
      setIsStable(false)
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

      if (canvas.width !== DETECTION_WIDTH || canvas.height !== detectionHeight) {
        canvas.width = DETECTION_WIDTH
        canvas.height = detectionHeight
      }

      context.drawImage(videoElement, 0, 0, DETECTION_WIDTH, detectionHeight)

      inFlightRef.current = true
      lastFrameTimeRef.current = timestamp

      detectChequesWithYolo(canvas, DETECTION_WIDTH, detectionHeight, {
        confidenceThreshold: TRACKER_CONFIDENCE_THRESHOLD,
        maxResults: 12,
      })
        .then((detections) => {
          inFlightRef.current = false

          const nextTrackedCheques = trackerRef.current.update(detections)
          const selectedTrack = selectTrackedCheque(
            nextTrackedCheques,
            resolvedGuideRegion,
            selectedTrackIdRef.current,
          )

          setSelectedTrackId(selectedTrack?.id ?? null)
          setTrackedCheques(nextTrackedCheques)
          setIsDetecting(nextTrackedCheques.length > 0)

          if (!selectedTrack) {
            smoothedCornersRef.current = null
            stabilityAnchorRef.current = null
            selectedTrackIdRef.current = null
            setCorners(null)
            setIsStable(false)
            return
          }

          // Track switched: reset smoothing + stability anchor.
          if (selectedTrackIdRef.current !== selectedTrack.id) {
            smoothedCornersRef.current = selectedTrack.corners
            stabilityAnchorRef.current = null
            selectedTrackIdRef.current = selectedTrack.id
            setCorners(selectedTrack.corners)
            setIsStable(false)
          }

          const smoothed = smoothCorners(
            smoothedCornersRef.current,
            selectedTrack.corners,
            getAdaptiveLerpFactor(smoothedCornersRef.current, selectedTrack.corners),
          )

          if (!smoothed) {
            return
          }

          smoothedCornersRef.current = smoothed
          setCorners(smoothed)

          const steady = updateStability(
            stabilityAnchorRef,
            selectedTrack,
            timestamp,
          )
          setIsStable(steady)
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
    trackerRef.current.reset()
    stabilityAnchorRef.current = null
    smoothedCornersRef.current = null
    selectedTrackIdRef.current = null
    setCorners(null)
    setIsDetecting(false)
    setIsStable(false)
    setSelectedTrackId(null)
    setTrackedCheques([])
  }, [])

  return {
    corners,
    isDetecting,
    isStable,
    selectedTrackId,
    trackedCheques,
    workerReady,
    workerEngine,
    reset,
  }
}

/**
 * Anchor-based stability check. The anchor is set on the first frame of a
 * selected track (and after any drift). Subsequent frames must stay within
 * the center/size thresholds of that fixed anchor for `STABILITY_DURATION_MS`
 * continuously before the track is reported stable.
 */
function updateStability(
  anchorRef: { current: StabilityAnchor | null },
  track: TrackedCheque,
  now: number,
): boolean {
  if (track.confidence < STABILITY_MIN_CONFIDENCE) {
    anchorRef.current = null
    return false
  }

  const centerX = (track.bbox.minX + track.bbox.maxX) / 2
  const centerY = (track.bbox.minY + track.bbox.maxY) / 2
  const width = track.bbox.maxX - track.bbox.minX
  const height = track.bbox.maxY - track.bbox.minY

  const anchor = anchorRef.current
  if (!anchor) {
    anchorRef.current = { centerX, centerY, width, height, startedAt: now }
    return false
  }

  const centerDelta = Math.hypot(centerX - anchor.centerX, centerY - anchor.centerY)
  const widthRatio = Math.abs(width - anchor.width) / Math.max(anchor.width, 1)
  const heightRatio = Math.abs(height - anchor.height) / Math.max(anchor.height, 1)
  const withinThreshold =
    centerDelta <= STABILITY_CENTER_DELTA_PX &&
    widthRatio <= STABILITY_SIZE_RATIO &&
    heightRatio <= STABILITY_SIZE_RATIO

  if (!withinThreshold) {
    // Drifted: re-anchor at the current pose and restart the timer.
    anchorRef.current = { centerX, centerY, width, height, startedAt: now }
    return false
  }

  return now - anchor.startedAt >= STABILITY_DURATION_MS
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

/**
 * Picks the tracked cheque best framed by the guide region. Score combines:
 *   - containment: fraction of the detection that lies inside the guide
 *   - centering: how close the detection center is to the guide center
 *
 * Applies hysteresis against the previously-selected track id so small
 * frame-to-frame score wobble cannot flip the selection between two
 * overlapping cheques.
 */
function selectTrackedCheque(
  trackedCheques: TrackedCheque[],
  guideRegion: GuideRegion | null,
  previousSelectedId: number | null,
): TrackedCheque | null {
  if (!trackedCheques.length) {
    return null
  }

  if (!guideRegion) {
    return trackedCheques[0] ?? null
  }

  const guideBox: BoundingBox = {
    minX: guideRegion.x,
    minY: guideRegion.y,
    maxX: guideRegion.x + guideRegion.width,
    maxY: guideRegion.y + guideRegion.height,
  }
  const guideCenterX = guideRegion.x + guideRegion.width / 2
  const guideCenterY = guideRegion.y + guideRegion.height / 2
  const guideHalfDiag = Math.hypot(guideRegion.width, guideRegion.height) / 2

  const scoreFor = (track: TrackedCheque): number => {
    const interArea = bboxIntersectionArea(guideBox, track.bbox)
    if (interArea <= 0) {
      return 0
    }

    const detectionArea = Math.max(
      (track.bbox.maxX - track.bbox.minX) * (track.bbox.maxY - track.bbox.minY),
      1,
    )
    const containment = interArea / detectionArea

    const detCenterX = (track.bbox.minX + track.bbox.maxX) / 2
    const detCenterY = (track.bbox.minY + track.bbox.maxY) / 2
    const centerInsideGuide =
      detCenterX >= guideBox.minX &&
      detCenterX <= guideBox.maxX &&
      detCenterY >= guideBox.minY &&
      detCenterY <= guideBox.maxY
    const dist = Math.hypot(detCenterX - guideCenterX, detCenterY - guideCenterY)
    const centering = Math.max(0, 1 - dist / Math.max(guideHalfDiag, 1))

    if (!centerInsideGuide && containment < MIN_GUIDE_CONTAINMENT_RATIO) {
      return 0
    }

    // Containment dominates, while center distance breaks ties. Tracks whose
    // center falls outside the guide are penalized so neighbours touching the
    // guide edge cannot steal focus from the cheque in the middle.
    const edgePenalty = centerInsideGuide ? 1 : 0.55
    return (containment * 0.7 + centering * 0.3) * edgePenalty
  }

  let bestTrack: TrackedCheque | null = null
  let bestScore = 0

  for (const track of trackedCheques) {
    const score = scoreFor(track)
    if (score > bestScore) {
      bestScore = score
      bestTrack = track
    }
  }

  if (!bestTrack || bestScore < MIN_GUIDE_SELECTION_SCORE) {
    return null
  }

  // Hysteresis: stay with the previous selection unless another track is
  // decisively better.
  if (previousSelectedId !== null && previousSelectedId !== bestTrack.id) {
    const previousTrack = trackedCheques.find((track) => track.id === previousSelectedId)
    if (previousTrack) {
      const previousScore = scoreFor(previousTrack)
      if (previousScore > 0 && bestScore < previousScore * SELECTION_HYSTERESIS_MULTIPLIER) {
        return previousTrack
      }
    }
  }

  return bestTrack
}

function bboxIntersectionArea(a: BoundingBox, b: BoundingBox): number {
  const ix0 = Math.max(a.minX, b.minX)
  const iy0 = Math.max(a.minY, b.minY)
  const ix1 = Math.min(a.maxX, b.maxX)
  const iy1 = Math.min(a.maxY, b.maxY)
  const iw = Math.max(0, ix1 - ix0)
  const ih = Math.max(0, iy1 - iy0)
  return iw * ih
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
