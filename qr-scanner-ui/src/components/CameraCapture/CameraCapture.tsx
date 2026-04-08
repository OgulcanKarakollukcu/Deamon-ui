import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useEdgeDetection } from '../../hooks/useEdgeDetection'
import {
  captureFullFrame,
  useImageProcessing,
} from '../../hooks/useImageProcessing'
import { useQrDecoder } from '../../hooks/useQrDecoder'
import { analyzeUploadedCheckImage } from '../../services/uploadedCheckAnalyzer'
import { useScannerCamera } from '../../hooks/useScannerCamera'
import type { CaptureDraft, EnhancementMode, ProcessedCapture } from '../../types/scanner'
import { createGuideCorners, quadEdgeLengths } from '../../utils/scanner/geometry'
import AdjustScreen from './AdjustScreen'
import ScannerView from './ScannerView'

const DETECTION_WIDTH = 640
const MIN_CAPTURE_EDGE_RATIO = 0.92

type CaptureState = 'loading' | 'scanning' | 'adjusting' | 'preview' | 'error'

export interface CameraCaptureProps {
  onCapture: (dataUrl: string, qrValue?: string) => void
  onError?: (error: string) => void
  instructionText?: string
  showOverlay?: boolean
  qrRequired?: boolean
}

function resolveCaptureErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Fotoğraf alınamadı. Lütfen tekrar deneyin.'
}

