import { useEffect, type RefObject } from 'react'
import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader'

type ReadBarcodesFromImageData = typeof import('zxing-wasm/reader')['readBarcodesFromImageData']

const TARGET_FORMATS: ReadInputBarcodeFormat[] = ['DataMatrix', 'QRCode']

export interface UseQrDecoderOptions {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  enabled: boolean
  onDetected: (result: string) => void
}

export function useQrDecoder(options: UseQrDecoderOptions): void {
  const { videoRef, canvasRef, enabled, onDetected } = options

  useEffect(() => {
    if (!enabled) {
      return
    }

    let animationFrameId: number | null = null
    let isStopped = false
    let isDecoding = false
    let hasDetected = false
    let readBarcodesFromImageData: ReadBarcodesFromImageData | null = null

    const stopLoop = (): void => {
      isStopped = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    }

    const scheduleNextFrame = (): void => {
      if (!isStopped && !hasDetected) {
        animationFrameId = requestAnimationFrame(processFrame)
      }
    }

    const processFrame = (): void => {
      if (isStopped || hasDetected) {
        return
      }

      if (isDecoding) {
        scheduleNextFrame()
        return
      }

      const videoElement = videoRef.current
      const canvasElement = canvasRef.current

      if (!videoElement || !canvasElement) {
        scheduleNextFrame()
        return
      }

      const width = videoElement.videoWidth
      const height = videoElement.videoHeight

      if (width <= 0 || height <= 0) {
        scheduleNextFrame()
        return
      }

      if (canvasElement.width !== width) {
        canvasElement.width = width
      }
      if (canvasElement.height !== height) {
        canvasElement.height = height
      }

      const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        scheduleNextFrame()
        return
      }

      isDecoding = true

      void (async () => {
        try {
          ctx.drawImage(videoElement, 0, 0, width, height)
          const imageData = ctx.getImageData(0, 0, width, height)

          if (!readBarcodesFromImageData) {
            const readerModule = await import('zxing-wasm/reader')
            readBarcodesFromImageData = readerModule.readBarcodesFromImageData
          }

          const results = await readBarcodesFromImageData(imageData, {
            formats: TARGET_FORMATS,
          })

          if (results.length > 0) {
            const firstResult = results[0]
            hasDetected = true
            stopLoop()
            onDetected(firstResult.text)
            return
          }
        } catch (decodeError: unknown) {
          console.error('QR decode loop error:', decodeError)
        } finally {
          isDecoding = false
          if (!isStopped && !hasDetected) {
            scheduleNextFrame()
          }
        }
      })()
    }

    scheduleNextFrame()

    return () => {
      stopLoop()
    }
  }, [canvasRef, enabled, onDetected, videoRef])
}
