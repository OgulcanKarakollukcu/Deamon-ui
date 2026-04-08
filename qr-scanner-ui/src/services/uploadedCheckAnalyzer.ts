import type { CornerQuad } from '../types/scanner'
import { scaleCorners } from '../utils/scanner/geometry'
import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader'

const TARGET_FORMATS: ReadInputBarcodeFormat[] = ['DataMatrix', 'QRCode']
const MAX_QR_IMAGE_EDGE = 1600
const PROCESSING_IMAGE_EDGE = 2200
const DETECTION_IMAGE_EDGE = 640
const DETECT_TIMEOUT_MS = 7000

interface WorkerReadyMessage {
  type: 'READY'
}

interface WorkerCornersMessage {
  type: 'CORNERS'
  corners: CornerQuad | null
}

interface WorkerErrorMessage {
  type: 'ERROR'
}

type DetectionWorkerMessage =
  | WorkerReadyMessage
  | WorkerCornersMessage
  | WorkerErrorMessage

export interface UploadedCheckAnalysisResult {
  dataUrl: string
  qrValue: string | null
  draft: UploadedCheckDraft
}

export interface UploadedCheckDraft {
  sourceCanvas: HTMLCanvasElement
  previewDataURL: string
  width: number
  height: number
  detectedCorners: CornerQuad | null
}

/**
 * Analyses an uploaded image and returns cheque/QR detection output.
 */
export async function analyzeUploadedCheckImage(
  file: File,
): Promise<UploadedCheckAnalysisResult> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(file)

  try {
    const qrValue = await decodeQrValueWithRotationFallback(image)
    const draft = await buildDraftWithRotationFallback(image)

    return {
      dataUrl,
      qrValue,
      draft,
    }
  } finally {
    URL.revokeObjectURL(image.src)
  }
}

/**
 * Reads file bytes as a data URL for UI preview.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Yuklenen dosya okunamadi.'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => {
      reject(new Error('Yuklenen dosya okunamadi.'))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Creates an image element from local file for canvas processing.
 */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Yuklenen gorsel acilamadi.'))
    image.src = objectUrl
  })
}

/**
 * Draws an image into canvas and returns pixels as ImageData.
 */
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

  // Draw with rotation into a pre-sized canvas (scaled to keep processing fast).
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
  return {
    canvas,
    imageData: context.getImageData(0, 0, targetWidth, targetHeight),
  }
}

async function decodeQrValueWithRotationFallback(
  image: HTMLImageElement,
): Promise<string | null> {
  for (const rotationDegrees of [0, 90, 180, 270] as const) {
    const { imageData } = renderImageToCanvas(image, MAX_QR_IMAGE_EDGE, rotationDegrees)
    const value = await decodeQrValue(imageData)
    if (value) {
      return value
    }
  }

  return null
}

async function buildDraftWithRotationFallback(
  image: HTMLImageElement,
): Promise<UploadedCheckDraft> {
  let fallback: UploadedCheckDraft | null = null

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

    const detectedCornersOnDetection = await detectChequeCorners(detectionImageData)
    const detectedCorners = detectedCornersOnDetection
      ? scaleCorners(
          detectedCornersOnDetection,
          detectionCanvas.width,
          detectionCanvas.height,
          processingCanvas.width,
          processingCanvas.height,
        )
      : null

    const previewDataURL = processingCanvas.toDataURL('image/jpeg', 0.92)

    const draft: UploadedCheckDraft = {
      sourceCanvas: processingCanvas,
      previewDataURL,
      width: processingCanvas.width,
      height: processingCanvas.height,
      detectedCorners,
    }

    if (!fallback) {
      fallback = draft
    }

    if (detectedCorners) {
      return draft
    }
  }

  // If auto-detection fails, still return a draft so the user can adjust manually.
  return (
    fallback ?? {
      sourceCanvas: document.createElement('canvas'),
      previewDataURL: '',
      width: 0,
      height: 0,
      detectedCorners: null,
    }
  )
}

/**
 * Decodes QR/DataMatrix text from ImageData with zxing-wasm.
 */
async function decodeQrValue(imageData: ImageData): Promise<string | null> {
  const { readBarcodesFromImageData } = await import('zxing-wasm/reader')
  const results = await readBarcodesFromImageData(imageData, {
    formats: TARGET_FORMATS,
  })

  const value = results[0]?.text?.trim()
  if (!value) {
    return null
  }
  return value
}

/**
 * Detects cheque-like rectangular bounds using existing worker pipeline.
 */
function detectChequeCorners(imageData: ImageData): Promise<CornerQuad | null> {
  return new Promise((resolve) => {
    // Align with the runtime worker usage in hooks (non-module worker).
    const worker = new Worker(new URL('../workers/scanner.worker.js', import.meta.url), {
      name: 'scanner-upload-worker',
    })
    let completed = false

    const finish = (detectedCorners: CornerQuad | null): void => {
      if (completed) {
        return
      }
      completed = true
      window.clearTimeout(timeoutId)
      worker.terminate()
      resolve(detectedCorners)
    }

    const timeoutId = window.setTimeout(() => {
      finish(null)
    }, DETECT_TIMEOUT_MS)

    worker.onerror = () => {
      finish(null)
    }

    worker.onmessage = (event: MessageEvent<DetectionWorkerMessage>) => {
      const message = event.data
      if (message.type === 'READY') {
        // For uploads, correctness > micro-optimizations; avoid transferring the buffer,
        // because some environments fail to clone/transfer ImageData reliably.
        worker.postMessage({
          type: 'DETECT',
          imageData,
          width: imageData.width,
          height: imageData.height,
        })
        return
      }

      if (message.type === 'CORNERS') {
        const corners = message.corners
        if (corners && corners.length === 4) {
          finish(corners)
          return
        }
        finish(null)
        return
      }

      if (message.type === 'ERROR') {
        finish(null)
      }
    }

    worker.postMessage({ type: 'INIT' })
  })
}
