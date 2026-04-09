import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useEdgeDetection } from '../../hooks/useEdgeDetection'
import {
  captureFullFrame,
  useImageProcessing,
} from '../../hooks/useImageProcessing'
import { useQrDecoder } from '../../hooks/useQrDecoder'
import { useYoloDetection } from '../../hooks/useYoloDetection'
import {
  analyzeUploadedChequeDraftBatch,
  type MultiChequeDraftCapture,
} from '../../services/multiChequeAnalyzer'
import { analyzeUploadedCheckImage } from '../../services/uploadedCheckAnalyzer'
import { useScannerCamera } from '../../hooks/useScannerCamera'
import type {
  CaptureDraft,
  EnhancementMode,
  GuideRegion,
  ProcessedCapture,
} from '../../types/scanner'
import { createGuideCorners } from '../../utils/scanner/geometry'
import AdjustScreen from './AdjustScreen'
import ScannerView from './ScannerView'

const DETECTION_WIDTH = 640
const DETECTION_ENGINE_STORAGE_KEY = 'qr-scanner.detection-engine'

type CaptureState = 'loading' | 'scanning' | 'adjusting' | 'preview' | 'error'
export type DetectionEngine = 'cv' | 'yolo'

interface ViewportSize {
  width: number
  height: number
}

function readPersistedDetectionEngine(): DetectionEngine {
  if (typeof window === 'undefined') return 'cv'
  return window.localStorage.getItem(DETECTION_ENGINE_STORAGE_KEY) === 'yolo'
    ? 'yolo'
    : 'cv'
}

export interface CameraCaptureProps {
  onCapture: (dataUrl: string, qrValue?: string) => void
  onCaptureMultiple?: (items: Array<{ dataUrl: string; qrValue: string }>) => void
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

function readViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: DETECTION_WIDTH, height: Math.round(DETECTION_WIDTH * 1.6) }
  }

  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  }
}

