import * as tf from '@tensorflow/tfjs'
import type { CornerPoint, CornerQuad } from '../../types/scanner'
import { orderCorners } from './geometry'

const MODEL_URL = '/model/best_web_model/model.json'
const MODEL_INPUT_SIZE = 512
const OUTPUT_TENSOR_NAME = 'Identity:0'
const DEFAULT_CONFIDENCE_THRESHOLD = 0.35
const DEFAULT_MULTI_IOU_THRESHOLD = 0.3

export interface YoloChequeDetection {
  corners: CornerQuad
  confidence: number
  classId: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

export type YoloInputSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageData

export interface YoloDetectionOptions {
  confidenceThreshold?: number
  maxResults?: number
  iouThreshold?: number
}

let modelPromise: Promise<tf.GraphModel> | null = null

/**
 * Lazily loads the fine-tuned YOLO graph model. Subsequent callers reuse the
 * same promise so the model only downloads/initializes once per page load.
 */
async function loadYoloModel(): Promise<tf.GraphModel> {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => tf.loadGraphModel(MODEL_URL))
  }
  return modelPromise
}

/**
 * Triggers model preload (and tfjs backend init) without running inference.
 */
export async function ensureYoloModelLoaded(): Promise<void> {
  await loadYoloModel()
}

/**
 * Runs the YOLO-OBB cheque detector on the supplied source pixels and returns
 * detections in source-image coordinates ordered by confidence.
 */
export async function detectChequesWithYolo(
  source: YoloInputSource,
  sourceWidth: number,
  sourceHeight: number,
  options: YoloDetectionOptions = {},
): Promise<YoloChequeDetection[]> {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return []
  }

  const model = await loadYoloModel()
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const maxResults = options.maxResults ?? 6
  const iouThreshold = options.iouThreshold ?? DEFAULT_MULTI_IOU_THRESHOLD

  const input = tf.tidy(() => {
    const pixels = tf.browser.fromPixels(source as HTMLCanvasElement)
    const resized = tf.image.resizeBilinear(pixels, [
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ])
    const normalized = resized.toFloat().div(255)
    return normalized.expandDims(0) as tf.Tensor4D
  })

  let rows: number[][]
  try {
    const output = model.execute(input, OUTPUT_TENSOR_NAME) as tf.Tensor
    try {
      const squeezed = output.squeeze([0]) as tf.Tensor2D
      try {
        rows = (await squeezed.array()) as number[][]
      } finally {
        squeezed.dispose()
      }
    } finally {
      output.dispose()
    }
  } finally {
    input.dispose()
  }

  const scaleX = sourceWidth / MODEL_INPUT_SIZE
  const scaleY = sourceHeight / MODEL_INPUT_SIZE

  const candidates: YoloChequeDetection[] = []
  for (const row of rows) {
    if (!row || row.length < 7) continue
    const confidence = row[4]
    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) {
      continue
    }

    const cx = row[0] * scaleX
    const cy = row[1] * scaleY
    const w = row[2] * scaleX
    const h = row[3] * scaleY
    const angle = row[6]

    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(w) || !Number.isFinite(h)) {
      continue
    }
    if (w <= 1 || h <= 1) continue

    const rawCorners = obbToCorners(cx, cy, w, h, Number.isFinite(angle) ? angle : 0)
    const ordered = orderCorners(rawCorners)
    const bbox = bboxFromCorners(ordered)

    candidates.push({
      corners: ordered,
      confidence,
      classId: Math.round(row[5]),
      bbox,
    })
  }

  candidates.sort((a, b) => b.confidence - a.confidence)

  // Greedy NMS over axis-aligned bboxes (output is already end-to-end NMS'd by
  // the graph, but we filter overlapping leftovers just in case).
  const selected: YoloChequeDetection[] = []
  for (const candidate of candidates) {
    if (selected.length >= maxResults) break
    let overlaps = false
    for (const kept of selected) {
      if (bboxIou(candidate.bbox, kept.bbox) > iouThreshold) {
        overlaps = true
        break
      }
    }
    if (!overlaps) {
      selected.push(candidate)
    }
  }

  return selected
}

/**
 * Convenience helper that returns the highest-confidence detection only, or
 * null when nothing crosses the confidence threshold.
 */
export async function detectBestChequeWithYolo(
  source: YoloInputSource,
  sourceWidth: number,
  sourceHeight: number,
  options: YoloDetectionOptions = {},
): Promise<YoloChequeDetection | null> {
  const detections = await detectChequesWithYolo(source, sourceWidth, sourceHeight, {
    ...options,
    maxResults: 1,
  })
  return detections[0] ?? null
}

function obbToCorners(
  cx: number,
  cy: number,
  width: number,
  height: number,
  angleRad: number,
): CornerPoint[] {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const halfW = width / 2
  const halfH = height / 2

  // Rectangle corners in local (centered) frame, then rotated by angle and
  // translated to (cx, cy).
  const localCorners: CornerPoint[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ]

  return localCorners.map(({ x, y }) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }))
}

function bboxFromCorners(corners: CornerQuad): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
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
