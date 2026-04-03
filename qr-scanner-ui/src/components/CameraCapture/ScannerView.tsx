import { memo, useEffect, useRef, useState } from 'react'
import type { CornerQuad, FlashModeOption } from '../../types/scanner'
import { useOrientationLockAssist } from '../../hooks/useOrientationLockAssist'
import CameraSelect from './CameraSelect'
import { CornerOverlay } from './CornerOverlay'

const DETECTION_WIDTH = 640
const NO_DETECTION_TIPS_DELAY_MS = 5000

const TIPS = [
  'Çeke biraz daha yaklaşın',
  'Ortam aydınlatmasını artırın',
  'Çeki kontrast bir zemine koyun',
  'Telefonu sabit tutun',
  'Gerekirse köşeleri elle düzeltip çekin',
]

export interface ScannerViewProps {
  videoRef: React.Ref<HTMLVideoElement>
  devices: MediaDeviceInfo[]
  activeDeviceId: string | null
  onSwitchCamera: (deviceId: string) => void
  torchSupported: boolean
  torchEnabled: boolean
  torchBusy: boolean
  flashMode: string
  flashModeOptions: FlashModeOption[]
  onApplyFlashMode: (mode: string) => void
  onToggleTorch: () => void
  corners: CornerQuad | null
  isDetecting: boolean
  isStable: boolean
  workerEngine: 'opencv' | 'fallback' | null
  canCapture: boolean
  orientationPrompt: string | null
  showRotationGuide: boolean
  needsToMoveCloser: boolean
  showGuideOverlay: boolean
  instructionText?: string
  qrRequired: boolean
  qrValue: string | null
  onCapture: () => void
  onCornersChange: (corners: CornerQuad) => void
}

