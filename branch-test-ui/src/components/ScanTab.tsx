import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useLogContext } from '../context/LogContext'
import {
  getStorageObject,
  listScanners,
  listStorageObjects,
  releaseScanner,
  reserveScanner,
  resolveStorageObjectPaths,
  scanBordro,
} from '../services/branchClient'
import type { CheckMetadata, ScanColorMode, Scanner } from '../types'

type ScanTabProps = {
  activeBordroId: string | null
  expectedCheckCount?: number | null
  initialScannedChecks?: CheckMetadata[]
  initialScanSettings?: ScanSettings
  onScannedCheckCountChange?: (count: number) => void
  onScannedChecksChange?: (checks: CheckMetadata[]) => void
  onScanSettingsChange?: (settings: ScanSettings) => void
  onReservationStateChange?: (state: ScanReservationState) => void
}

export type ScanReservationState = {
  isReserved: boolean
  scannerId: string | null
  sessionId: string
}

export type ScanSettings = {
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}

type ParsedCheckStorageMetadata = {
  scanner_id: string | null
  session_id: string | null
  bordro_no: string | null
  check_no: string | null
  micr_data: string | null
  qr_data: string | null
  micr_qr_match: boolean | null
  front_image_path: string | null
  back_image_path: string | null
}

type CheckStorageState = {
  isLoading: boolean
  error: string | null
  frontImagePath: string | null
  backImagePath: string | null
  frontImageSizeLabel: string | null
  backImageSizeLabel: string | null
  metadataPath: string | null
  metadataJson: string | null
  metadata: ParsedCheckStorageMetadata | null
}

function createInitialCheckStorageState(): CheckStorageState {
  return {
    isLoading: false,
    error: null,
    frontImagePath: null,
    backImagePath: null,
    frontImageSizeLabel: null,
    backImageSizeLabel: null,
    metadataPath: null,
    metadataJson: null,
    metadata: null,
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

const SCAN_DPI_OPTIONS = [300, 600]
const SCAN_COLOR_MODE_OPTIONS: Array<{ value: ScanColorMode; label: string }> = [
  { value: 'COLOR', label: 'Renkli' },
  { value: 'GRAYSCALE', label: 'Gri Ton' },
  { value: 'BLACK_AND_WHITE', label: 'Siyah-Beyaz' },
]
const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  duplex: false,
  dpi: 300,
  color_mode: 'COLOR',
}

let cachedSessionId: string | null = null

function createFallbackSessionId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'))
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-')
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getStableSessionId(): string {
  if (cachedSessionId === null) {
    const cryptoApi = globalThis.crypto
    cachedSessionId =
      typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : createFallbackSessionId()
  }

  return cachedSessionId
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isFailedPreconditionError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('failed_precondition') || normalized.includes('grpc 9')
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

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function formatByteSize(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength.toString()} B`
  }

  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`
  }

  return `${(byteLength / (1024 * 1024)).toFixed(2)} MB`
}

