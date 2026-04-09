import type { CaptureDraft, CornerQuad } from '../types/scanner'
import type { ReadInputBarcodeFormat, ReadResult } from 'zxing-wasm/reader'
import { orderCorners, scaleCorners } from '../utils/scanner/geometry'

const TARGET_FORMATS: ReadInputBarcodeFormat[] = ['DataMatrix', 'QRCode']
const DETECTION_IMAGE_EDGE = 640
const PROCESSING_IMAGE_EDGE = 2200
const DETECT_TIMEOUT_MS = 8000
const MAX_RESULTS = 6
const CHEQUE_ASPECT = 2.35

interface WorkerReadyMessage {
  type: 'READY'
}

interface WorkerCornersMultiMessage {
  type: 'CORNERS_MULTI'
  cornersList: CornerQuad[]
}

interface WorkerErrorMessage {
  type: 'ERROR'
}

type DetectionWorkerMessage = WorkerReadyMessage | WorkerCornersMultiMessage | WorkerErrorMessage

export interface MultiChequeDraftCapture {
  draft: CaptureDraft
  qrValue: string
}

export async function analyzeUploadedChequeDraftBatch(
  file: File,
): Promise<MultiChequeDraftCapture[]> {
  const image = await loadImageElement(file)
  try {
    return await analyzeDraftsWithRotationFallback(image)
  } finally {
    URL.revokeObjectURL(image.src)
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Yuklenen gorsel acilamadi.'))
    image.src = objectUrl
  })
}

function renderImageToCanvas(
  image: HTMLImageElement,
  maxEdge: number,
  rotationDegrees: 0 | 90 | 180 | 270,
): { canvas: HTMLCanvasElement; imageData: ImageData } {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Yuklenen gorsel boyutu gecersiz.')
  }

  const rotatedWidth =
    rotationDegrees === 90 || rotationDegrees === 270 ? sourceHeight : sourceWidth
  const rotatedHeight =
    rotationDegrees === 90 || rotationDegrees === 270 ? sourceWidth : sourceHeight

  const scale = Math.min(1, maxEdge / Math.max(rotatedWidth, rotatedHeight))
  const targetWidth = Math.max(1, Math.round(rotatedWidth * scale))
  const targetHeight = Math.max(1, Math.round(rotatedHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Gorsel analiz ortami hazirlanamadi.')
  }

  context.save()
  context.translate(targetWidth / 2, targetHeight / 2)
  context.rotate((rotationDegrees * Math.PI) / 180)
  context.drawImage(
    image,
    -(sourceWidth * scale) / 2,
    -(sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale,
  )
  context.restore()

  return { canvas, imageData: context.getImageData(0, 0, targetWidth, targetHeight) }
}

async function analyzeDraftsWithRotationFallback(
  image: HTMLImageElement,
): Promise<MultiChequeDraftCapture[]> {
  for (const rotationDegrees of [0, 90, 180, 270] as const) {
    const { canvas: processingCanvas } = renderImageToCanvas(
      image,
      PROCESSING_IMAGE_EDGE,
      rotationDegrees,
    )
    const { canvas: detectionCanvas, imageData: detectionImageData } = renderImageToCanvas(
      image,
      DETECTION_IMAGE_EDGE,
      rotationDegrees,
    )

    const barcodes = await decodeBarcodesFromCanvas(processingCanvas)
    if (barcodes.length === 0) {
      continue
    }

    const cornersListOnDetection = await detectMultipleChequeCorners(detectionImageData)
    const quadsOnProcessing = cornersListOnDetection.map((cornersOnDetection) =>
      scaleCorners(
        cornersOnDetection,
        detectionCanvas.width,
        detectionCanvas.height,
        processingCanvas.width,
        processingCanvas.height,
      ),
    )

    const quadCandidates: CornerQuad[] =
      quadsOnProcessing.length > 0
        ? quadsOnProcessing
        : barcodes.map((barcode) =>
            buildChequeQuadFromBarcode(barcode, processingCanvas.width, processingCanvas.height),
          )

    const matches = matchBarcodesToQuads(barcodes, quadCandidates)
    if (matches.length < 2) {
      continue
    }

    // One shared preview for all cheques; user will adjust per-cheque corners.
    const previewDataURL = processingCanvas.toDataURL('image/jpeg', 0.86)

    return matches.map((match) => ({
      qrValue: match.text,
      draft: {
        sourceCanvas: processingCanvas,
        previewDataURL,
        width: processingCanvas.width,
        height: processingCanvas.height,
        corners: orderCorners(match.quad),
      },
    }))
  }

  return []
}

async function decodeBarcodesFromCanvas(canvas: HTMLCanvasElement): Promise<ReadResult[]> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return []
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { readBarcodesFromImageData } = await import('zxing-wasm/reader')
  try {
    return await readBarcodesFromImageData(imageData, { formats: TARGET_FORMATS })
  } catch {
    return []
  }
}

