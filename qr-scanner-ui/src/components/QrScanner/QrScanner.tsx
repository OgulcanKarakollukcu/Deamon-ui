import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from '../../hooks/useCamera'
import { useQrDecoder } from '../../hooks/useQrDecoder'

export interface QrScannerProps {
  onResult: (value: string) => void
  onError?: (error: string) => void
}

export function QrScanner({ onResult, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [detected, setDetected] = useState<string | null>(null)

  const { ready, error } = useCamera(videoRef)

  const handleDetected = useCallback(
    (value: string): void => {
      setDetected(value)
      onResult(value)

      if (
        typeof navigator !== 'undefined' &&
        'vibrate' in navigator &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(200)
      }
    },
    [onResult],
  )

  useQrDecoder({
    videoRef,
    canvasRef,
    enabled: ready && detected === null,
    onDetected: handleDetected,
  })

  useEffect(() => {
    if (error && onError) {
      onError(error)
    }
  }, [error, onError])

  const handleReset = useCallback((): void => {
    setDetected(null)
  }, [])

  const overlayBorderClass = detected
    ? 'border-emerald-400 shadow-[0_0_0_1px_rgba(74,222,128,0.6),0_0_26px_rgba(74,222,128,0.5)]'
    : 'border-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.26)]'

  const cornerClass = detected ? 'bg-emerald-400' : 'bg-white'

  return (
    <section className="relative mx-auto aspect-square w-full max-w-[26rem] overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-slate-950/60">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
        <div
          className={`relative aspect-square w-full max-w-[18rem] rounded-2xl border transition-all duration-300 ${overlayBorderClass}`}
        >
          <span
            className={`absolute -left-0.5 -top-0.5 h-8 w-1.5 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -left-0.5 -top-0.5 h-1.5 w-8 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -right-0.5 -top-0.5 h-8 w-1.5 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -right-0.5 -top-0.5 h-1.5 w-8 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -bottom-0.5 -left-0.5 h-8 w-1.5 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -bottom-0.5 -left-0.5 h-1.5 w-8 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-8 w-1.5 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-8 rounded-full transition-colors duration-300 ${cornerClass}`}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent px-5 pb-5 pt-14">
        {detected ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-emerald-200">Kod algılandı</p>
            <p className="text-xl font-bold leading-snug text-emerald-100">
              {detected}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-emerald-300/60 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/25"
            >
              Yeniden Tara
            </button>
          </div>
        ) : (
          <p className="pointer-events-none text-sm font-medium text-slate-100">
            DataMatrix veya QR kodu rehbere hizalayın
          </p>
        )}
      </div>

      {error ? (
        <div className="absolute left-4 right-4 top-4 rounded-lg border border-red-500/60 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-100">
          {error}
        </div>
      ) : null}
    </section>
  )
}

export default QrScanner