function parseCheckStorageMetadata(payload: Uint8Array): {
  metadataJson: string | null
  metadata: ParsedCheckStorageMetadata | null
} {
  if (payload.length === 0) {
    return { metadataJson: null, metadata: null }
  }

  const decodedText = new TextDecoder().decode(payload).trim()
  if (decodedText.length === 0) {
    return { metadataJson: null, metadata: null }
  }

  try {
    const parsedUnknown: unknown = JSON.parse(decodedText)
    if (!parsedUnknown || typeof parsedUnknown !== 'object') {
      return { metadataJson: decodedText, metadata: null }
    }

    const parsed = parsedUnknown as Record<string, unknown>
    return {
      metadataJson: JSON.stringify(parsedUnknown, null, 2),
      metadata: {
        scanner_id: getNonEmptyString(parsed.scanner_id),
        session_id: getNonEmptyString(parsed.session_id),
        bordro_no: getNonEmptyString(parsed.bordro_no),
        check_no: getNonEmptyString(parsed.check_no),
        micr_data: getNonEmptyString(parsed.micr_data),
        qr_data: getNonEmptyString(parsed.qr_data),
        micr_qr_match: getBooleanOrNull(parsed.micr_qr_match),
        front_image_path: getNonEmptyString(parsed.front_image_path),
        back_image_path: getNonEmptyString(parsed.back_image_path),
      },
    }
  } catch {
    return {
      metadataJson: decodedText,
      metadata: null,
    }
  }
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = getNonEmptyString(value)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function getCheckValidationStatus(isMatch: boolean): { label: string; badgeClassName: string } {
  return {
    label: isMatch ? 'Doğrulandı' : 'MICR ve QR eşleşmiyor',
    badgeClassName: isMatch
      ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
      : 'border-red-200 bg-red-100 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-300',
  }
}

export default function ScanTab({
  activeBordroId,
  expectedCheckCount = null,
  initialScannedChecks = [],
  initialScanSettings,
  onScannedCheckCountChange,
  onScannedChecksChange,
  onScanSettingsChange,
  onReservationStateChange,
}: ScanTabProps) {
  const { addLog } = useLogContext()
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [reservedScannerId, setReservedScannerId] = useState<string | null>(null)
  const [scannedChecks, setScannedChecks] = useState<CheckMetadata[]>(() => initialScannedChecks)
  const [isDuplex, setIsDuplex] = useState<boolean>(
    initialScanSettings?.duplex ?? DEFAULT_SCAN_SETTINGS.duplex,
  )
  const [scanDpi, setScanDpi] = useState<number>(
    initialScanSettings?.dpi ?? DEFAULT_SCAN_SETTINGS.dpi,
  )
  const [scanColorMode, setScanColorMode] = useState<ScanColorMode>(
    initialScanSettings?.color_mode ?? DEFAULT_SCAN_SETTINGS.color_mode,
  )
  const [error, setError] = useState<string | null>(null)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [checkStorageDetails, setCheckStorageDetails] = useState<Record<string, CheckStorageState>>(
    {},
  )

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const activeScannerId = activeScanner?.scanner_id ?? null
  const reservationScannerId = isReserved ? reservedScannerId : activeScannerId
  const scanDisabled = !isReserved || reservationScannerId === null || activeBordroId === null
  const sortedScannedChecks = useMemo(
    () => [...scannedChecks].sort((left, right) => left.check_no - right.check_no),
    [scannedChecks],
  )

  useEffect(() => {
    setIsDuplex(initialScanSettings?.duplex ?? DEFAULT_SCAN_SETTINGS.duplex)
    setScanDpi(initialScanSettings?.dpi ?? DEFAULT_SCAN_SETTINGS.dpi)
    setScanColorMode(initialScanSettings?.color_mode ?? DEFAULT_SCAN_SETTINGS.color_mode)
  }, [
    activeBordroId,
    initialScanSettings?.color_mode,
    initialScanSettings?.dpi,
    initialScanSettings?.duplex,
  ])

  useEffect(() => {
    onScannedCheckCountChange?.(scannedChecks.length)
  }, [onScannedCheckCountChange, scannedChecks.length])

  useEffect(() => {
    onScannedChecksChange?.(scannedChecks)
  }, [onScannedChecksChange, scannedChecks])

  useEffect(() => {
    onScanSettingsChange?.({
      duplex: isDuplex,
      dpi: scanDpi,
      color_mode: scanColorMode,
    })
  }, [onScanSettingsChange, scanColorMode, scanDpi, isDuplex])

  useEffect(() => {
    onReservationStateChange?.({
      isReserved,
      scannerId: reservationScannerId,
      sessionId,
    })
  }, [isReserved, onReservationStateChange, reservationScannerId, sessionId])

  const updateCheckStorageState = useCallback(
    (
      checkKey: string,
      updater: (previous: CheckStorageState | undefined) => CheckStorageState,
    ): void => {
      setCheckStorageDetails((previousDetails) => ({
        ...previousDetails,
        [checkKey]: updater(previousDetails[checkKey]),
      }))
    },
    [],
  )

  const clearAllCheckStorageDetails = useCallback((): void => {
    setCheckStorageDetails({})
  }, [])

  const loadCheckStorageDetails = useCallback(
    async (check: CheckMetadata, forceReload = false): Promise<void> => {
      const checkKey = getCheckResultKey(check)
      const currentState = checkStorageDetails[checkKey]
      if (
        !forceReload &&
        currentState &&
        (currentState.isLoading ||
          currentState.metadataPath !== null ||
          currentState.frontImagePath !== null ||
          currentState.backImagePath !== null ||
          currentState.metadataJson !== null)
      ) {
        return
      }

      if (!check.object_path.trim()) {
        updateCheckStorageState(checkKey, (previous) => ({
          ...(previous ?? createInitialCheckStorageState()),
          isLoading: false,
          error: 'Object path boş döndü.',
        }))
        return
      }

      updateCheckStorageState(checkKey, (previous) => ({
        ...(previous ?? createInitialCheckStorageState()),
        isLoading: true,
        error: null,
      }))

      try {
        addLog('info', `İstek: listObjects {prefix:${check.object_path}}`)
        const listedPaths = await listStorageObjects(check.object_path)
        addLog('info', `Yanıt: listObjects objects=${listedPaths.length.toString()}`)

        const resolvedPaths = resolveStorageObjectPaths(listedPaths)
        const metadataPath = resolvedPaths.metadata_path
        let metadataJson: string | null = null
        let parsedMetadata: ParsedCheckStorageMetadata | null = null

        if (metadataPath) {
          try {
            const metadataPayload = await getStorageObject(metadataPath)
            const parsedResult = parseCheckStorageMetadata(metadataPayload)
            metadataJson = parsedResult.metadataJson
            parsedMetadata = parsedResult.metadata
          } catch (metadataError) {
            const metadataMessage = getErrorMessage(metadataError)
            addLog('warn', `Uyarı: metadata.json okunamadı ${metadataMessage}`)
          }
        }

        const frontImagePath = firstNonEmpty(
          check.front_image_path,
          parsedMetadata?.front_image_path,
        )
        const backImagePath = firstNonEmpty(
          check.back_image_path,
          parsedMetadata?.back_image_path,
        )
        const frontImageSizeLabel = frontImagePath
          ? formatByteSize((await getStorageObject(frontImagePath)).length)
          : null
        const backImageSizeLabel = backImagePath
          ? formatByteSize((await getStorageObject(backImagePath)).length)
          : null

        setScannedChecks((previousChecks) => {
          let hasChanges = false

          const nextChecks = previousChecks.map((currentCheck) => {
            if (getCheckResultKey(currentCheck) !== checkKey) {
              return currentCheck
            }

            const nextFrontImagePath = firstNonEmpty(currentCheck.front_image_path, frontImagePath)
            const nextBackImagePath = firstNonEmpty(currentCheck.back_image_path, backImagePath)
            const resolvedFrontImagePath = nextFrontImagePath ?? ''
            const resolvedBackImagePath = nextBackImagePath ?? ''

            if (
              currentCheck.front_image_path === resolvedFrontImagePath &&
              currentCheck.back_image_path === resolvedBackImagePath &&
              currentCheck.front_path === resolvedFrontImagePath &&
              currentCheck.back_path === resolvedBackImagePath
            ) {
              return currentCheck
            }

            hasChanges = true
            return {
              ...currentCheck,
              front_image_path: resolvedFrontImagePath,
              back_image_path: resolvedBackImagePath,
              front_path: resolvedFrontImagePath,
              back_path: resolvedBackImagePath,
            }
          })

          return hasChanges ? nextChecks : previousChecks
        })

        updateCheckStorageState(checkKey, () => ({
          isLoading: false,
          error: null,
          frontImagePath,
          backImagePath,
          frontImageSizeLabel,
          backImageSizeLabel,
          metadataPath,
          metadataJson,
          metadata: parsedMetadata,
        }))
      } catch (detailsError) {
        const message = getErrorMessage(detailsError)
        updateCheckStorageState(checkKey, (previous) => ({
          ...(previous ?? createInitialCheckStorageState()),
          isLoading: false,
          error: message,
        }))
        addLog('error', `Hata: storage detayları ${message}`)
      }
    },
    [addLog, checkStorageDetails, updateCheckStorageState],
  )

  useEffect(() => {
    for (const check of scannedChecks) {
      const checkKey = getCheckResultKey(check)
      if (!checkStorageDetails[checkKey]) {
        void loadCheckStorageDetails(check)
      }
    }
  }, [checkStorageDetails, loadCheckStorageDetails, scannedChecks])

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

    if (!SCAN_DPI_OPTIONS.includes(scanDpi)) {
      setError('DPI alanı 300 veya 600 olmalı.')
      return
    }

    const bordroId = activeBordroId
    const dpi = scanDpi
    const colorMode = scanColorMode
    setIsScanning(true)

    try {
      console.log('scan request', {
        duplex: isDuplex,
        dpi,
        colorMode,
        scannerId,
        bordroId,
      })
      addLog(
        'info',
        `İstek: scanBordro {scanner_id:${scannerId}, session_id:${sessionId}, bordro_id:${bordroId}, duplex:${isDuplex ? 'true' : 'false'}, dpi:${dpi.toString()}, color_mode:${colorMode}}`,
      )
      const checks = await scanBordro({
        scanner_id: scannerId,
        session_id: sessionId,
        bordro_id: bordroId,
        duplex: isDuplex,
        dpi,
        color_mode: colorMode,
      })
      clearAllCheckStorageDetails()
      setScannedChecks(checks)
      addLog('info', `Yanıt: scanBordro checks=${checks.length.toString()}`)

      if (checks.length === 0) {
        const emptyResultMessage =
          'Bordro için taranacak çek bulunamadı. Muhtemelen bordro check_count=0 oluşturuldu.'
        setError(emptyResultMessage)
        addLog('warn', `Uyarı: scanBordro ${emptyResultMessage}`)
        return
      }

      const expectedPageCount = isDuplex ? 2 : 1
      const unexpectedPageCountChecks = checks.filter(
        (check) => check.page_count !== expectedPageCount,
      )
      if (unexpectedPageCountChecks.length > 0) {
        addLog(
          'warn',
          `Uyarı: scanBordro ${unexpectedPageCountChecks.length.toString()} çekte page_count beklenen ${expectedPageCount.toString()} dışında.`,
        )
      }
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      if (isFailedPreconditionError(message)) {
        const failedPreconditionMessage =
          'Tarama başlatılamadı: failed_precondition. Muhtemelen bordro check_count=0 oluşturuldu.'
        setError(failedPreconditionMessage)
        addLog('warn', `Uyarı: scanBordro ${message}`)
      } else {
        setError(message)
        addLog('error', `Hata: scanBordro ${message}`)
      }
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
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Bordro Tarama
          </h2>
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
          <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <input
              type="checkbox"
              checked={isDuplex}
              disabled={isScanning}
              onChange={(event) => {
                setIsDuplex(event.target.checked)
              }}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
            {isDuplex ? 'Çift Yüz' : 'Tek Yüz'}
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
            {isScanning ? 'Bordro Taranıyor…' : 'Tara'}
          </button>

          {isScanning ? (
            <p className="w-full text-xs text-cyan-700 dark:text-cyan-300">
              {expectedCheckCount && expectedCheckCount > 0
                ? `${expectedCheckCount.toString()} çek taranıyor, lütfen bekleyin…`
                : 'Bordrodaki çekler taranıyor, lütfen bekleyin…'}
            </p>
          ) : (
            <p className="w-full text-xs text-slate-500 dark:text-slate-400">
              Bu işlem tek çağrıda bordrodaki tüm çekleri tarar.
            </p>
          )}
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
            {sortedScannedChecks.length.toString()} çek
          </span>
        </div>

        {sortedScannedChecks.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Henüz çek taranmadı.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedScannedChecks.map((check) => {
              const checkKey = getCheckResultKey(check)
              const storageDetails = checkStorageDetails[checkKey]
              const isDetailsLoading = storageDetails?.isLoading ?? true
              const metadata = storageDetails?.metadata
              const micrData = firstNonEmpty(check.micr_data, metadata?.micr_data, check.micr) ?? '-'
              const qrData = firstNonEmpty(check.qr_data, metadata?.qr_data, check.qr) ?? '-'
              const micrNotRead = micrData === 'MICR_NOT_READ'
              const qrNotRead = qrData === 'QR_NOT_READ'
              const micrQrMatch = metadata?.micr_qr_match ?? check.micr_qr_match
              const validationStatus = getCheckValidationStatus(micrQrMatch)
              const frontImagePath = firstNonEmpty(
                check.front_image_path,
                metadata?.front_image_path,
                storageDetails?.frontImagePath,
              )
              const backImagePath = firstNonEmpty(
                check.back_image_path,
                metadata?.back_image_path,
                storageDetails?.backImagePath,
              )
              const frontImageSizeLabel = storageDetails?.frontImageSizeLabel ?? null
              const backImageSizeLabel = storageDetails?.backImageSizeLabel ?? null
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
                  className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        Çek No {check.check_no}
                      </p>
                      <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                        {check.object_path || '-'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${validationStatus.badgeClassName}`}
                      >
                        {validationStatus.label}
                      </span>
                      <button
                        type="button"
                        disabled={isDetailsLoading}
                        onClick={() => {
                          void loadCheckStorageDetails(check, true)
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {isDetailsLoading ? 'Yenileniyor…' : 'Yolları Yenile'}
                      </button>
                    </div>
                  </div>

                  {storageDetails?.error ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      {storageDetails.error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {micrNotRead ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
                        MICR okunamadı
                      </span>
                    ) : null}
                    {qrNotRead ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
                        QR okunamadı
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Doğrulama Verisi
                      </p>
                      <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">micr_data</p>
                      <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{micrData}</p>
                      <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">qr_data</p>
                      <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{qrData}</p>
                      <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">micr_qr_match</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {micrQrMatch ? 'Eşleşti' : 'Eşleşmedi'}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Depolama Referansları
                      </p>
                      {isDetailsLoading ? (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          Depolama yolları yükleniyor…
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <div>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">front_image_path</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {frontImagePath ?? '-'}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Boyut: {frontImageSizeLabel ?? '-'}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">back_image_path</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {backImagePath ?? 'Arka yüz yok'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">metadata.json</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {storageDetails?.metadataPath ?? '-'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Tarama Özeti
                      </p>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        Sayfa Sayısı:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {check.page_count.toString()}
                        </span>
                      </p>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        Ön Yüz Boyutu:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {frontImageSizeLabel ?? '-'}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Arka Yüz Boyutu:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {backImageSizeLabel ?? (backImagePath ? '-' : 'Arka yüz yok')}
                        </span>
                      </p>
                      <div className="mt-2 space-y-2">
                        {scanSettings.map((setting) => (
                          <div
                            key={setting.key}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950/50"
                          >
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
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              İstenen: {setting.requested} | Uygulanan: {setting.effective}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {storageDetails?.metadataJson ? (
                    <details className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                        metadata.json
                      </summary>
                      {storageDetails.metadataPath ? (
                        <p className="mt-2 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {storageDetails.metadataPath}
                        </p>
                      ) : null}
                      <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        {storageDetails.metadataJson}
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