export const ScannerView = memo(function ScannerView({
  videoRef,
  devices,
  activeDeviceId,
  onSwitchCamera,
  torchSupported,
  torchEnabled,
  torchBusy,
  flashMode,
  flashModeOptions,
  onApplyFlashMode,
  onToggleTorch,
  corners,
  isDetecting,
  isStable,
  workerEngine,
  canCapture,
  orientationPrompt,
  showRotationGuide,
  needsToMoveCloser,
  showGuideOverlay,
  instructionText,
  qrRequired,
  qrValue,
  onCapture,
  onCornersChange,
}: ScannerViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [showTips, setShowTips] = useState(false)
  const noDetectionTimerRef = useRef<number | null>(null)

  const hasBlockingWarning = Boolean(orientationPrompt || needsToMoveCloser)
  const waitingForQr = qrRequired && !qrValue

  const {
    canRunOrientationLockCheck,
    requiresPermission,
    showHint: showOrientationLockHint,
    checkState: orientationLockCheckState,
    runOrientationLockCheck,
  } = useOrientationLockAssist(showRotationGuide)

  useEffect(() => {
    const updateSize = (): void => {
      if (!containerRef.current) {
        return
      }

      setDisplaySize({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!showGuideOverlay) {
      setShowTips(false)
      if (noDetectionTimerRef.current !== null) {
        window.clearTimeout(noDetectionTimerRef.current)
      }
      return
    }

    if (hasBlockingWarning) {
      setShowTips(false)
      if (noDetectionTimerRef.current !== null) {
        window.clearTimeout(noDetectionTimerRef.current)
      }
      return
    }

    if (isDetecting) {
      setShowTips(false)
      if (noDetectionTimerRef.current !== null) {
        window.clearTimeout(noDetectionTimerRef.current)
      }
      return
    }

    noDetectionTimerRef.current = window.setTimeout(() => {
      setShowTips(true)
    }, NO_DETECTION_TIPS_DELAY_MS)

    return () => {
      if (noDetectionTimerRef.current !== null) {
        window.clearTimeout(noDetectionTimerRef.current)
      }
    }
  }, [hasBlockingWarning, isDetecting, showGuideOverlay])

  const videoElement = containerRef.current?.querySelector('video')
  const videoWidth = videoElement?.videoWidth || 1920
  const videoHeight = videoElement?.videoHeight || 1080
  const detectionHeight = Math.round(DETECTION_WIDTH * (videoHeight / videoWidth))

  const defaultStatus = waitingForQr
    ? {
        text: isStable
          ? 'QR kod bekleniyor...'
          : 'QR kodu kamera ile okutun',
        cls: 'border border-amber-400/40 bg-amber-500/18 text-amber-200',
      }
    : isStable
      ? {
          text: 'Hazır - çekim tuşuna dokunun',
          cls: 'border border-green-500/50 bg-green-500/20 text-green-300',
        }
      : isDetecting
        ? {
            text: 'Sabit tutun...',
            cls: 'border border-blue-500/50 bg-blue-500/20 text-blue-300',
          }
        : {
            text: showGuideOverlay
              ? 'Çek algılanıyor...'
              : 'Fotoğraf için butona dokunun',
            cls: 'bg-black/50 text-white/70',
          }

  const blockingStatus = orientationPrompt
    ? {
        text: orientationPrompt,
        cls: 'border border-amber-400/40 bg-amber-500/18 text-amber-200',
      }
    : needsToMoveCloser
      ? {
          text: 'Kılavuzu dolduracak kadar yaklaşın',
          cls: 'border border-amber-400/40 bg-amber-500/18 text-amber-200',
        }
      : null

  const resolvedStatus = blockingStatus || defaultStatus

  const innerClass = !canCapture && (orientationPrompt || needsToMoveCloser)
    ? 'capture-inner-blocked'
    : isStable
      ? 'capture-inner-stable'
      : isDetecting
        ? 'capture-inner-detecting'
        : 'capture-inner-idle'

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    >
      <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

      {showGuideOverlay && !showRotationGuide ? (
        <CornerOverlay
          corners={corners}
          isStable={isStable}
          detectionWidth={DETECTION_WIDTH}
          detectionHeight={detectionHeight}
          displayWidth={displaySize.width}
          displayHeight={displaySize.height}
          interactive={false}
          onCornersChange={onCornersChange}
        />
      ) : null}

      <div className="absolute right-0 top-0 z-10 flex items-center gap-2 pr-safe pt-safe">
        {workerEngine === 'fallback' && showGuideOverlay ? (
          <span className="rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-semibold text-black">
            Fallback
          </span>
        ) : null}

        <CameraSelect
          devices={devices}
          activeDeviceId={activeDeviceId}
          onSwitch={onSwitchCamera}
          torchSupported={torchSupported}
          torchEnabled={torchEnabled}
          torchBusy={torchBusy}
          flashMode={flashMode}
          flashModeOptions={flashModeOptions}
          onApplyFlashMode={onApplyFlashMode}
          onToggleTorch={onToggleTorch}
        />
      </div>

      <div
        className={`absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${resolvedStatus.cls}`}
        style={{ top: '18%' }}
      >
        {resolvedStatus.text}
      </div>

      {instructionText ? (
        <div className="pointer-events-none absolute left-1/2 top-[25%] z-10 w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-white/12 bg-black/55 px-4 py-3 text-center backdrop-blur-md">
          <p className="text-sm font-semibold text-white">{instructionText}</p>
          {qrRequired ? (
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              {qrValue ? `QR: ${qrValue}` : 'QR okunmadan çekim butonu aktif olmaz.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {(orientationPrompt || needsToMoveCloser) && showGuideOverlay ? (
        <div
          className="absolute left-1/2 z-10 w-[min(92vw,380px)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/12 bg-black/55 px-4 py-3 text-center backdrop-blur-md"
          style={{ top: '26%' }}
        >
          <p className="text-sm font-semibold text-white">
            {orientationPrompt || 'Telefonu çeke doğru yaklaştırın'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">
            {orientationPrompt
              ? 'Telefonu yatay konuma çevirin. Kılavuz ardından görünecek.'
              : 'Algılanan çek kılavuzu doldurduğunda çekim aktif olur.'}
          </p>
        </div>
      ) : null}

      {showRotationGuide && showGuideOverlay ? (
        <RotateGuide
          canRunOrientationLockCheck={canRunOrientationLockCheck}
          orientationLockCheckState={orientationLockCheckState}
          requiresPermission={requiresPermission}
          runOrientationLockCheck={runOrientationLockCheck}
          showOrientationLockHint={showOrientationLockHint}
        />
      ) : null}

      {showTips && showGuideOverlay ? (
        <div
          className="tips-appear glass absolute left-1/2 z-20 min-w-[240px] max-w-xs -translate-x-1/2 rounded-xl border border-white/12 bg-black/70 px-5 py-4"
          style={{ bottom: '160px' }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/50">
            Çek algılanamadı
          </p>
          <ul className="list-disc pl-4 text-sm leading-loose text-white">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center py-6 pb-safe">
        <button
          type="button"
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-transparent transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
          onClick={onCapture}
          disabled={!canCapture}
          aria-label="Çek fotoğrafı çek"
        >
          <span
            className={`block h-[58px] w-[58px] rounded-full transition-colors duration-300 ${innerClass}`}
          />
        </button>
      </div>
    </div>
  )
})

interface RotateGuideProps {
  canRunOrientationLockCheck: boolean
  orientationLockCheckState: 'idle' | 'checking' | 'lock_likely' | 'rotate_more'
  requiresPermission: boolean
  runOrientationLockCheck: () => Promise<void>
  showOrientationLockHint: boolean
}

function RotateGuide({
  canRunOrientationLockCheck,
  orientationLockCheckState,
  requiresPermission,
  runOrientationLockCheck,
  showOrientationLockHint,
}: RotateGuideProps) {
  const assistMessage =
    orientationLockCheckState === 'lock_likely'
      ? 'Telefon yatay olsa da tarayıcı portrait kilidinde olabilir. Kontrol merkezinden Portrait Orientation Lock kapatın.'
      : orientationLockCheckState === 'rotate_more'
        ? 'Sensör telefonu hâlâ dik görüyor. Cihazı biraz daha yatay döndürün.'
        : 'Dönme takılı kalıyorsa Portrait Orientation Lock ayarını kapatıp tekrar deneyin.'

  const buttonLabel =
    orientationLockCheckState === 'checking'
      ? 'Kontrol ediliyor...'
      : orientationLockCheckState === 'lock_likely'
        ? 'Tekrar kontrol et'
        : 'Kilidi kontrol et'

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-6">
      <div className="rotate-guide-card pointer-events-auto">
        <div className="rotate-device-stage" aria-hidden="true">
          <div className="rotate-device-arrow" />
          <div className="rotate-device-shell">
            <div className="rotate-device-speaker" />
            <div className="rotate-device-screen" />
          </div>
        </div>

        <p className="text-base font-semibold text-white">Telefonu yatay konuma çevirin</p>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Telefonu saat yönünde döndürün. Yeniden dik konuma gelirseniz tarama durur.
        </p>

        {showOrientationLockHint ? (
          <div className="mt-4 rounded-2xl border border-amber-400/28 bg-amber-500/10 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/90">
              Dönüş Yardımı
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-50/85">{assistMessage}</p>

            {canRunOrientationLockCheck ? (
              <button
                type="button"
                className="mt-3 inline-flex min-h-[42px] items-center justify-center rounded-xl border border-white/14 bg-white/10 px-4 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                onClick={() => {
                  void runOrientationLockCheck()
                }}
                disabled={orientationLockCheckState === 'checking'}
              >
                {buttonLabel}
              </button>
            ) : null}

            {!canRunOrientationLockCheck && requiresPermission ? (
              <p className="mt-3 text-xs text-amber-100/80">
                Bu kontrol cihaz sensör izni gerektirir.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ScannerView