export function CameraCapture({
  onCapture,
  onCaptureMultiple,
  onError,
  instructionText,
  showOverlay = true,
  qrRequired = true,
}: CameraCaptureProps) {
  const documentMode = showOverlay
  const shouldRequireQr = documentMode && qrRequired

  const [detectionEngine, setDetectionEngine] = useState<DetectionEngine>(
    readPersistedDetectionEngine,
  )
  const persistDetectionEngine = useCallback((next: DetectionEngine): void => {
    setDetectionEngine(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DETECTION_ENGINE_STORAGE_KEY, next)
    }
  }, [])

  const [captureState, setCaptureState] = useState<CaptureState>('loading')
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null)
  const [processedCapture, setProcessedCapture] = useState<ProcessedCapture | null>(null)
  const [rawCaptureDataUrl, setRawCaptureDataUrl] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [liveQrValue, setLiveQrValue] = useState<string | null>(null)
  const [viewportSize, setViewportSize] = useState<ViewportSize>(readViewportSize)
  const [collectedCaptureDrafts, setCollectedCaptureDrafts] = useState<MultiChequeDraftCapture[]>(
    [],
  )
  const [multiQueue, setMultiQueue] = useState<MultiChequeDraftCapture[] | null>(null)
  const [multiCollected, setMultiCollected] = useState<Array<{ dataUrl: string; qrValue: string }> | null>(null)
  const [showFlashAnimation, setShowFlashAnimation] = useState(false)
  const [postCaptureToastMessage, setPostCaptureToastMessage] = useState<string | null>(null)
  // In multi-cheque mode we require the user to explicitly pick a filter per cheque
  // before allowing "Bu Ceki Ekle" (prevents accidental auto-accept).
  const [multiSelectedEnhancementMode, setMultiSelectedEnhancementMode] = useState<EnhancementMode | null>(null)

  const capturePendingRef = useRef(false)
  const localCornersRef = useRef(captureDraft?.corners ?? null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const flashTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
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

  const videoElement = videoRef.current
  const videoWidth = videoElement?.videoWidth || 1920
  const videoHeight = videoElement?.videoHeight || 1080
  const detectionHeight = Math.round(DETECTION_WIDTH * (videoHeight / videoWidth))

  const guideCorners = useMemo(
    () =>
      createGuideCorners(DETECTION_WIDTH, detectionHeight, {
        displayWidth: viewportSize.width,
        displayHeight: viewportSize.height,
        targetDisplayWidth: viewportSize.width,
        targetDisplayHeight: viewportSize.width * 0.7,
      }),
    [detectionHeight, viewportSize.height, viewportSize.width],
  )
  const guideRegion = useMemo<GuideRegion>(
    () => ({
      x: guideCorners[0].x,
      y: guideCorners[0].y,
      width: guideCorners[1].x - guideCorners[0].x,
      height: guideCorners[2].y - guideCorners[1].y,
    }),
    [guideCorners],
  )

  const cvDetection = useEdgeDetection(
    videoRef,
    isReady,
    documentMode && detectionEngine === 'cv',
  )
  const yoloDetection = useYoloDetection(
    videoRef,
    isReady,
    documentMode && detectionEngine === 'yolo',
    guideRegion,
  )
  const activeDetection = detectionEngine === 'yolo' ? yoloDetection : cvDetection
  const {
    corners,
    isDetecting,
    isStable,
    workerReady,
    workerEngine,
    reset: resetDetection,
  } = activeDetection

  const {
    createCaptureDraft,
    processCapturedFrame,
    reprocessWithMode,
    isProcessing,
    enhancementMode,
    setEnhancementMode,
  } = useImageProcessing(videoRef)

  const isOrientationReady = true
  const needsToMoveCloser = false
  const orientationPrompt = null
  const isGuideAligned =
    documentMode &&
    Boolean(corners) &&
    isStable &&
    !orientationPrompt

  const canCapture =
    captureState === 'scanning' &&
    (documentMode
      ? isGuideAligned && (!shouldRequireQr || Boolean(liveQrValue))
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
    const handleResize = (): void => {
      setViewportSize(readViewportSize())
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

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

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    },
    [],
  )

  const triggerCaptureFlash = useCallback((): void => {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current)
    }

    setShowFlashAnimation(true)
    flashTimerRef.current = window.setTimeout(() => {
      setShowFlashAnimation(false)
      flashTimerRef.current = null
    }, 260)
  }, [])

  const showPostCaptureToast = useCallback((message: string): void => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setPostCaptureToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setPostCaptureToastMessage(null)
      toastTimerRef.current = null
    }, 3600)
  }, [])

  const handleCapture = useCallback(async (): Promise<void> => {
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

        if (onCaptureMultiple) {
          const currentQr = liveQrValue?.trim()
          if (!currentQr) {
            throw new Error('QR kod okunmadan çekim yapılamaz.')
          }

          setCollectedCaptureDrafts((previous) => [...previous, { draft, qrValue: currentQr }])
          triggerCaptureFlash()
          showPostCaptureToast(
            "Çek eklendi. Başka çek varsa ona geçin, yoksa Devam Et'e basın.",
          )
          setCaptureError(null)
          setLiveQrValue(null)
          localCornersRef.current = null
          resetDetection()
          capturePendingRef.current = false
          return
        }

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
    onCaptureMultiple,
    onError,
    resetDetection,
    shouldRequireQr,
    showPostCaptureToast,
    triggerCaptureFlash,
    videoRef,
  ])

  const handleContinueMultiCapture = useCallback((): void => {
    if (!onCaptureMultiple || collectedCaptureDrafts.length < 1) {
      return
    }

    const [firstDraft] = collectedCaptureDrafts
    if (!firstDraft) {
      return
    }

    capturePendingRef.current = false
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setCaptureError(null)
    setPostCaptureToastMessage(null)
    setShowFlashAnimation(false)
    setMultiCollected([])
    setMultiQueue(collectedCaptureDrafts)
    setCollectedCaptureDrafts([])
    setCaptureDraft(firstDraft.draft)
    setProcessedCapture(null)
    setRawCaptureDataUrl(null)
    setLiveQrValue(firstDraft.qrValue)
    setMultiSelectedEnhancementMode(null)
    setCaptureState('adjusting')
  }, [collectedCaptureDrafts, onCaptureMultiple])

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
        if (multiQueue && multiCollected && onCaptureMultiple) {
          // Force explicit filter selection for each cheque in the multi flow.
          setMultiSelectedEnhancementMode(null)
        }
        setCaptureState('preview')
      } catch (error: unknown) {
        const message = resolveCaptureErrorMessage(error)
        setCaptureError(message)
        if (onError) {
          onError(message)
        }
      }
    },
    [captureDraft, multiCollected, multiQueue, onCaptureMultiple, onError, processCapturedFrame],
  )

  const handleRetake = useCallback((): void => {
    capturePendingRef.current = false
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setCaptureDraft(null)
    setProcessedCapture(null)
    setRawCaptureDataUrl(null)
    setCaptureError(null)
    setLiveQrValue(null)
    setCollectedCaptureDrafts([])
    setMultiQueue(null)
    setMultiCollected(null)
    setMultiSelectedEnhancementMode(null)
    setShowFlashAnimation(false)
    setPostCaptureToastMessage(null)
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

    if (multiQueue && multiCollected && onCaptureMultiple) {
      const currentQr = liveQrValue?.trim()
      if (!currentQr) {
        return
      }

      const nextCollected = [...multiCollected, { dataUrl: capturedPreviewDataUrl, qrValue: currentQr }]

      if (multiQueue.length <= 1) {
        // Finish multi-review: push all at once into the session.
        setMultiQueue(null)
        setMultiCollected(null)
        setCollectedCaptureDrafts([])
        onCaptureMultiple(nextCollected)
        return
      }

      const [, ...rest] = multiQueue
      const next = rest[0]
      if (!next) {
        setMultiQueue(null)
        setMultiCollected(null)
        setCollectedCaptureDrafts([])
        onCaptureMultiple(nextCollected)
        return
      }

      setMultiCollected(nextCollected)
      setMultiQueue(rest)
      setCaptureDraft(next.draft)
      setProcessedCapture(null)
      setRawCaptureDataUrl(null)
      setLiveQrValue(next.qrValue)
      setCaptureError(null)
      setMultiSelectedEnhancementMode(null)
      setCaptureState('adjusting')
      return
    }

    onCapture(capturedPreviewDataUrl, liveQrValue ?? undefined)
  }, [capturedPreviewDataUrl, liveQrValue, multiCollected, multiQueue, onCapture, onCaptureMultiple, onError, shouldRequireQr])

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
        if (onCaptureMultiple) {
          const drafts = await analyzeUploadedChequeDraftBatch(file, {
            engine: detectionEngine,
          })
          if (drafts.length >= 2) {
            setCollectedCaptureDrafts([])
            setMultiCollected([])
            setMultiQueue(drafts)
            setCaptureDraft(drafts[0].draft)
            setProcessedCapture(null)
            setRawCaptureDataUrl(null)
            setLiveQrValue(drafts[0].qrValue)
            setCaptureError('Birden fazla cek bulundu. Her cek icin koseleri duzeltip filtreyi secin.')
            setMultiSelectedEnhancementMode(null)
            setPostCaptureToastMessage(null)
            setShowFlashAnimation(false)
            setCaptureState('adjusting')
            return
          }
        }

        const analysis = await analyzeUploadedCheckImage(file, {
          engine: detectionEngine,
        })
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
    [detectionEngine, onCaptureMultiple, onError],
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
              Motor:{' '}
              {workerEngine === 'opencv'
                ? 'OpenCV.js'
                : workerEngine === 'yolo'
                  ? 'YOLO (TFJS)'
                  : 'Yerel Fallback'}
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
        {multiQueue && multiCollected ? (
          <div className="absolute bottom-4 left-4 z-30 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-semibold text-white/85 backdrop-blur">
            Çek {multiCollected.length + 1}/{multiCollected.length + multiQueue.length}
          </div>
        ) : null}
      </section>
    )
  }

  if (captureState === 'preview' && capturedPreviewDataUrl) {
    const captureHasQr = !shouldRequireQr || Boolean(liveQrValue)
    const inMultiReview = Boolean(multiQueue && multiCollected && onCaptureMultiple)
    const needsFilterChoice = inMultiReview && multiSelectedEnhancementMode === null

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
            {needsFilterChoice ? (
              <p className="mb-2 rounded-lg border border-amber-300/50 bg-amber-500/15 px-3 py-2 text-center text-sm text-amber-100">
                Bu çek için filtre seçin (Renkli / Gelişmiş / S/B). Seçmeden ekleyemezsiniz.
              </p>
            ) : null}
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
                    setMultiSelectedEnhancementMode(mode)
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
              {inMultiReview ? 'Iptal' : 'Tekrar Çek'}
            </button>
            <button
              type="button"
              className="min-h-[48px] rounded-xl bg-emerald-600 font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={handleUseCapturedPhoto}
              disabled={!captureHasQr || needsFilterChoice}
            >
              {inMultiReview ? 'Bu Çeki Ekle' : 'Bu Fotoğrafı Kullan'}
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
        isDetecting={isDetecting}
        isGuideAligned={Boolean(isGuideAligned)}
        workerEngine={workerEngine}
        detectionEngine={detectionEngine}
        onToggleDetectionEngine={() => {
          cvDetection.reset()
          yoloDetection.reset()
          localCornersRef.current = null
          persistDetectionEngine(detectionEngine === 'yolo' ? 'cv' : 'yolo')
        }}
        canCapture={canCapture}
        orientationPrompt={orientationPrompt}
        showRotationGuide={Boolean(documentMode && !isOrientationReady)}
        needsToMoveCloser={Boolean(needsToMoveCloser)}
        showGuideOverlay={documentMode}
        instructionText={instructionText}
        qrRequired={shouldRequireQr}
        qrValue={liveQrValue}
        collectedCount={onCaptureMultiple ? collectedCaptureDrafts.length : 0}
        onContinueFromCapture={onCaptureMultiple ? handleContinueMultiCapture : undefined}
        postCaptureToastMessage={postCaptureToastMessage}
        showFlashAnimation={showFlashAnimation}
        onCapture={handleCapture}
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

      <div
        className={`absolute left-1/2 z-20 -translate-x-1/2 ${
          onCaptureMultiple ? 'bottom-[250px]' : 'bottom-28'
        }`}
      >
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
