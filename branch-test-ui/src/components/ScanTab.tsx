import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useLogContext } from '../context/LogContext'
import {
  getStorageObject,
  listScanners,
  listStorageObjects,
  releaseScanner,
  reserveScanner,
  resolveStorageObjectPaths,
  scanCheck,
} from '../services/branchClient'
import type { CheckMetadata, ScanColorMode, Scanner } from '../types'

type ScanTabProps = {
  activeBordroId: string | null
  onScannedCheckCountChange?: (count: number) => void
  onScannedChecksChange?: (checks: CheckMetadata[]) => void
  onReservationStateChange?: (state: ScanReservationState) => void
}

export type ScanReservationState = {
  isReserved: boolean
  scannerId: string | null
  sessionId: string
}

type ImagePreviewState = {
  objectPath: string | null
  objectUrl: string | null
  mimeType: string | null
  error: string | null
  renderFailed: boolean
}

type CheckPreviewState = {
  isLoading: boolean
  error: string | null
  front: ImagePreviewState
  back: ImagePreviewState
  metadataPath: string | null
  metadataJson: string | null
}

const EMPTY_IMAGE_PREVIEW: ImagePreviewState = {
  objectPath: null,
  objectUrl: null,
  mimeType: null,
  error: null,
  renderFailed: false,
}

function createInitialCheckPreview(): CheckPreviewState {
  return {
    isLoading: false,
    error: null,
    front: { ...EMPTY_IMAGE_PREVIEW },
    back: { ...EMPTY_IMAGE_PREVIEW },
    metadataPath: null,
    metadataJson: null,
  }
}

const SCANNER_STATUS_META: Record<
  Scanner['pc_daemon_status'],
  { label: string; badgeClassName: string }