function barcodeCenter(barcode: ReadResult): { x: number; y: number } {
  const { topLeft, topRight, bottomLeft, bottomRight } = barcode.position
  return {
    x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
    y: (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4,
  }
}

function quadCenter(quad: CornerQuad): { x: number; y: number } {
  return quad.reduce(
    (acc, pt) => ({ x: acc.x + pt.x / 4, y: acc.y + pt.y / 4 }),
    { x: 0, y: 0 },
  )
}

function quadBbox(quad: CornerQuad): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = quad.map((p) => p.x)
  const ys = quad.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

function pointInBbox(point: { x: number; y: number }, bbox: ReturnType<typeof quadBbox>): boolean {
  return point.x >= bbox.minX && point.x <= bbox.maxX && point.y >= bbox.minY && point.y <= bbox.maxY
}

function matchBarcodesToQuads(
  barcodes: ReadResult[],
  quads: CornerQuad[],
): Array<{ text: string; quad: CornerQuad }> {
  const remainingQuads = quads.map((quad, index) => ({
    quad,
    index,
    center: quadCenter(quad),
    bbox: quadBbox(quad),
  }))

  const results: Array<{ text: string; quad: CornerQuad }> = []

  for (const barcode of barcodes) {
    const text = barcode.text?.trim()
    if (!text) {
      continue
    }

    const center = barcodeCenter(barcode)
    let bestIndex = -1
    let bestScore = Number.POSITIVE_INFINITY

    for (const candidate of remainingQuads) {
      const inside = pointInBbox(center, candidate.bbox)
      const dx = center.x - candidate.center.x
      const dy = center.y - candidate.center.y
      const dist = Math.hypot(dx, dy)
      const score = (inside ? 0 : 5000) + dist
      if (score < bestScore) {
        bestScore = score
        bestIndex = candidate.index
      }
    }

    if (bestIndex >= 0) {
      const chosen = remainingQuads.find((item) => item.index === bestIndex)
      if (chosen) {
        results.push({ text, quad: chosen.quad })
        const removeAt = remainingQuads.findIndex((item) => item.index === bestIndex)
        if (removeAt >= 0) {
          remainingQuads.splice(removeAt, 1)
        }
      }
    }
  }

  return results
}

function buildChequeQuadFromBarcode(
  barcode: ReadResult,
  canvasWidth: number,
  canvasHeight: number,
): CornerQuad {
  const { topLeft, topRight, bottomLeft, bottomRight } = barcode.position
  const ys = [topLeft.y, topRight.y, bottomLeft.y, bottomRight.y]
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const center = barcodeCenter(barcode)
  const codeH = Math.max(1, maxY - minY)

  const chequeHeight = clamp(codeH * 8, canvasHeight * 0.22, canvasHeight * 0.62)
  const chequeWidth = chequeHeight * CHEQUE_ASPECT

  const left = clamp(center.x - chequeWidth / 2, 0, canvasWidth - chequeWidth)
  const top = clamp(center.y - chequeHeight / 2, 0, canvasHeight - chequeHeight)

  return [
    { x: left, y: top },
    { x: left + chequeWidth, y: top },
    { x: left + chequeWidth, y: top + chequeHeight },
    { x: left, y: top + chequeHeight },
  ]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function detectMultipleChequeCorners(imageData: ImageData): Promise<CornerQuad[]> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/scanner.worker.js', import.meta.url), {
      name: 'scanner-upload-multi-worker',
    })
    let completed = false

    const finish = (cornersList: CornerQuad[]): void => {
      if (completed) {
        return
      }
      completed = true
      window.clearTimeout(timeoutId)
      worker.terminate()
      resolve(cornersList)
    }

    const timeoutId = window.setTimeout(() => {
      finish([])
    }, DETECT_TIMEOUT_MS)

    worker.onerror = () => {
      finish([])
    }

    worker.onmessage = (event: MessageEvent<DetectionWorkerMessage>) => {
      const message = event.data
      if (message.type === 'READY') {
        worker.postMessage({
          type: 'DETECT_MULTI',
          imageData,
          width: imageData.width,
          height: imageData.height,
          maxResults: MAX_RESULTS,
        })
        return
      }

      if (message.type === 'CORNERS_MULTI') {
        finish(message.cornersList ?? [])
        return
      }

      if (message.type === 'ERROR') {
        finish([])
      }
    }

    worker.postMessage({ type: 'INIT' })
  })
}
