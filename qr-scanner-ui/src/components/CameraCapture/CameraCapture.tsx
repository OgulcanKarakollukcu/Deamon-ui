import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from '../../hooks/useCamera'

export interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void
  onError?: (error: string) => void
  instructionText?: string
  showOverlay?: boolean
}

function captureErrorMessage(): string {
  return 'Fotoğraf alınamadı. Lütfen tekrar deneyin.'
}

export function CameraCapture({
  onCapture,
  onError,
  instructionText,
  showOverlay = true,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const { ready, error: cameraError } = useCamera(videoRef)

  useEffect(() => {
    if (cameraError && onError) {
      onError(cameraError)
    }
  }, [cameraError, onError])

  const handleCapture = useCallback((): void => {
    const videoElement = videoRef.current
    const canvasElement = canvasRef.current

    if (!videoElement || !canvasElement) {
      const errorMessage = 'Kamera görüntüsü henüz hazır değil.'
      setCaptureError(errorMessage)
      if (onError) {
        onError(errorMessage)
      }
      return
    }

    const width = videoElement.videoWidth
    const height = videoElement.videoHeight

    if (width <= 0 || height <= 0) {
      const errorMessage = 'Kamera görüntüsü alınamadı. Lütfen tekrar deneyin.'
      setCaptureError(errorMessage)
      if (onError) {
        onError(errorMessage)
      }
      return
    }

    const context = canvasElement.getContext('2d')
    if (!context) {
      const errorMessage = 'Fotoğraf işlenemedi. Lütfen tekrar deneyin.'
      setCaptureError(errorMessage)
      if (onError) {
        onError(errorMessage)
      }
      return
    }

    try {
      canvasElement.width = width
      canvasElement.height = height
      context.drawImage(videoElement, 0, 0, width, height)

      const dataUrl = canvasElement.toDataURL('image/jpeg', 0.85)
      setCaptureError(null)
      onCapture(dataUrl)
    } catch (error: unknown) {
      console.error('Capture error:', error)
      const errorMessage = captureErrorMessage()
      setCaptureError(errorMessage)
      if (onError) {
        onError(errorMessage)
      }
    }
  }, [onCapture, onError])

  const visibleError = captureError ?? cameraError

  if (visibleError) {
    return (
      <section className="flex h-[calc(100vh-3.5rem)] w-full items-center justify-center bg-slate-950 px-6">
        <div className="space-y-3 text-center">
          <p className="text-3xl text-red-400">⚠</p>
          <p className="text-sm font-medium text-red-100">{visibleError}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-black">
      <div className="relative h-full w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {!ready ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
            <p className="mt-4 text-sm text-slate-400">Kamera açılıyor...</p>
          </div>
        ) : null}

        {instructionText ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mt-4 px-4">
            <p className="mx-auto max-w-xl rounded-xl bg-black/50 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-sm">
              {instructionText}
            </p>
          </div>
        ) : null}

        {showOverlay ? (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[30%] bg-black/35" />
            <div className="absolute inset-x-0 bottom-0 h-[30%] bg-black/35" />
            <div className="absolute bottom-[30%] left-0 top-[30%] w-[6%] bg-black/35" />
            <div className="absolute bottom-[30%] right-0 top-[30%] w-[6%] bg-black/35" />

            <div className="absolute left-1/2 top-1/2 h-[40%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-white/80 bg-[rgba(59,130,246,0.05)]">
              <span className="absolute -left-0.5 -top-0.5 h-4 w-4 border-l-[3px] border-t-[3px] border-[#3B82F6]" />
              <span className="absolute -right-0.5 -top-0.5 h-4 w-4 border-r-[3px] border-t-[3px] border-[#3B82F6]" />
              <span className="absolute -bottom-0.5 -left-0.5 h-4 w-4 border-b-[3px] border-l-[3px] border-[#3B82F6]" />
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 border-b-[3px] border-r-[3px] border-[#3B82F6]" />

              <p
                className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-[#93C5FD]"
                style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)' }}
              >
                Çeki çerçeveye hizalayın
              </p>
            </div>
          </div>
        ) : null}

        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        <div className="absolute inset-x-0 bottom-0 z-20 mb-8 flex justify-center">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready}
            aria-label="Fotoğraf çek"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-white/50 transition-transform duration-100 active:scale-90 disabled:opacity-40"
          >
            <span className="h-[56px] w-[56px] rounded-full bg-white" />
          </button>
        </div>
      </div>
    </section>
  )
}

export default CameraCapture