> = {
  available: {
    label: 'Müsait',
    badgeClassName:
      'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  reserved: {
    label: 'Rezerve',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  },
  unavailable: {
    label: 'Hazır Değil',
    badgeClassName:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
}

const SCAN_DPI_OPTIONS = [200, 300, 600]
const SCAN_COLOR_MODE_OPTIONS: Array<{ value: ScanColorMode; label: string }> = [
  { value: 'COLOR', label: 'Renkli' },
  { value: 'GRAYSCALE', label: 'Gri Ton' },
  { value: 'BLACK_AND_WHITE', label: 'Siyah-Beyaz' },
]

let cachedSessionId: string | null = null

function getStableSessionId(): string {
  if (cachedSessionId === null) {
    cachedSessionId = crypto.randomUUID()
  }

  return cachedSessionId
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getScannerSelectionKey(scanner: Scanner): string {
  return [scanner.scanner_id, scanner.pc_daemon_id, scanner.scan_grpc_addr].join('|')
}

function formatHeartbeat(value: string | undefined): string {
  if (!value || value === '-') {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('tr-TR')
}

function formatDuplexLabel(duplex: boolean): string {
  return duplex ? 'Çift Yüz' : 'Tek Yüz'
}

function formatScanColorModeLabel(colorMode: ScanColorMode): string {
  if (colorMode === 'COLOR') {
    return 'Renkli'
  }

  if (colorMode === 'GRAYSCALE') {
    return 'Gri Ton'
  }

  if (colorMode === 'BLACK_AND_WHITE') {
    return 'Siyah-Beyaz'
  }

  return 'Belirsiz'
}

function getSettingStatus(verified: boolean, matches: boolean): { label: string; badgeClassName: string } {
  if (!verified) {
    return {
      label: 'Doğrulanamadı',
      badgeClassName:
        'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    }
  }

  if (matches) {
    return {
      label: 'Uygulandı',
      badgeClassName:
        'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }

  return {
    label: 'Farklılandı',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  }
}

function getCheckResultKey(check: CheckMetadata): string {
  return `${check.bordro_id}-${check.check_no.toString()}-${check.object_path}`
}

function hasBackPage(check: CheckMetadata): boolean {
  return check.effective_duplex || check.page_count > 1
}

function createObjectUrl(data: Uint8Array, mimeType: string): string {
  const copied = new Uint8Array(data.byteLength)
  copied.set(data)
  return URL.createObjectURL(new Blob([copied], { type: mimeType }))
}

function isRenderableImageMimeType(mimeType: string | null): boolean {
  if (mimeType === null) {
    return false
  }

  return mimeType.startsWith('image/')
}

function revokePreviewUrls(preview: CheckPreviewState | undefined): void {
  if (!preview) {
    return
  }

  if (preview.front.objectUrl) {
    URL.revokeObjectURL(preview.front.objectUrl)
  }

  if (preview.back.objectUrl) {
    URL.revokeObjectURL(preview.back.objectUrl)
  }
}

export default function ScanTab({
  activeBordroId,
  onScannedCheckCountChange,
  onScannedChecksChange,
  onReservationStateChange,
}: ScanTabProps) {
  const { addLog } = useLogContext()
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [reservedScannerId, setReservedScannerId] = useState<string | null>(null)
  const [scannedChecks, setScannedChecks] = useState<CheckMetadata[]>([])
  const [checkNo, setCheckNo] = useState<number>(1)
  const [scanDuplex, setScanDuplex] = useState<boolean>(false)
  const [scanDpi, setScanDpi] = useState<number>(200)
  const [scanColorMode, setScanColorMode] = useState<ScanColorMode>('COLOR')
  const [error, setError] = useState<string | null>(null)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [checkPreviews, setCheckPreviews] = useState<Record<string, CheckPreviewState>>({})
  const previewCacheRef = useRef<Record<string, CheckPreviewState>>({})

  useEffect(() => {
    previewCacheRef.current = checkPreviews
  }, [checkPreviews])

  useEffect(() => {
    return () => {
      for (const preview of Object.values(previewCacheRef.current)) {
        revokePreviewUrls(preview)
      }
    }
  }, [])

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const activeScannerId = activeScanner?.scanner_id ?? null
  const reservationScannerId = isReserved ? reservedScannerId : activeScannerId
  const scanDisabled = !isReserved || reservationScannerId === null || activeBordroId === null

  useEffect(() => {
    onScannedCheckCountChange?.(scannedChecks.length)
  }, [onScannedCheckCountChange, scannedChecks.length])

  useEffect(() => {
    onScannedChecksChange?.(scannedChecks)
  }, [onScannedChecksChange, scannedChecks])

  useEffect(() => {
    onReservationStateChange?.({
      isReserved,
      scannerId: reservationScannerId,
      sessionId,
    })
  }, [isReserved, onReservationStateChange, reservationScannerId, sessionId])

  const updateCheckPreview = useCallback(
    (
      checkKey: string,
      updater: (previous: CheckPreviewState | undefined) => CheckPreviewState,
    ): void => {
      setCheckPreviews((previousPreviews) => {
        const previousPreview = previousPreviews[checkKey]
        const nextPreview = updater(previousPreview)

        if (previousPreview?.front.objectUrl && previousPreview.front.objectUrl !== nextPreview.front.objectUrl) {
          URL.revokeObjectURL(previousPreview.front.objectUrl)
        }

        if (previousPreview?.back.objectUrl && previousPreview.back.objectUrl !== nextPreview.back.objectUrl) {
          URL.revokeObjectURL(previousPreview.back.objectUrl)
        }

        return {
          ...previousPreviews,
          [checkKey]: nextPreview,
        }
      })
    },
    [],
  )

  const clearAllPreviews = useCallback((): void => {
    setCheckPreviews((previousPreviews) => {
      for (const preview of Object.values(previousPreviews)) {
        revokePreviewUrls(preview)
      }

      return {}
    })
  }, [])

  const markImageRenderFailed = useCallback(
    (checkKey: string, side: 'front' | 'back'): void => {
      updateCheckPreview(checkKey, (previous) => {
        const nextState = previous ?? createInitialCheckPreview()
        return {
          ...nextState,
          [side]: {
            ...nextState[side],
            renderFailed: true,
          },
        }
      })
    },
    [updateCheckPreview],
  )

  const loadCheckPreview = useCallback(
    async (check: CheckMetadata, forceReload = false): Promise<void> => {
      const checkKey = getCheckResultKey(check)
      const currentState = previewCacheRef.current[checkKey]
      if (!forceReload && currentState && (currentState.isLoading || currentState.front.objectUrl || currentState.back.objectUrl)) {
        return
      }

      if (!check.object_path.trim()) {
        updateCheckPreview(checkKey, (previous) => ({
          ...(previous ?? createInitialCheckPreview()),
          isLoading: false,
          error: 'Object path boş döndü.',
        }))
        return
      }

      updateCheckPreview(checkKey, (previous) => {
        const nextState = previous ?? createInitialCheckPreview()
        return {
          ...nextState,
          isLoading: true,
          error: null,
          front: {
            ...nextState.front,
            error: null,
            renderFailed: false,
          },
          back: {
            ...nextState.back,
            error: null,
            renderFailed: false,
          },
        }
      })

      try {
        addLog('info', `İstek: listObjects {prefix:${check.object_path}}`)
        const listedPaths = await listStorageObjects(check.object_path)
        addLog('info', `Yanıt: listObjects objects=${listedPaths.length.toString()}`)

        const resolvedPaths = resolveStorageObjectPaths(listedPaths)
        const expectedBackPage = hasBackPage(check)

        const frontPromise = resolvedPaths.front_path
          ? getStorageObject(resolvedPaths.front_path)
          : Promise.resolve<Uint8Array | null>(null)
        const backPromise = resolvedPaths.back_path
          ? getStorageObject(resolvedPaths.back_path)
          : Promise.resolve<Uint8Array | null>(null)
        const metadataPromise = resolvedPaths.metadata_path
          ? getStorageObject(resolvedPaths.metadata_path)
          : Promise.resolve(new Uint8Array())

        const [frontResult, backResult, metadataResult] = await Promise.allSettled([
          frontPromise,
          backPromise,
          metadataPromise,
        ])

        let metadataJson: string | null = null
        if (metadataResult.status === 'fulfilled' && metadataResult.value.length > 0) {
          const decodedText = new TextDecoder().decode(metadataResult.value).trim()
          if (decodedText.length > 0) {
            try {
              metadataJson = JSON.stringify(JSON.parse(decodedText), null, 2)
            } catch {
              metadataJson = decodedText
            }
          }
        }

        const frontState: ImagePreviewState = {
          ...EMPTY_IMAGE_PREVIEW,
          objectPath: resolvedPaths.front_path,
        }
        if (frontResult.status === 'fulfilled') {
          if (frontResult.value && frontResult.value.length > 0) {
            const mimeType = resolvedPaths.front_is_png ? 'image/png' : 'application/octet-stream'
            frontState.mimeType = mimeType
            frontState.objectUrl = createObjectUrl(frontResult.value, mimeType)
          } else if (frontResult.value && frontResult.value.length === 0) {
            frontState.error = 'front dosyası boş döndü.'
          } else {
            frontState.error = 'front.png/front.bin bulunamadı.'
          }
        } else {
          frontState.error = getErrorMessage(frontResult.reason)
        }

        const backState: ImagePreviewState = {
          ...EMPTY_IMAGE_PREVIEW,
          objectPath: resolvedPaths.back_path,
        }
        if (backResult.status === 'fulfilled') {
          if (backResult.value && backResult.value.length > 0) {
            const mimeType = resolvedPaths.back_is_png ? 'image/png' : 'application/octet-stream'
            backState.mimeType = mimeType
            backState.objectUrl = createObjectUrl(backResult.value, mimeType)
          } else if (backResult.value && backResult.value.length === 0 && expectedBackPage) {
            backState.error = 'back dosyası boş döndü.'
          }
        } else if (expectedBackPage) {
          backState.error = getErrorMessage(backResult.reason)
        }

        const previewError = frontState.objectUrl !== null
          ? null
          : frontState.error ?? 'Ön yüz görüntüsü yüklenemedi.'

        updateCheckPreview(checkKey, () => ({
          isLoading: false,
          error: previewError,
          front: frontState,
          back: backState,
          metadataPath: resolvedPaths.metadata_path,
          metadataJson,
        }))
      } catch (previewError) {
        const message = getErrorMessage(previewError)
        updateCheckPreview(checkKey, (previous) => ({
          ...(previous ?? createInitialCheckPreview()),
          isLoading: false,
          error: message,
        }))
        addLog('error', `Hata: storage preview ${message}`)
      }
    },
    [addLog, updateCheckPreview],
  )

  useEffect(() => {
    for (const check of scannedChecks) {
      const checkKey = getCheckResultKey(check)
      if (!checkPreviews[checkKey]) {
        void loadCheckPreview(check)
      }
    }
  }, [checkPreviews, loadCheckPreview, scannedChecks])

  const handleListScanners = useCallback(async (): Promise<void> => {
    setError(null)
    setIsListing(true)

    try {
      addLog('info', 'İstek: listScanners {}')
      const listedScanners = await listScanners()
      const sortedScanners = [...listedScanners].sort((left, right) =>
        left.scanner_id.localeCompare(right.scanner_id),
      )
      setScanners(sortedScanners)
      setSelectedScannerKey((previousSelectionKey) => {
        if (previousSelectionKey === null) {
          return null
        }

        const selectionExists = sortedScanners.some(
          (scanner) => getScannerSelectionKey(scanner) === previousSelectionKey,
        )

        return selectionExists ? previousSelectionKey : null
      })
      setHasListedScanners(true)
      addLog('info', `Yanıt: listScanners scanners=${listedScanners.length}`)
    } catch (listError) {
      const message = getErrorMessage(listError)
      setError(message)
      addLog('error', `Hata: listScanners ${message}`)
    } finally {
      setIsListing(false)
    }
  }, [addLog])

  useEffect(() => {
    void handleListScanners()
  }, [handleListScanners])

  async function handleReserve(targetScanner?: Scanner): Promise<void> {
    setError(null)

    const scanner = targetScanner ?? activeScanner
    if (scanner === null) {
      setError('Önce bir scanner seçin.')
      return
    }

    const scannerKey = getScannerSelectionKey(scanner)
    if (selectedScannerKey !== scannerKey) {
      setSelectedScannerKey(scannerKey)
    }

    const scannerId = scanner.scanner_id
    setIsReserving(true)

    try {
      addLog('info', `İstek: reserveScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await reserveScanner(scannerId, sessionId)
      setIsReserved(true)
      setReservedScannerId(scannerId)
      addLog('info', `Yanıt: reserveScanner scanner_id=${scannerId}`)
    } catch (reserveError) {
      const message = getErrorMessage(reserveError)
      setError(message)
      addLog('error', `Hata: reserveScanner ${message}`)
    } finally {
      setIsReserving(false)
    }
  }

  async function handleRelease(): Promise<void> {
    setError(null)

    const scannerId = reservedScannerId ?? activeScanner?.scanner_id ?? null
    if (!isReserved || scannerId === null) {
      return
    }

    setIsReleasing(true)

    try {
      addLog('info', `İstek: releaseScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await releaseScanner(scannerId, sessionId)
      setIsReserved(false)
      setReservedScannerId(null)
      setSelectedScannerKey(null)
      setScannedChecks([])
      clearAllPreviews()
      setCheckNo(1)
      addLog('info', `Yanıt: releaseScanner scanner_id=${scannerId}`)
    } catch (releaseError) {
      const message = getErrorMessage(releaseError)
      setError(message)
      addLog('error', `Hata: releaseScanner ${message}`)
    } finally {
      setIsReleasing(false)
    }
  }

  async function handleScan(): Promise<void> {
    setError(null)

    const scannerId = reservedScannerId ?? activeScanner?.scanner_id ?? null
    if (!isReserved || scannerId === null) {
      setError('Tarama için önce scanner rezervasyonu yapın.')
      return
    }

    if (activeBordroId === null) {
      setError('Önce bordro oluşturun veya seçin.')
      return
    }

    if (!Number.isInteger(checkNo) || checkNo < 1) {
      setError('Çek numarası en az 1 olmalı.')
      return
    }

    if (!SCAN_DPI_OPTIONS.includes(scanDpi)) {
      setError('DPI alanı 200, 300 veya 600 olmalı.')
      return
    }

    const bordroId = activeBordroId
    setIsScanning(true)

    try {
      addLog(
        'info',
        `İstek: scanCheck {scanner_id:${scannerId}, session_id:${sessionId}, bordro_id:${bordroId}, check_no:${checkNo}, duplex:${scanDuplex ? 'true' : 'false'}, dpi:${scanDpi.toString()}, color_mode:${scanColorMode}}`,
      )
      const metadata = await scanCheck({
        scanner_id: scannerId,
        session_id: sessionId,
        bordro_id: bordroId,
        check_no: checkNo,
        duplex: scanDuplex,
        dpi: scanDpi,
        color_mode: scanColorMode,
      })

      setScannedChecks((prev) => [...prev, metadata])
      void loadCheckPreview(metadata, true)
      addLog(
        'info',
        `Yanıt: scanCheck check_no=${metadata.check_no}, object_path=${metadata.object_path || '-'}, page_count=${metadata.page_count.toString()}, micr_qr_match=${metadata.micr_qr_match ? 'true' : 'false'}, requested_duplex=${metadata.duplex ? 'true' : 'false'}, effective_duplex=${metadata.effective_duplex ? 'true' : 'false'}, duplex_verified=${metadata.duplex_verified ? 'true' : 'false'}, requested_dpi=${metadata.dpi.toString()}, effective_dpi=${metadata.effective_dpi.toString()}, dpi_verified=${metadata.dpi_verified ? 'true' : 'false'}, requested_color_mode=${metadata.color_mode}, effective_color_mode=${metadata.effective_color_mode}, color_mode_verified=${metadata.color_mode_verified ? 'true' : 'false'}`,
      )

      const nextCheckNo =
        Number.isInteger(metadata.check_no) && metadata.check_no > 0
          ? metadata.check_no + 1
          : checkNo + 1
      setCheckNo(nextCheckNo)
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      setError(message)
      addLog('error', `Hata: scanCheck ${message}`)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Adım 1
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Scanner Seçimi ve Rezervasyon
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Session ID:{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">{sessionId}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleListScanners()
            }}
            disabled={isListing || isReserving || isReleasing}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isListing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {isListing ? 'Yenileniyor…' : 'Tarayıcıları Yenile'}
          </button>
        </div>

        {scanners.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {scanners.map((scanner) => {
              const scannerSelectionKey = getScannerSelectionKey(scanner)
              const isSelected = selectedScannerKey === scannerSelectionKey
              const isReservedByThisSession = isReserved && reservedScannerId === scanner.scanner_id
              const statusMeta = SCANNER_STATUS_META[scanner.pc_daemon_status]
              const disableSelect = isReserved && !isReservedByThisSession
              const disableReserve =
                isReserving ||
                isListing ||
                isReleasing ||
                isReservedByThisSession ||
                scanner.pc_daemon_status === 'unavailable' ||
                (scanner.pc_daemon_status === 'reserved' && !isReservedByThisSession) ||
                (isReserved && !isReservedByThisSession)

              const reserveButtonLabel = isReservedByThisSession
                ? 'Rezerve Edildi'
                : scanner.pc_daemon_status === 'reserved'
                  ? 'Dolu'
                  : scanner.pc_daemon_status === 'unavailable'
                    ? 'Hazır Değil'
                    : isReserving && isSelected
                      ? 'Rezerve Ediliyor…'
                      : 'Rezerve Et'

              return (
                <article
                  key={scannerSelectionKey}
                  className={`rounded-lg border p-3 transition ${
                    isSelected
                      ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <ScanLine className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        {scanner.scanner_id}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        PC: <span className="font-mono">{scanner.pc_daemon_addr || '-'}</span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusMeta.badgeClassName}`}
                    >
                      {isReservedByThisSession ? 'Bu oturumda rezerve' : statusMeta.label}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    Scan gRPC: <span className="font-mono">{scanner.scan_grpc_addr || '-'}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Son heartbeat: <span className="font-medium">{formatHeartbeat(scanner.last_heartbeat)}</span>
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={disableSelect}
                      onClick={() => {
                        setSelectedScannerKey(scannerSelectionKey)
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected
                          ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isSelected ? 'Seçildi' : 'Seç'}
                    </button>

                    <button
                      type="button"
                      disabled={disableReserve}
                      onClick={() => {
                        void handleReserve(scanner)
                      }}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      {reserveButtonLabel}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        {hasListedScanners && scanners.length === 0 && !isListing ? (
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            Kullanılabilir scanner bulunamadı.
          </p>
        ) : null}

        {isReserved ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              Rezerve scanner:{' '}
              <span className="font-mono font-medium">{reservedScannerId ?? activeScannerId ?? '-'}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                void handleRelease()
              }}
              disabled={isReleasing}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
            >
              {isReleasing ? 'Bırakılıyor…' : 'Rezervasyonu Bırak'}
            </button>
          </div>
        ) : null}
      </section>

      <section
        className={`space-y-4 rounded-xl border p-4 dark:border-slate-800 ${
          isReserved
            ? 'border-slate-200 bg-white dark:bg-slate-900/70'
            : 'border-slate-200 bg-slate-50/80 dark:bg-slate-900/30'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Adım 2
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Çek Tarama</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Aktif Bordro
            </p>
            {activeBordroId ? (
              <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">{activeBordroId}</p>
            ) : (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Önce bordro seçin veya oluşturun.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rezervasyon
            </p>
            {isReserved ? (
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                Hazır: <span className="font-mono font-medium">{reservedScannerId ?? activeScannerId ?? '-'}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Tarama için önce scanner rezerve edin.
              </p>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleScan()
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Check No</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={checkNo}
              disabled={!isReserved || isScanning}
              onChange={(event) => {
                const parsedValue = event.target.valueAsNumber
                const nextValue = Number.isFinite(parsedValue) ? Math.max(1, Math.trunc(parsedValue)) : 1
                setCheckNo(nextValue)
              }}
              className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCheckNo((prev) => Math.max(1, prev - 1))
              }}
              disabled={!isReserved || isScanning || checkNo <= 1}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckNo((prev) => prev + 1)
              }}
              disabled={!isReserved || isScanning}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              +
            </button>
          </div>

          <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <input
              type="checkbox"
              checked={scanDuplex}
              disabled={isScanning}
              onChange={(event) => {
                setScanDuplex(event.target.checked)
              }}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
            Duplex
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">DPI</span>
            <select
              value={scanDpi}
              disabled={isScanning}
              onChange={(event) => {
                const parsedValue = Number.parseInt(event.target.value, 10)
                if (Number.isFinite(parsedValue) && SCAN_DPI_OPTIONS.includes(parsedValue)) {
                  setScanDpi(parsedValue)
                }
              }}
              className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
            >
              {SCAN_DPI_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Renk Modu</span>
            <select
              value={scanColorMode}
              disabled={isScanning}
              onChange={(event) => {
                const nextColorMode = event.target.value as ScanColorMode
                if (
                  nextColorMode === 'COLOR' ||
                  nextColorMode === 'GRAYSCALE' ||
                  nextColorMode === 'BLACK_AND_WHITE'
                ) {
                  setScanColorMode(nextColorMode)
                }
              }}
              className="w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
            >
              {SCAN_COLOR_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={scanDisabled || isScanning}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isScanning ? 'Taranıyor…' : 'Tara'}
          </button>
        </form>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonuçları</h3>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {scannedChecks.length.toString()} çek
          </span>
        </div>

        {scannedChecks.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Henüz çek taranmadı.
          </p>
        ) : (
          <div className="space-y-4">
            {[...scannedChecks]
              .sort((left, right) => right.check_no - left.check_no)
              .map((check) => {
                const checkKey = getCheckResultKey(check)
                const preview = checkPreviews[checkKey]
                const isPreviewLoading = preview?.isLoading ?? true
                const front = preview?.front ?? EMPTY_IMAGE_PREVIEW
                const back = preview?.back ?? EMPTY_IMAGE_PREVIEW
                const checkHasBackPage = hasBackPage(check)
                const frontPath = front.objectPath
                const backPath = back.objectPath
                const hasPreviewError = Boolean(preview?.error || front.error || (checkHasBackPage && back.error))
                const isFrontPng = front.mimeType === 'image/png'
                const isBackPng = back.mimeType === 'image/png'
                const canRenderFront = Boolean(
                  front.objectUrl && isFrontPng && isRenderableImageMimeType(front.mimeType) && !front.renderFailed,
                )
                const canRenderBack = Boolean(
                  back.objectUrl && isBackPng && isRenderableImageMimeType(back.mimeType) && !back.renderFailed,
                )
                const scanSettings = [
                  {
                    key: 'duplex',
                    label: 'Duplex',
                    requested: formatDuplexLabel(check.duplex),
                    effective: formatDuplexLabel(check.effective_duplex),
                    status: getSettingStatus(check.duplex_verified, check.duplex === check.effective_duplex),
                  },
                  {
                    key: 'dpi',
                    label: 'DPI',
                    requested: check.dpi > 0 ? check.dpi.toString() : '-',
                    effective: check.effective_dpi > 0 ? check.effective_dpi.toString() : '-',
                    status: getSettingStatus(check.dpi_verified, check.dpi === check.effective_dpi),
                  },
                  {
                    key: 'color_mode',
                    label: 'Renk Modu',
                    requested: formatScanColorModeLabel(check.color_mode),
                    effective: formatScanColorModeLabel(check.effective_color_mode),
                    status: getSettingStatus(
                      check.color_mode_verified,
                      check.color_mode === check.effective_color_mode,
                    ),
                  },
                ]

                return (
                  <article
                    key={checkKey}
                    className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Check No {check.check_no}
                        </p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-400">
                          {check.object_path || '-'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPreviewLoading}
                        onClick={() => {
                          void loadCheckPreview(check, true)
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {isPreviewLoading ? 'Yükleniyor…' : 'Önizlemeyi Yeniden Dene'}
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          MICR
                        </p>
                        <p className="mt-1 break-all text-sm text-slate-700 dark:text-slate-300">
                          {check.micr || '-'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          QR
                        </p>
                        <p className="mt-1 break-all text-sm text-slate-700 dark:text-slate-300">{check.qr || '-'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          MICR / QR Match
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {check.micr_qr_match ? 'Eşleşti' : 'Eşleşmedi'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tarama Ayarları
                        </p>
                        <div className="mt-2 space-y-2">
                          {scanSettings.map((setting) => (
                            <div key={setting.key} className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950/50">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                  {setting.label}
                                </p>
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${setting.status.badgeClassName}`}
                                >
                                  {setting.status.label}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                İstenen: <span className="font-medium text-slate-700 dark:text-slate-200">{setting.requested}</span>
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Uygulanan:{' '}
                                <span className="font-medium text-slate-700 dark:text-slate-200">{setting.effective}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Page Count
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {check.page_count.toString()}
                        </p>
                      </div>
                    </div>

                    {hasPreviewError ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                        {preview?.error ?? 'Önizleme kısmen yüklenemedi.'}
                      </p>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Ön Yüz
                        </p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{frontPath || '-'}</p>
                        {isPreviewLoading ? (
                          <div className="h-44 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
                        ) : canRenderFront ? (
                          <img
                            src={front.objectUrl ?? undefined}
                            alt={`Check ${check.check_no.toString()} ön yüz`}
                            onError={() => {
                              markImageRenderFailed(checkKey, 'front')
                            }}
                            className="h-44 w-full rounded-md border border-slate-200 bg-white object-contain dark:border-slate-700 dark:bg-slate-900"
                          />
                        ) : front.objectUrl ? (
                          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <p>
                              {isFrontPng
                                ? 'Önizleme bu tarayıcıda render edilemedi.'
                                : 'Legacy .bin kayıt: önizleme devre dışı, dosyayı indirebilirsiniz.'}
                            </p>
                            <a
                              href={front.objectUrl}
                              download={`check-${check.check_no.toString()}-front${isFrontPng ? '.png' : '.bin'}`}
                              className="inline-flex rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Dosyayı İndir
                            </a>
                          </div>
                        ) : (
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {front.error ?? 'Ön yüz görseli bulunamadı.'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Arka Yüz
                        </p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{backPath || '-'}</p>
                        {isPreviewLoading ? (
                          <div className="h-44 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
                        ) : canRenderBack ? (
                          <img
                            src={back.objectUrl ?? undefined}
                            alt={`Check ${check.check_no.toString()} arka yüz`}
                            onError={() => {
                              markImageRenderFailed(checkKey, 'back')
                            }}
                            className="h-44 w-full rounded-md border border-slate-200 bg-white object-contain dark:border-slate-700 dark:bg-slate-900"
                          />
                        ) : back.objectUrl ? (
                          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <p>
                              {isBackPng
                                ? 'Önizleme bu tarayıcıda render edilemedi.'
                                : 'Legacy .bin kayıt: önizleme devre dışı, dosyayı indirebilirsiniz.'}
                            </p>
                            <a
                              href={back.objectUrl}
                              download={`check-${check.check_no.toString()}-back${isBackPng ? '.png' : '.bin'}`}
                              className="inline-flex rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Dosyayı İndir
                            </a>
                          </div>
                        ) : (
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {back.error ?? 'Arka yüz yok.'}
                          </div>
                        )}
                      </div>
                    </div>

                    {preview?.metadataJson ? (
                      <details className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                          metadata.json
                        </summary>
                        {preview.metadataPath ? (
                          <p className="mt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {preview.metadataPath}
                          </p>
                        ) : null}
                        <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                          {preview.metadataJson}
                        </pre>
                      </details>
                    ) : null}
                  </article>
                )
              })}
          </div>
        )}
      </section>
    </div>
  )
}