export function CameraCapture({
  onCapture,
  onError,
  instructionText,
  showOverlay = true,
  qrRequired = true,
}: CameraCaptureProps) {
  const documentMode = showOverlay
  const shouldRequireQr = documentMode && qrRequired

  const [captureState, setCaptureState] = useState<CaptureState>('loading')
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null)
  const [processedCapture, setProcessedCapture] = useState<ProcessedCapture | null>(null)
  const [rawCaptureDataUrl, setRawCaptureDataUrl] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [liveQrValue, setLiveQrValue] = useState<string | null>(null)

  const capturePendingRef = useRef(false)
  const localCornersRef = useRef(captureDraft?.corners ?? null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadAnalyzing, setIsUploadAnalyzing] = useState(false)

  const {
    videoRef,
    setVideoRef,
    devices,
    activeDeviceId,
    switchCamera,
    restartCamera,
    error: cameraError,
    isReady,
    torchSupported,
    torchEnabled,
    torchBusy,
    flashMode,
    flashModeOptions,
    applyFlashMode,
    toggleTorch,
  } = useScannerCamera()

  const {
    corners,
    isDetecting,
    isStable,
    workerReady,
    workerEngine,
    reset: resetDetection,
  } = useEdgeDetection(videoRef, isReady, documentMode)

  const {
    createCaptureDraft,
    processCapturedFrame,
    reprocessWithMode,
    isProcessing,
    enhancementMode,
    setEnhancementMode,
  } = useImageProcessing(videoRef)

  const videoElement = videoRef.current
  const videoWidth = videoElement?.videoWidth || 1920
  const videoHeight = videoElement?.videoHeight || 1080
  const detectionHeight = Math.round(DETECTION_WIDTH * (videoHeight / videoWidth))

  const guideCorners = useMemo(
    () => createGuideCorners(DETECTION_WIDTH, detectionHeight),
    [detectionHeight],
  )

  const guideEdges = documentMode ? quadEdgeLengths(guideCorners) : null
  const detectedEdges = documentMode && corners ? quadEdgeLengths(corners) : null

  const isOrientationReady = true
  const isCloseEnough = Boolean(
    !documentMode ||
      (detectedEdges &&
        guideEdges &&
        detectedEdges.top >= guideEdges.top * MIN_CAPTURE_EDGE_RATIO &&
        detectedEdges.bottom >= guideEdges.bottom * MIN_CAPTURE_EDGE_RATIO &&
        detectedEdges.left >= guideEdges.left * MIN_CAPTURE_EDGE_RATIO &&
        detectedEdges.right >= guideEdges.right * MIN_CAPTURE_EDGE_RATIO),
  )

  const needsToMoveCloser =
    documentMode && isOrientationReady && Boolean(corners) && !isCloseEnough

  const orientationPrompt = null

  const canCapture =
    captureState === 'scanning' &&
    (documentMode
      ? isStable &&
        !orientationPrompt &&
        !needsToMoveCloser &&
        (!shouldRequireQr || Boolean(liveQrValue))
      : isReady)

  const capturedPreviewDataUrl = processedCapture?.dataURL ?? rawCaptureDataUrl

  useQrDecoder({
    videoRef,
    canvasRef: qrCanvasRef,
    enabled:
      shouldRequireQr &&
      captureState === 'scanning' &&
      isReady &&
      liveQrValue === null,
    onDetected: (value: string) => {
      setLiveQrValue(value)
      if (
        typeof navigator !== 'undefined' &&
        'vibrate' in navigator &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(160)
      }
    },
  })

  useEffect(() => {
    if (captureState === 'loading') {
      if (documentMode) {
        if (isReady && workerReady) {
          setCaptureState('scanning')
        }
        return
      }

      if (isReady) {
        setCaptureState('scanning')
      }
    }
  }, [captureState, documentMode, isReady, workerReady])

  useEffect(() => {
    if (!cameraError) {
      return
    }

    setCaptureState('error')
    setCaptureError(cameraError.message)
    if (onError) {
      onError(cameraError.message)
    }
  }, [cameraError, onError])

  useEffect(() => {
    if (corners) {
      localCornersRef.current = corners
    }
  }, [corners])

  useEffect(() => {
    if (!documentMode || captureState !== 'scanning' || isOrientationReady) {
      return
    }

    localCornersRef.current = null
    resetDetection()
  }, [captureState, documentMode, isOrientationReady, resetDetection])

  useEffect(() => {
    if (captureState !== 'scanning') {
      capturePendingRef.current = false
    }
  }, [captureState])

  const handleCapture = useCallback((): void => {
    if (!canCapture || capturePendingRef.current) {
      return
    }

    if (shouldRequireQr && !liveQrValue) {
      const message = 'QR kod okunmadan çekim yapılamaz.'
      setCaptureError(message)
      if (onError) {
        onError(message)
      }
      return
    }

    capturePendingRef.current = true
    setCaptureError(null)

    try {
      if (documentMode) {
        const currentCorners = localCornersRef.current ?? guideCorners
        localCornersRef.current = currentCorners

        const draft = createCaptureDraft(
          currentCorners,
          DETECTION_WIDTH,
          detectionHeight,
        )

        setCaptureDraft(draft)
        setCaptureState('adjusting')
        return
      }

      const currentVideo = videoRef.current
      if (!currentVideo) {
        throw new Error('Kamera görüntüsü henüz hazır değil.')
      }

      const dataUrl = captureFullFrame(currentVideo)
      setRawCaptureDataUrl(dataUrl)
      setProcessedCapture(null)
      setCaptureState('preview')
    } catch (error: unknown) {
      capturePendingRef.current = false
      const message = resolveCaptureErrorMessage(error)
      setCaptureError(message)
      if (onError) {
        onError(message)
      }
    }
  }, [
    canCapture,
    createCaptureDraft,
    detectionHeight,
    documentMode,
    guideCorners,
    liveQrValue,
    onError,
    shouldRequireQr,
    videoRef,
  ])

  const handleConfirmAdjustment = useCallback(
    async (adjustedCorners: typeof guideCorners): Promise<void> => {
      if (!captureDraft?.sourceCanvas) {
        return
      }

      try {
        const result = await processCapturedFrame(
          captureDraft.sourceCanvas,
          adjustedCorners,
        )

        setProcessedCapture(result)
        setRawCaptureDataUrl(null)
        setCaptureDraft(null)
        setCaptureState('preview')
      } catch (error: unknown) {
        const message = resolveCaptureErrorMessage(error)
        setCaptureError(message)
        if (onError) {
          onError(message)
        }
      }
    },
    [captureDraft, onError, processCapturedFrame],
  )

  const handleRetake = useCallback((): void => {
    capturePendingRef.current = false
    setCaptureDraft(null)
    setProcessedCapture(null)
    setRawCaptureDataUrl(null)
    setCaptureError(null)
    setLiveQrValue(null)
    localCornersRef.current = null
    resetDetection()
    setCaptureState('scanning')
  }, [resetDetection])

  const handleUseCapturedPhoto = useCallback((): void => {
    if (!capturedPreviewDataUrl) {
      return
    }

    if (shouldRequireQr && !liveQrValue) {
      const message = 'QR doğrulanamadı. Lütfen tekrar çekin.'
      setCaptureError(message)
      if (onError) {
        onError(message)
      }
      return
    }

    onCapture(capturedPreviewDataUrl, liveQrValue ?? undefined)
  }, [capturedPreviewDataUrl, liveQrValue, onCapture, onError, shouldRequireQr])

  const handleReprocess = useCallback(
    async (mode: EnhancementMode): Promise<void> => {
      setEnhancementMode(mode)

      try {
        const result = await reprocessWithMode(mode)
        if (result) {
          setProcessedCapture(result)
        }
      } catch (error: unknown) {
        const message = resolveCaptureErrorMessage(error)
        setCaptureError(message)
        if (onError) {
          onError(message)
        }
      }
    },
    [onError, reprocessWithMode, setEnhancementMode],
  )

  const handleRetryCamera = useCallback((): void => {
    setCaptureError(null)
    setCaptureState('loading')
    void restartCamera().catch((error: unknown) => {
      const message = resolveCaptureErrorMessage(error)
      setCaptureError(message)
      if (onError) {
        onError(message)
      }
      setCaptureState('error')
    })
  }, [onError, restartCamera])

  const handlePickImage = useCallback((): void => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file) {
        return
      }

      if (!file.type.startsWith('image/')) {
        const message = 'Lutfen gecerli bir resim dosyasi yukleyin.'
        setCaptureError(message)
        if (onError) {
          onError(message)
        }
        return
      }

      setIsUploadAnalyzing(true)
      setCaptureError(null)

      try {
        const analysis = await analyzeUploadedCheckImage(file)
        if (!analysis.draft.previewDataURL || !analysis.draft.width || !analysis.draft.height) {
          const message = 'Yuklenen resim islenemedi. Baska bir resim deneyin.'
          setCaptureError(message)
          if (onError) {
            onError(message)
          }
          return
        }

        const initialCorners =
          analysis.draft.detectedCorners ?? createGuideCorners(analysis.draft.width, analysis.draft.height)

        setProcessedCapture(null)
        setRawCaptureDataUrl(null)
        setCaptureDraft({
          sourceCanvas: analysis.draft.sourceCanvas,
          previewDataURL: analysis.draft.previewDataURL,
          width: analysis.draft.width,
          height: analysis.draft.height,
          corners: initialCorners,
        })
        setLiveQrValue(analysis.qrValue)
        setCaptureState('adjusting')

        if (!analysis.draft.detectedCorners) {
          setCaptureError('Cek otomatik algilanamadi. Koseleri elle duzeltin.')
        }
      } catch (error: unknown) {
        const message = resolveCaptureErrorMessage(error)
        setCaptureError(message)
        if (onError) {
          onError(message)
        }
      } finally {
        setIsUploadAnalyzing(false)
      }
    },
    [onError],
  )

  if (captureState === 'error') {
    return (
      <section className="flex h-[100dvh] w-full items-center justify-center bg-black px-6">
        <div className="max-w-sm space-y-4 text-center">
          <p className="text-3xl">📷</p>
          <h2 className="text-lg font-semibold text-white">Kamera Hatası</h2>
          <p className="text-sm leading-relaxed text-white/70">
            {captureError || cameraError?.message || 'Kamera başlatılamadı.'}
          </p>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            onClick={handleRetryCamera}
          >
            Tekrar Dene
          </button>
        </div>
      </section>
    )
  }

  if (captureState === 'loading') {
    return (
      <section className="relative h-[100dvh] w-full overflow-hidden bg-black">
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-emerald-500" />
          <p className="text-lg font-semibold text-white">
            {!isReady && !workerReady && documentMode
              ? 'Kamera ve tarayıcı başlatılıyor...'
              : !isReady
                ? 'Kamera başlatılıyor...'
                : 'Tarayıcı motoru hazırlanıyor...'}
          </p>
          {documentMode && workerEngine ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/75">
              Motor: {workerEngine === 'opencv' ? 'OpenCV.js' : 'Yerel Fallback'}
            </span>
          ) : null}
        </div>
      </section>
    )
  }

  if (captureState === 'adjusting' && captureDraft) {
    return (
      <section className="relative h-[100dvh] w-full overflow-hidden bg-black">
        <AdjustScreen
          imageSrc={captureDraft.previewDataURL}
          sourceWidth={captureDraft.width}
          sourceHeight={captureDraft.height}
          initialCorners={captureDraft.corners}
          isProcessing={isProcessing}
          onRetake={handleRetake}
          onConfirm={(cornersValue) => {
            void handleConfirmAdjustment(cornersValue)
          }}
        />
        {captureError ? (
          <div className="absolute left-4 right-4 top-4 z-30 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            {captureError}
          </div>
        ) : null}
      </section>
    )
  }

  if (captureState === 'preview' && capturedPreviewDataUrl) {
    const captureHasQr = !shouldRequireQr || Boolean(liveQrValue)

    return (
      <section className="flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white">
        <div className="relative flex-1 overflow-hidden bg-neutral-950">
          <img
            src={capturedPreviewDataUrl}
            alt="Yakalanan çek önizleme"
            className="h-full w-full object-contain"
          />

          {isProcessing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-emerald-500" />
              <p className="text-sm text-white/70">Görüntü güncelleniyor...</p>
            </div>
          ) : null}
        </div>

        {documentMode ? (
          <div className="border-t border-white/10 bg-black/80 px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              {(['color', 'enhanced', 'bw'] as EnhancementMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-[44px] rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                    enhancementMode === mode
                      ? 'bg-emerald-600 text-white'
                      : 'border border-white/12 bg-white/8 text-white/70 hover:bg-white/15'
                  }`}
                  onClick={() => {
                    void handleReprocess(mode)
                  }}
                  disabled={isProcessing}
                >
                  {mode === 'color'
                    ? 'Renkli'
                    : mode === 'enhanced'
                      ? 'Gelişmiş'
                      : 'S/B'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-white/10 bg-black/80 px-4 py-3">
          {!captureHasQr ? (
            <p className="mb-3 rounded-lg border border-amber-300/50 bg-amber-500/15 px-3 py-2 text-center text-sm text-amber-100">
              QR doğrulanamadı. Lütfen tekrar çekin.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="min-h-[48px] rounded-xl border border-white/12 bg-white/10 font-semibold text-white transition-transform active:scale-95"
              onClick={handleRetake}
            >
              Tekrar Çek
            </button>
            <button
              type="button"
              className="min-h-[48px] rounded-xl bg-emerald-600 font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={handleUseCapturedPhoto}
              disabled={!captureHasQr}
            >
              Bu Fotoğrafı Kullan
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="h-[100dvh] w-full overflow-hidden bg-black">
      <ScannerView
        videoRef={setVideoRef}
        devices={devices}
        activeDeviceId={activeDeviceId}
        onSwitchCamera={switchCamera}
        torchSupported={torchSupported}
        torchEnabled={torchEnabled}
        torchBusy={torchBusy}
        flashMode={flashMode}
        flashModeOptions={flashModeOptions}
        onApplyFlashMode={(mode) => {
          void applyFlashMode(mode)
        }}
        onToggleTorch={() => {
          void toggleTorch()
        }}
        corners={corners}
        isDetecting={isDetecting}
        isStable={isStable}
        workerEngine={workerEngine}
        canCapture={canCapture}
        orientationPrompt={orientationPrompt}
        showRotationGuide={Boolean(documentMode && !isOrientationReady)}
        needsToMoveCloser={Boolean(needsToMoveCloser)}
        showGuideOverlay={documentMode}
        instructionText={instructionText}
        qrRequired={shouldRequireQr}
        qrValue={liveQrValue}
        onCapture={handleCapture}
        onCornersChange={(nextCorners) => {
          localCornersRef.current = nextCorners
        }}
      />

      <canvas ref={qrCanvasRef} className="hidden" aria-hidden="true" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleFileUpload(event)
        }}
      />

      <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2">
        <button
          type="button"
          className="min-h-[42px] rounded-xl border border-white/30 bg-black/45 px-4 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handlePickImage}
          disabled={isUploadAnalyzing}
        >
          {isUploadAnalyzing ? 'Resim analiz ediliyor...' : 'Resim Yukle'}
        </button>
      </div>

      {captureError ? (
        <div className="absolute left-4 right-4 top-4 z-30 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {captureError}
        </div>
      ) : null}
    </section>
  )
}

export default CameraCapture
