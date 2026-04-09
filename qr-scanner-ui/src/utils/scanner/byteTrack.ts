import type { BoundingBox, TrackedCheque } from '../../types/scanner'
import { smoothCorners } from './geometry'
import type { YoloChequeDetection } from './yoloDetector'

const HIGH_CONFIDENCE_THRESHOLD = 0.60
const LOW_CONFIDENCE_THRESHOLD = 0.25
const PRIMARY_MATCH_IOU = 0.2
const SECONDARY_MATCH_IOU = 0.2
const MAX_LOST_FRAMES = 20
const TRACK_SMOOTHING = 0.3
const TRACK_BBOX_SMOOTHING = 0.35
const MIN_CENTER_PROXIMITY = 0.72

interface InternalTrack extends TrackedCheque {
  hits: number
  lostFrames: number
  matchBbox: BoundingBox
}

interface MatchCandidate {
  detectionIndex: number
  iou: number
  score: number
  trackId: number
}

export class ByteTrackTracker {
  private nextTrackId = 1

  private tracks: InternalTrack[] = []

  reset(): void {
    this.nextTrackId = 1
    this.tracks = []
  }

  update(detections: YoloChequeDetection[]): TrackedCheque[] {
    const filteredDetections = detections
      .filter((detection) => detection.confidence >= LOW_CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence)

    const highConfidenceDetections = filteredDetections.filter(
      (detection) => detection.confidence >= HIGH_CONFIDENCE_THRESHOLD,
    )
    const lowConfidenceDetections = filteredDetections.filter(
      (detection) => detection.confidence < HIGH_CONFIDENCE_THRESHOLD,
    )

    const matchedTrackIds = new Set<number>()
    const usedHighDetections = new Set<number>()
    const usedLowDetections = new Set<number>()

    matchDetectionsToTracks(
      this.tracks,
      highConfidenceDetections,
      PRIMARY_MATCH_IOU,
      matchedTrackIds,
      usedHighDetections,
      (track, detection) => {
        updateTrack(track, detection)
      },
    )

    const unmatchedTracks = this.tracks.filter((track) => !matchedTrackIds.has(track.id))

    matchDetectionsToTracks(
      unmatchedTracks,
      lowConfidenceDetections,
      SECONDARY_MATCH_IOU,
      matchedTrackIds,
      usedLowDetections,
      (track, detection) => {
        updateTrack(track, detection)
      },
    )

    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.id)) {
        track.lostFrames += 1
      }
    }

    highConfidenceDetections.forEach((detection, index) => {
      if (usedHighDetections.has(index)) {
        return
      }

      this.tracks.push({
        id: this.nextTrackId,
        corners: detection.corners,
        bbox: detection.bbox,
        matchBbox: detection.bbox,
        confidence: detection.confidence,
        hits: 1,
        lostFrames: 0,
      })
      this.nextTrackId += 1
    })

    this.tracks = this.tracks
      .filter((track) => track.lostFrames <= MAX_LOST_FRAMES)
      .sort((a, b) => a.id - b.id)

    return this.tracks
      .filter((track) => track.lostFrames === 0)
      .map(({ hits, lostFrames, matchBbox, ...track }) => {
        void hits
        void lostFrames
        void matchBbox
        return track
      })
  }
}

function matchDetectionsToTracks(
  tracks: InternalTrack[],
  detections: YoloChequeDetection[],
  minIou: number,
  matchedTrackIds: Set<number>,
  usedDetectionIndices: Set<number>,
  onMatch: (track: InternalTrack, detection: YoloChequeDetection) => void,
): void {
  const candidates: MatchCandidate[] = []

  tracks.forEach((track) => {
    detections.forEach((detection, detectionIndex) => {
      const iou = bboxIou(track.matchBbox, detection.bbox)
      const centerProximity = bboxCenterProximity(track.matchBbox, detection.bbox)
      if (iou >= minIou || centerProximity >= MIN_CENTER_PROXIMITY) {
        candidates.push({
          detectionIndex,
          iou,
          score: iou * 0.8 + centerProximity * 0.2,
          trackId: track.id,
        })
      }
    })
  })

  candidates.sort((a, b) => b.score - a.score || b.iou - a.iou)

  for (const candidate of candidates) {
    if (matchedTrackIds.has(candidate.trackId) || usedDetectionIndices.has(candidate.detectionIndex)) {
      continue
    }

    const track = tracks.find((item) => item.id === candidate.trackId)
    const detection = detections[candidate.detectionIndex]
    if (!track || !detection) {
      continue
    }

    matchedTrackIds.add(track.id)
    usedDetectionIndices.add(candidate.detectionIndex)
    onMatch(track, detection)
  }
}

function updateTrack(track: InternalTrack, detection: YoloChequeDetection): void {
  track.corners =
    smoothCorners(track.corners, detection.corners, TRACK_SMOOTHING) ?? detection.corners
  track.bbox = smoothBoundingBox(track.bbox, detection.bbox, TRACK_BBOX_SMOOTHING)
  track.matchBbox = detection.bbox
  track.confidence = detection.confidence
  track.hits += 1
  track.lostFrames = 0
}

function bboxIou(a: BoundingBox, b: BoundingBox): number {
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

function smoothBoundingBox(current: BoundingBox, next: BoundingBox, factor: number): BoundingBox {
  return {
    minX: lerp(current.minX, next.minX, factor),
    minY: lerp(current.minY, next.minY, factor),
    maxX: lerp(current.maxX, next.maxX, factor),
    maxY: lerp(current.maxY, next.maxY, factor),
  }
}

function bboxCenterProximity(a: BoundingBox, b: BoundingBox): number {
  const aCenterX = (a.minX + a.maxX) / 2
  const aCenterY = (a.minY + a.maxY) / 2
  const bCenterX = (b.minX + b.maxX) / 2
  const bCenterY = (b.minY + b.maxY) / 2
  const distance = Math.hypot(aCenterX - bCenterX, aCenterY - bCenterY)
  const reference = Math.max(
    Math.hypot(a.maxX - a.minX, a.maxY - a.minY),
    Math.hypot(b.maxX - b.minX, b.maxY - b.minY),
    1,
  )
  return Math.max(0, 1 - distance / reference)
}

function lerp(current: number, next: number, factor: number): number {
  return current + (next - current) * factor
}
