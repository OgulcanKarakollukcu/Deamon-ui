import { useCallback, useRef, useState, type RefObject } from 'react'
import type {
  CaptureDraft,
  CornerPoint,
  CornerQuad,
  EnhancementMode,
  ProcessedCapture,
} from '../types/scanner'
import { orderCorners, quadDimensions } from '../utils/scanner/geometry'
import { applyEnhancementToCanvas } from '../utils/scanner/enhanceCanvas'
import { dewarpCanvasBilinear } from '../utils/scanner/dewarp'
import { canvasToBlob } from '../utils/scanner/imageExport'
import { loadOpenCV, type OpenCvLike } from '../utils/scanner/loadOpenCV'

const PREVIEW_MAX_DIMENSION = 1600

interface UseImageProcessingResult {
  createCaptureDraft: (
    detectionCorners: CornerQuad,
    detectionWidth: number,
    detectionHeight: number,
  ) => CaptureDraft
  processCapturedFrame: (
    sourceCanvas: HTMLCanvasElement,
    sourceCorners: CornerQuad,
  ) => Promise<ProcessedCapture>
  reprocessWithMode: (mode: EnhancementMode) => Promise<ProcessedCapture | null>
  isProcessing: boolean
  enhancementMode: EnhancementMode
  setEnhancementMode: (mode: EnhancementMode) => void
}

/**
 * Captures, dewarps and enhances cheque images.
 */
export function useImageProcessing(
  videoRef: RefObject<HTMLVideoElement>,
): UseImageProcessingResult {
  const [isProcessing, setIsProcessing] = useState(false)
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>('color')
  const rawWarpedCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const createCaptureDraft = useCallback(
    (
      detectionCorners: CornerQuad,
      detectionWidth: number,
      detectionHeight: number,
    ): CaptureDraft => {
      const videoElement = videoRef.current
      if (!videoElement) {
        throw new Error('Video element is not available')
      }

      const videoWidth = videoElement.videoWidth
      const videoHeight = videoElement.videoHeight
      const scaleX = videoWidth / detectionWidth
      const scaleY = videoHeight / detectionHeight

      const fullResolutionCorners = detectionCorners.map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
      })) as CornerQuad

      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = videoWidth
      sourceCanvas.height = videoHeight

      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) {
        throw new Error('Failed to create source canvas context')
      }
      sourceContext.drawImage(videoElement, 0, 0, videoWidth, videoHeight)

      const previewScale = Math.min(
        1,
        PREVIEW_MAX_DIMENSION / Math.max(videoWidth, videoHeight),
      )

      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = Math.max(1, Math.round(videoWidth * previewScale))
      previewCanvas.height = Math.max(1, Math.round(videoHeight * previewScale))

      const previewContext = previewCanvas.getContext('2d')
      if (!previewContext) {
        throw new Error('Failed to create preview canvas context')
      }
      previewContext.drawImage(
        sourceCanvas,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height,
      )

      return {
        sourceCanvas,
        previewDataURL: previewCanvas.toDataURL('image/jpeg', 0.86),
        width: videoWidth,
        height: videoHeight,
        corners: orderCorners(fullResolutionCorners),
      }
    },
    [videoRef],
  )

  const processCapturedFrame = useCallback(
    async (
      sourceCanvas: HTMLCanvasElement,
      sourceCorners: CornerQuad,
    ): Promise<ProcessedCapture> => {
      setIsProcessing(true)

      try {
        const ordered = orderCorners(sourceCorners)
        const { width: destinationWidth, height: destinationHeight } =
          quadDimensions(ordered)

        let cvLib: OpenCvLike | null = null
        if (enhancementMode === 'bw') {
          try {
            cvLib = await loadOpenCV()
          } catch {
          }
        }

        let rawCanvas: HTMLCanvasElement
        try {
          rawCanvas = dewarpCanvasBilinear(
            sourceCanvas,
            ordered,
            destinationWidth,
            destinationHeight,
          )
        } catch {
          rawCanvas = document.createElement('canvas')
          rawCanvas.width = sourceCanvas.width
          rawCanvas.height = sourceCanvas.height
          rawCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0)
        }

        rawWarpedCanvasRef.current = rawCanvas
        return buildResult(rawCanvas, enhancementMode, cvLib)
      } finally {
        setIsProcessing(false)
      }
    },
    [enhancementMode],
  )

  const reprocessWithMode = useCallback(
    async (mode: EnhancementMode): Promise<ProcessedCapture | null> => {
      if (!rawWarpedCanvasRef.current) {
        return null
      }

      setIsProcessing(true)
      try {
        let cvLib: OpenCvLike | null = null
        if (mode === 'bw') {
          try {
            cvLib = await loadOpenCV()
          } catch {
            cvLib = null
          }
        }

        return buildResult(rawWarpedCanvasRef.current, mode, cvLib)
      } finally {
        setIsProcessing(false)
      }
    },
    [],
  )

  return {
    createCaptureDraft,
    processCapturedFrame,
    reprocessWithMode,
    isProcessing,
    enhancementMode,
    setEnhancementMode,
  }
}

async function buildResult(
  rawCanvas: HTMLCanvasElement,
  mode: EnhancementMode,
  cvLib: OpenCvLike | null = null,
): Promise<ProcessedCapture> {
  const originalDataURL = rawCanvas.toDataURL('image/jpeg', 0.92)
  const originalBlob = await canvasToBlob(rawCanvas, 'image/jpeg', 0.92)

  const workCanvas = document.createElement('canvas')
  workCanvas.width = rawCanvas.width
  workCanvas.height = rawCanvas.height
  workCanvas.getContext('2d')?.drawImage(rawCanvas, 0, 0)

  applyEnhancementToCanvas(workCanvas, mode, cvLib)

  const blob = await canvasToBlob(workCanvas, 'image/jpeg', 0.92)
  const dataURL = workCanvas.toDataURL('image/jpeg', 0.92)

  return {
    dataURL,
    originalDataURL,
    blob,
    originalBlob,
    width: workCanvas.width,
    height: workCanvas.height,
  }
}

export function captureFullFrame(videoElement: HTMLVideoElement): string {
  const width = videoElement.videoWidth
  const height = videoElement.videoHeight

  if (!width || !height) {
    throw new Error('Video frame is not ready')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context could not be created')
  }

  context.drawImage(videoElement, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export function cornersFromPoints(points: CornerPoint[]): CornerQuad {
  return [points[0], points[1], points[2], points[3]]
}
