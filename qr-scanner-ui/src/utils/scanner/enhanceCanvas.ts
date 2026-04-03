import type { EnhancementMode } from '../../types/scanner'
import type { OpenCvLike } from './loadOpenCV'

type OpenCvRuntime = OpenCvLike & {
  Mat: new () => { delete: () => void }
  Size: new (width: number, height: number) => unknown
  imread: (canvas: HTMLCanvasElement) => { delete: () => void }
  imshow: (canvas: HTMLCanvasElement, mat: { delete: () => void }) => void
  cvtColor: (
    src: { delete: () => void },
    dst: { delete: () => void },
    code: number,
  ) => void
  GaussianBlur: (
    src: { delete: () => void },
    dst: { delete: () => void },
    kernelSize: unknown,
    sigmaX: number,
  ) => void
  adaptiveThreshold: (
    src: { delete: () => void },
    dst: { delete: () => void },
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    c: number,
  ) => void
  COLOR_RGBA2GRAY: number
  ADAPTIVE_THRESH_GAUSSIAN_C: number
  THRESH_BINARY: number
}

/**
 * Applies selected enhancement mode to the canvas in-place.
 */
export function applyEnhancementToCanvas(
  canvas: HTMLCanvasElement,
  mode: EnhancementMode,
  cvLib: OpenCvLike | null = null,
): void {
  if (mode === 'bw' && hasAdaptiveThreshold(cvLib)) {
    applyBwWithOpenCV(canvas, cvLib)
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  if (mode === 'color') {
    for (let index = 0; index < data.length; index += 4) {
      data[index] = clamp(((data[index] / 255 - 0.5) * 1.15 + 0.5) * 255)
      data[index + 1] = clamp(((data[index + 1] / 255 - 0.5) * 1.15 + 0.5) * 255)
      data[index + 2] = clamp(((data[index + 2] / 255 - 0.5) * 1.15 + 0.5) * 255)
    }

    ctx.putImageData(imageData, 0, 0)
    return
  }

  if (mode === 'bw') {
    let sum = 0
    for (let index = 0; index < data.length; index += 4) {
      sum +=
        data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    }

    const mean = sum / (data.length / 4)
    const threshold = mean * 0.95

    for (let index = 0; index < data.length; index += 4) {
      const gray =
        data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
      const value = gray > threshold ? 255 : 0
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
    }

    ctx.putImageData(imageData, 0, 0)
    return
  }

  if (mode === 'enhanced') {
    const min = [255, 255, 255]
    const max = [0, 0, 0]

    for (let index = 0; index < data.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        if (data[index + channel] < min[channel]) {
          min[channel] = data[index + channel]
        }

        if (data[index + channel] > max[channel]) {
          max[channel] = data[index + channel]
        }
      }
    }

    for (let index = 0; index < data.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const range = max[channel] - min[channel]
        data[index + channel] =
          range > 0
            ? clamp(((data[index + channel] - min[channel]) / range) * 255)
            : data[index + channel]
      }
    }

    ctx.putImageData(imageData, 0, 0)

    const sharpened = ctx.createImageData(canvas.width, canvas.height)
    const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const destination = sharpened.data
    const width = canvas.width
    const height = canvas.height

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4

        for (let channel = 0; channel < 3; channel += 1) {
          destination[index + channel] = clamp(
            5 * source[index + channel] -
              source[((y - 1) * width + x) * 4 + channel] -
              source[((y + 1) * width + x) * 4 + channel] -
              source[(y * width + (x - 1)) * 4 + channel] -
              source[(y * width + (x + 1)) * 4 + channel],
          )
        }

        destination[index + 3] = 255
      }
    }

    ctx.putImageData(sharpened, 0, 0)
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hasAdaptiveThreshold(cvLib: OpenCvLike | null): cvLib is OpenCvRuntime {
  return Boolean(cvLib && typeof cvLib.adaptiveThreshold === 'function')
}

function applyBwWithOpenCV(canvas: HTMLCanvasElement, cvLib: OpenCvRuntime): void {
  const src = cvLib.imread(canvas)
  const gray = new cvLib.Mat()
  const blurred = new cvLib.Mat()
  const thresholded = new cvLib.Mat()

  try {
    cvLib.cvtColor(src, gray, cvLib.COLOR_RGBA2GRAY)
    cvLib.GaussianBlur(gray, blurred, new cvLib.Size(5, 5), 0)
    cvLib.adaptiveThreshold(
      blurred,
      thresholded,
      255,
      cvLib.ADAPTIVE_THRESH_GAUSSIAN_C,
      cvLib.THRESH_BINARY,
      11,
      2,
    )
    cvLib.imshow(canvas, thresholded)
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    thresholded.delete()
  }
}
