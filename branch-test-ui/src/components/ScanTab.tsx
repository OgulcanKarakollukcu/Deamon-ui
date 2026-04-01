import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useLogContext } from '../context/LogContext'
import {
  analyzeChequeWithDotsMocr,
  getStorageObject,
  listScanners,
  listStorageObjects,
  releaseScanner,
  reserveScanner,
  resolveStorageObjectPaths,
  scanBordroStream,
} from '../services/branchClient'
import type {
  ChequeMetadata,
  DotsMocrChequeAnalysisResult,
  ScanColorMode,
  ScanPageSize,
  Scanner,
} from '../types'
import { parseDotsMocrDisplayFields } from '../utils/dotsMocrFields'

export type ScanTabProps = {
  activeBordroId: string | null
  expectedChequeCount?: number | null
  initialScannedCheques?: ChequeMetadata[]
  initialScanSettings?: ScanSettings
  onScannedChequeCountChange?: (count: number) => void
  onScannedChequesChange?: (cheques: ChequeMetadata[]) => void
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
  page_size: ScanPageSize
}

type ParsedChequeStorageMetadata = {
  scanner_id: string | null
  session_id: string | null
  bordro_no: string | null
  cheque_no: string | null
  micr_data: string | null
  qr_data: string | null
  micr_qr_match: boolean | null
  front_image_path: string | null
  back_image_path: string | null
}

type ImageDimensions = {
  width: number
  height: number
}

type ChequeStorageState = {
  isLoading: boolean
  error: string | null
  frontImagePath: string | null
  backImagePath: string | null
  frontPreviewUrl: string | null
  backPreviewUrl: string | null
  frontImageDimensions: ImageDimensions | null
  backImageDimensions: ImageDimensions | null
  frontImageSizeLabel: string | null
  backImageSizeLabel: string | null
  metadataPath: string | null
  metadataJson: string | null
  metadata: ParsedChequeStorageMetadata | null
}

type DotsMocrAnalysisState = {
  isLoading: boolean
  error: string | null
  result: DotsMocrChequeAnalysisResult | null
}

function createInitialChequeStorageState(): ChequeStorageState {
  return {
    isLoading: false,
    error: null,
    frontImagePath: null,
    backImagePath: null,
    frontPreviewUrl: null,
    backPreviewUrl: null,
    frontImageDimensions: null,
    backImageDimensions: null,
    frontImageSizeLabel: null,
    backImageSizeLabel: null,
    metadataPath: null,
    metadataJson: null,
    metadata: null,
  }
}

function createInitialDotsMocrAnalysisState(): DotsMocrAnalysisState {
  return {
    isLoading: false,
    error: null,
    result: null,
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
const SCAN_PAGE_SIZE_OPTIONS: Array<{ value: ScanPageSize; label: string }> = [
  { value: 'CHEQUE', label: 'Çek' },
  { value: 'A4', label: 'A4' },
]
const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  duplex: false,
  dpi: 300,
  color_mode: 'COLOR',
  page_size: 'CHEQUE',
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

function getChequeResultKey(cheque: ChequeMetadata): string {
  return `${cheque.bordro_id}-${cheque.cheque_no.toString()}-${cheque.object_path}`
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

function inferImageMimeType(path: string | null): string | null {
  const normalizedPath = path?.trim().toLowerCase() ?? ''
  if (normalizedPath.endsWith('.png')) {
    return 'image/png'
  }

  if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  return null
}

function isRenderableImageMimeType(mimeType: string | null): boolean {
  return mimeType !== null && mimeType.startsWith('image/')
}

async function readImageDimensions(
  blob: Blob,
  mimeType: string,
): Promise<ImageDimensions | null> {
  if (!mimeType.startsWith('image/')) {
    return null
  }

  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob)
      const dimensions = {
        width: bitmap.width,
        height: bitmap.height,
      }
      bitmap.close()
      return dimensions
    } catch {
      // Fall back to Image decoding below.
    }
  }

  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

function formatDimensionsLabel(dimensions: ImageDimensions | null): string | null {
  if (dimensions === null) {
    return null
  }

  return `${dimensions.width.toString()} x ${dimensions.height.toString()} px`
}

function revokePreviewUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

function parseChequeStorageMetadata(payload: Uint8Array): {
  metadataJson: string | null
  metadata: ParsedChequeStorageMetadata | null
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
        cheque_no: getNonEmptyString(parsed.cheque_no),
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

function getChequeValidationStatus(isMatch: boolean): { label: string; badgeClassName: string } {
  return {
    label: isMatch ? 'Doğrulandı' : 'MICR ve QR eşleşmiyor',
    badgeClassName: isMatch
      ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
      : 'border-red-200 bg-red-100 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-300',
  }
}

export default function ScanTab({
  activeBordroId,
  expectedChequeCount: expectedChequeCountProp = null,
  initialScannedCheques = [],
  initialScanSettings,
  onScannedChequeCountChange,
  onScannedChequesChange,
  onScanSettingsChange,
  onReservationStateChange,
}: ScanTabProps) {
  const { addLog } = useLogContext()
  const expectedChequeCount = expectedChequeCountProp ?? 0
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [reservedScannerId, setReservedScannerId] = useState<string | null>(null)
  const [scannedCheques, setScannedCheques] = useState<ChequeMetadata[]>(() => initialScannedCheques)
  const [isDuplex, setIsDuplex] = useState<boolean>(
    initialScanSettings?.duplex ?? DEFAULT_SCAN_SETTINGS.duplex,
  )
  const [scanDpi, setScanDpi] = useState<number>(
    initialScanSettings?.dpi ?? DEFAULT_SCAN_SETTINGS.dpi,
  )
  const [scanColorMode, setScanColorMode] = useState<ScanColorMode>(
    initialScanSettings?.color_mode ?? DEFAULT_SCAN_SETTINGS.color_mode,
  )
  const [scanPageSize, setScanPageSize] = useState<ScanPageSize>(
    initialScanSettings?.page_size ?? DEFAULT_SCAN_SETTINGS.page_size,
  )
  const [error, setError] = useState<string | null>(null)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [scanCompletedCount, setScanCompletedCount] = useState<number>(0)
  const [scanTotalCount, setScanTotalCount] = useState<number>(expectedChequeCount ?? 0)
  const [latestCompletedChequeNo, setLatestCompletedChequeNo] = useState<number | null>(null)
  const [selectedChequeKey, setSelectedChequeKey] = useState<string | null>(null)
  const [chequeStorageDetails, setChequeStorageDetails] = useState<Record<string, ChequeStorageState>>(
    {},
  )
  const [dotsMocrAnalyses, setDotsMocrAnalyses] = useState<Record<string, DotsMocrAnalysisState>>(
    {},
  )
  const [isAnalyzingDotsMocrBatch, setIsAnalyzingDotsMocrBatch] = useState<boolean>(false)
  const chequeStorageDetailsRef = useRef<Record<string, ChequeStorageState>>({})

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const activeScannerId = activeScanner?.scanner_id ?? null
  const reservationScannerId = isReserved ? reservedScannerId : activeScannerId
  const scanDisabled = !isReserved || reservationScannerId === null || activeBordroId === null
  const sortedScannedCheques = useMemo(
    () => [...scannedCheques].sort((left, right) => left.cheque_no - right.cheque_no),
    [scannedCheques],
  )
  const effectiveExpectedChequeCount = scanTotalCount > 0 ? scanTotalCount : expectedChequeCount ?? 0
  const progressPercent = effectiveExpectedChequeCount > 0
    ? Math.min(100, Math.round((sortedScannedCheques.length / effectiveExpectedChequeCount) * 100))
    : 0
  const remainingChequeCount = effectiveExpectedChequeCount > sortedScannedCheques.length
    ? effectiveExpectedChequeCount - sortedScannedCheques.length
    : 0

  useEffect(() => {
    setIsDuplex(initialScanSettings?.duplex ?? DEFAULT_SCAN_SETTINGS.duplex)
    setScanDpi(initialScanSettings?.dpi ?? DEFAULT_SCAN_SETTINGS.dpi)
    setScanColorMode(initialScanSettings?.color_mode ?? DEFAULT_SCAN_SETTINGS.color_mode)
    setScanPageSize(initialScanSettings?.page_size ?? DEFAULT_SCAN_SETTINGS.page_size)
  }, [
    activeBordroId,
    initialScanSettings?.color_mode,
    initialScanSettings?.dpi,
    initialScanSettings?.duplex,
    initialScanSettings?.page_size,
  ])

  useEffect(() => {
    onScannedChequeCountChange?.(scannedCheques.length)
  }, [onScannedChequeCountChange, scannedCheques.length])

  useEffect(() => {
    onScannedChequesChange?.(scannedCheques)
  }, [onScannedChequesChange, scannedCheques])

  useEffect(() => {
    onScanSettingsChange?.({
      duplex: isDuplex,
      dpi: scanDpi,
      color_mode: scanColorMode,
      page_size: scanPageSize,
    })
  }, [onScanSettingsChange, scanColorMode, scanDpi, scanPageSize, isDuplex])

  useEffect(() => {
    onReservationStateChange?.({
      isReserved,
      scannerId: reservationScannerId,
      sessionId,
    })
  }, [isReserved, onReservationStateChange, reservationScannerId, sessionId])

  useEffect(() => {
    chequeStorageDetailsRef.current = chequeStorageDetails
  }, [chequeStorageDetails])

  useEffect(() => {
    setScanTotalCount(expectedChequeCount ?? 0)
  }, [expectedChequeCount])

  useEffect(() => {
    setSelectedChequeKey((previousKey) => {
      if (sortedScannedCheques.length === 0) {
        return null
      }

      if (isScanning) {
        return getChequeResultKey(sortedScannedCheques[sortedScannedCheques.length - 1])
      }

      if (
        previousKey !== null &&
        sortedScannedCheques.some((cheque) => getChequeResultKey(cheque) === previousKey)
      ) {
        return previousKey
      }

      return getChequeResultKey(sortedScannedCheques[sortedScannedCheques.length - 1])
    })
  }, [isScanning, sortedScannedCheques])

  useEffect(() => {
    return () => {
      for (const details of Object.values(chequeStorageDetailsRef.current)) {
        revokePreviewUrl(details.frontPreviewUrl)
        revokePreviewUrl(details.backPreviewUrl)
      }
    }
  }, [])

  const updateChequeStorageState = useCallback(
    (
      chequeKey: string,
      updater: (previous: ChequeStorageState | undefined) => ChequeStorageState,
    ): void => {
      setChequeStorageDetails((previousDetails) => {
        const previousState = previousDetails[chequeKey]
        const nextState = updater(previousState)

        if (previousState && previousState.frontPreviewUrl !== nextState.frontPreviewUrl) {
          revokePreviewUrl(previousState.frontPreviewUrl)
        }
        if (previousState && previousState.backPreviewUrl !== nextState.backPreviewUrl) {
          revokePreviewUrl(previousState.backPreviewUrl)
        }

        return {
          ...previousDetails,
          [chequeKey]: nextState,
        }
      })
    },
    [],
  )

  const clearAllChequeStorageDetails = useCallback((): void => {
    setChequeStorageDetails((previousDetails) => {
      for (const details of Object.values(previousDetails)) {
        revokePreviewUrl(details.frontPreviewUrl)
        revokePreviewUrl(details.backPreviewUrl)
      }

      return {}
    })
  }, [])

  const updateDotsMocrAnalysisState = useCallback(
    (
      chequeKey: string,
      updater: (previous: DotsMocrAnalysisState | undefined) => DotsMocrAnalysisState,
    ): void => {
      setDotsMocrAnalyses((previousAnalyses) => ({
        ...previousAnalyses,
        [chequeKey]: updater(previousAnalyses[chequeKey]),
      }))
    },
    [],
  )

  const loadChequeStorageDetails = useCallback(
    async (cheque: ChequeMetadata, forceReload = false): Promise<void> => {
      const chequeKey = getChequeResultKey(cheque)
      const currentState = chequeStorageDetails[chequeKey]
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

      if (!cheque.object_path.trim()) {
        updateChequeStorageState(chequeKey, (previous) => ({
          ...(previous ?? createInitialChequeStorageState()),
          isLoading: false,
          error: 'Object path boş döndü.',
        }))
        return
      }

      updateChequeStorageState(chequeKey, (previous) => ({
        ...(previous ?? createInitialChequeStorageState()),
        isLoading: true,
        error: null,
      }))

      try {
        addLog('info', `İstek: listObjects {prefix:${cheque.object_path}}`)
        const listedPaths = await listStorageObjects(cheque.object_path)
        addLog('info', `Yanıt: listObjects objects=${listedPaths.length.toString()}`)

        const resolvedPaths = resolveStorageObjectPaths(listedPaths)
        const metadataPath = resolvedPaths.metadata_path
        let metadataJson: string | null = null
        let parsedMetadata: ParsedChequeStorageMetadata | null = null

        if (metadataPath) {
          try {
            const metadataPayload = await getStorageObject(metadataPath)
            const parsedResult = parseChequeStorageMetadata(metadataPayload)
            metadataJson = parsedResult.metadataJson
            parsedMetadata = parsedResult.metadata
          } catch (metadataError) {
            const metadataMessage = getErrorMessage(metadataError)
            addLog('warn', `Uyarı: metadata.json okunamadı ${metadataMessage}`)
          }
        }

        const frontImagePath = firstNonEmpty(
          cheque.front_image_path,
          parsedMetadata?.front_image_path,
        )
        const backImagePath = firstNonEmpty(
          cheque.back_image_path,
          parsedMetadata?.back_image_path,
        )
        const frontImageMimeType = inferImageMimeType(frontImagePath)
        const backImageMimeType = inferImageMimeType(backImagePath)
        const frontImagePayload = frontImagePath ? await getStorageObject(frontImagePath) : null
        const backImagePayload = backImagePath ? await getStorageObject(backImagePath) : null
        const frontImageSizeLabel = frontImagePayload
          ? formatByteSize(frontImagePayload.length)
          : null
        const backImageSizeLabel = backImagePayload
          ? formatByteSize(backImagePayload.length)
          : null
        const frontPreviewBlob = frontImagePayload && isRenderableImageMimeType(frontImageMimeType)
          ? new Blob([new Uint8Array(frontImagePayload)], { type: frontImageMimeType ?? undefined })
          : null
        const backPreviewBlob = backImagePayload && isRenderableImageMimeType(backImageMimeType)
          ? new Blob([new Uint8Array(backImagePayload)], { type: backImageMimeType ?? undefined })
          : null
        const frontPreviewUrl = frontPreviewBlob ? URL.createObjectURL(frontPreviewBlob) : null
        const backPreviewUrl = backPreviewBlob ? URL.createObjectURL(backPreviewBlob) : null
        const frontImageDimensions =
          frontPreviewBlob && frontImageMimeType
            ? await readImageDimensions(frontPreviewBlob, frontImageMimeType)
            : null
        const backImageDimensions =
          backPreviewBlob && backImageMimeType
            ? await readImageDimensions(backPreviewBlob, backImageMimeType)
            : null

        setScannedCheques((previousCheques) => {
          let hasChanges = false

          const nextCheques = previousCheques.map((currentCheque) => {
            if (getChequeResultKey(currentCheque) !== chequeKey) {
              return currentCheque
            }

            const nextFrontImagePath = firstNonEmpty(currentCheque.front_image_path, frontImagePath)
            const nextBackImagePath = firstNonEmpty(currentCheque.back_image_path, backImagePath)
            const resolvedFrontImagePath = nextFrontImagePath ?? ''
            const resolvedBackImagePath = nextBackImagePath ?? ''

            if (
              currentCheque.front_image_path === resolvedFrontImagePath &&
              currentCheque.back_image_path === resolvedBackImagePath &&
              currentCheque.front_path === resolvedFrontImagePath &&
              currentCheque.back_path === resolvedBackImagePath
            ) {
              return currentCheque
            }

            hasChanges = true
            return {
              ...currentCheque,
              front_image_path: resolvedFrontImagePath,
              back_image_path: resolvedBackImagePath,
              front_path: resolvedFrontImagePath,
              back_path: resolvedBackImagePath,
            }
          })

          return hasChanges ? nextCheques : previousCheques
        })

        updateChequeStorageState(chequeKey, () => ({
          isLoading: false,
          error: null,
          frontImagePath,
          backImagePath,
          frontPreviewUrl,
          backPreviewUrl,
          frontImageDimensions,
          backImageDimensions,
          frontImageSizeLabel,
          backImageSizeLabel,
          metadataPath,
          metadataJson,
          metadata: parsedMetadata,
        }))
      } catch (detailsError) {
        const message = getErrorMessage(detailsError)
        updateChequeStorageState(chequeKey, (previous) => ({
          ...(previous ?? createInitialChequeStorageState()),
          isLoading: false,
          error: message,
        }))
        addLog('error', `Hata: storage detayları ${message}`)
      }
    },
    [addLog, chequeStorageDetails, updateChequeStorageState],
  )

  const runDotsMocrAnalysisForCheque = useCallback(
    async (cheque: ChequeMetadata): Promise<void> => {
      const chequeKey = getChequeResultKey(cheque)

      if (!cheque.object_path.trim()) {
        updateDotsMocrAnalysisState(chequeKey, (previous) => ({
          ...(previous ?? createInitialDotsMocrAnalysisState()),
          isLoading: false,
          error: 'Object path boş olduğu için dots.mocr analizi çalıştırılamadı.',
        }))
        return
      }

      updateDotsMocrAnalysisState(chequeKey, (previous) => ({
        ...(previous ?? createInitialDotsMocrAnalysisState()),
        isLoading: true,
        error: null,
      }))

      try {
        addLog(
          'info',
          `İstek: analyzeChequeWithDotsMocr {object_path:${cheque.object_path}}`,
        )
        const result = await analyzeChequeWithDotsMocr({
          object_path: cheque.object_path,
        })
        updateDotsMocrAnalysisState(chequeKey, () => ({
          isLoading: false,
          error: null,
          result,
        }))
        addLog(
          'info',
          `Yanıt: analyzeChequeWithDotsMocr cheque_no=${cheque.cheque_no.toString()} model=${result.model || '-'} content_len=${result.content.length.toString()}`,
        )
      } catch (analysisError) {
        const message = getErrorMessage(analysisError)
        updateDotsMocrAnalysisState(chequeKey, (previous) => ({
          ...(previous ?? createInitialDotsMocrAnalysisState()),
          isLoading: false,
          error: message,
        }))
        addLog(
          'error',
          `Hata: analyzeChequeWithDotsMocr cheque_no=${cheque.cheque_no.toString()} ${message}`,
        )
      }
    },
    [addLog, updateDotsMocrAnalysisState],
  )

  const analyzeAllScannedChequesWithDotsMocr = useCallback(async (): Promise<void> => {
    if (sortedScannedCheques.length === 0 || isAnalyzingDotsMocrBatch) {
      return
    }

    setIsAnalyzingDotsMocrBatch(true)
    try {
      for (const cheque of sortedScannedCheques) {
        await runDotsMocrAnalysisForCheque(cheque)
      }
    } finally {
      setIsAnalyzingDotsMocrBatch(false)
    }
  }, [isAnalyzingDotsMocrBatch, runDotsMocrAnalysisForCheque, sortedScannedCheques])

  useEffect(() => {
    for (const cheque of scannedCheques) {
      const chequeKey = getChequeResultKey(cheque)
      if (!chequeStorageDetails[chequeKey]) {
        void loadChequeStorageDetails(cheque)
      }
    }
  }, [chequeStorageDetails, loadChequeStorageDetails, scannedCheques])

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
    const pageSize = scanPageSize
    setIsScanning(true)
    setScanCompletedCount(0)
    setScanTotalCount(expectedChequeCount ?? 0)
    setLatestCompletedChequeNo(null)

    try {
      const completedCheques: ChequeMetadata[] = []
      console.log('scan request', {
        duplex: isDuplex,
        dpi,
        colorMode,
        pageSize,
        scannerId,
        bordroId,
      })
      addLog(
        'info',
        `İstek: scanBordro {scanner_id:${scannerId}, session_id:${sessionId}, bordro_id:${bordroId}, duplex:${isDuplex ? 'true' : 'false'}, dpi:${dpi.toString()}, color_mode:${colorMode}, page_size:${pageSize}}`,
      )
      clearAllChequeStorageDetails()
      setScannedCheques([])
      await scanBordroStream({
        scanner_id: scannerId,
        session_id: sessionId,
        bordro_id: bordroId,
        duplex: isDuplex,
        dpi,
        color_mode: colorMode,
        page_size: pageSize,
        onProgress(progress) {
          completedCheques.push(progress.cheque)
          setScanCompletedCount(progress.completed_count)
          setScanTotalCount(progress.total_count)
          setLatestCompletedChequeNo(progress.cheque.cheque_no)
          setSelectedChequeKey(getChequeResultKey(progress.cheque))
          setScannedCheques((previousCheques) => {
            const existingIndex = previousCheques.findIndex(
              (currentCheque) => currentCheque.cheque_no === progress.cheque.cheque_no,
            )
            if (existingIndex < 0) {
              return [...previousCheques, progress.cheque]
            }

            const nextCheques = [...previousCheques]
            nextCheques[existingIndex] = progress.cheque
            return nextCheques
          })
          addLog(
            'info',
            `Yanıt: scanBordro cheque_no=${progress.cheque.cheque_no.toString()} tamamlandı (${progress.completed_count.toString()}/${progress.total_count.toString()})`,
          )
        },
      })
      addLog('info', `Yanıt: scanBordro cheques=${completedCheques.length.toString()}`)

      if (completedCheques.length === 0) {
        const emptyResultMessage =
          'Bordro için taranacak çek bulunamadı. Muhtemelen bordro cheque_count=0 oluşturuldu.'
        setError(emptyResultMessage)
        addLog('warn', `Uyarı: scanBordro ${emptyResultMessage}`)
        return
      }

      const expectedPageCount = isDuplex ? 2 : 1
      const unexpectedPageCountCheques = completedCheques.filter(
        (cheque) => cheque.page_count !== expectedPageCount,
      )
      if (unexpectedPageCountCheques.length > 0) {
        addLog(
          'warn',
          `Uyarı: scanBordro ${unexpectedPageCountCheques.length.toString()} çekte page_count beklenen ${expectedPageCount.toString()} dışında.`,
        )
      }
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      if (isFailedPreconditionError(message)) {
        const failedPreconditionMessage =
          'Tarama başlatılamadı: failed_precondition. Muhtemelen bordro cheque_count=0 oluşturuldu.'
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

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Sayfa Boyutu</span>
            <select
              value={scanPageSize}
              disabled={isScanning}
              onChange={(event) => {
                const nextPageSize = event.target.value as ScanPageSize
                if (nextPageSize === 'CHEQUE' || nextPageSize === 'A4') {
                  setScanPageSize(nextPageSize)
                }
              }}
              className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
            >
              {SCAN_PAGE_SIZE_OPTIONS.map((option) => (
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
              {effectiveExpectedChequeCount > 0
                ? `${sortedScannedCheques.length.toString()}/${expectedChequeCount.toString()} çek hazır, tarama devam ediyor…`
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonuçları</h3>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {sortedScannedCheques.length.toString()} çek
          </span>
        </div>

        {(isScanning || sortedScannedCheques.length > 0) ? (
          <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-4 shadow-sm dark:border-cyan-500/30 dark:from-cyan-500/10 dark:via-slate-950 dark:to-amber-500/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                  Canlı Akış
                </p>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isScanning ? 'İlk tamamlanan çekler hazır, tarama akıyor.' : 'Tarama tamamlandı.'}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {effectiveExpectedChequeCount > 0
                    ? `${scanCompletedCount.toString()}/${effectiveExpectedChequeCount.toString()} çek işlendi.`
                    : `${sortedScannedCheques.length.toString()} çek hazır.`}
                </p>
                {latestCompletedChequeNo !== null ? (
                  <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                    Son tamamlanan çek: {latestCompletedChequeNo.toString()}
                  </p>
                ) : null}
              </div>
              <div className="grid min-w-[220px] gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Hazır
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {sortedScannedCheques.length.toString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Kalan
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {remainingChequeCount.toString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    İlerleme
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    %{progressPercent.toString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progressPercent.toString()}%` }}
              />
            </div>
          </div>
        ) : null}

        {sortedScannedCheques.length === 0 && !isScanning ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Henüz çek taranmadı.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  dots.mocr Sonradan Analiz
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Taranmış çeklerin front image&apos;ı storage üstünden okunur ve vLLM&apos;ye gönderilir.
                </p>
              </div>
              <button
                type="button"
                disabled={sortedScannedCheques.length === 0 || isAnalyzingDotsMocrBatch}
                onClick={() => {
                  void analyzeAllScannedChequesWithDotsMocr()
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ScanLine className={`h-4 w-4 ${isAnalyzingDotsMocrBatch ? 'animate-pulse' : ''}`} />
                {isAnalyzingDotsMocrBatch
                  ? 'dots.mocr Analizi Çalışıyor…'
                  : 'Taranan Çekleri dots.mocr ile Analiz Et'}
              </button>
            </div>
            {sortedScannedCheques.map((cheque) => {
              const chequeKey = getChequeResultKey(cheque)
              const storageDetails = chequeStorageDetails[chequeKey]
              const dotsMocrAnalysis = dotsMocrAnalyses[chequeKey]
              const dotsMocrDisplayFields = dotsMocrAnalysis?.result
                ? parseDotsMocrDisplayFields(
                    dotsMocrAnalysis.result.content,
                    dotsMocrAnalysis.result.raw_response_json,
                  )
                : null
              const isDetailsLoading = storageDetails?.isLoading ?? true
              const metadata = storageDetails?.metadata
              const micrData = firstNonEmpty(cheque.micr_data, metadata?.micr_data, cheque.micr) ?? '-'
              const qrData = firstNonEmpty(cheque.qr_data, metadata?.qr_data, cheque.qr) ?? '-'
              const micrNotRead = micrData === 'MICR_NOT_READ'
              const qrNotRead = qrData === 'QR_NOT_READ'
              const micrQrMatch = metadata?.micr_qr_match ?? cheque.micr_qr_match
              const validationStatus = getChequeValidationStatus(micrQrMatch)
              const frontImageSizeLabel = storageDetails?.frontImageSizeLabel ?? null
              const backImageSizeLabel = storageDetails?.backImageSizeLabel ?? null
              const frontPreviewUrl = storageDetails?.frontPreviewUrl ?? null
              const backPreviewUrl = storageDetails?.backPreviewUrl ?? null
              const frontPreviewDimensions = formatDimensionsLabel(storageDetails?.frontImageDimensions ?? null)
              const backPreviewDimensions = formatDimensionsLabel(storageDetails?.backImageDimensions ?? null)
              const hasBackPreview = cheque.effective_duplex || cheque.page_count > 1
              const scanSettings = [
                {
                  key: 'duplex',
                  label: 'Duplex',
                  requested: formatDuplexLabel(cheque.duplex),
                  effective: formatDuplexLabel(cheque.effective_duplex),
                  status: getSettingStatus(cheque.duplex_verified, cheque.duplex === cheque.effective_duplex),
                },
                {
                  key: 'dpi',
                  label: 'DPI',
                  requested: cheque.dpi > 0 ? cheque.dpi.toString() : '-',
                  effective: cheque.effective_dpi > 0 ? cheque.effective_dpi.toString() : '-',
                  status: getSettingStatus(cheque.dpi_verified, cheque.dpi === cheque.effective_dpi),
                },
                {
                  key: 'color_mode',
                  label: 'Renk Modu',
                  requested: formatScanColorModeLabel(cheque.color_mode),
                  effective: formatScanColorModeLabel(cheque.effective_color_mode),
                  status: getSettingStatus(
                    cheque.color_mode_verified,
                    cheque.color_mode === cheque.effective_color_mode,
                  ),
                },
                {
                  key: 'page_size',
                  label: 'Sayfa Boyutu',
                  requested: cheque.page_size,
                  effective: cheque.page_size,
                  status: getSettingStatus(true, true),
                },
              ]

              return (
                <article
                  key={chequeKey}
                  className={`space-y-3 rounded-2xl border p-4 transition ${
                    selectedChequeKey === chequeKey
                      ? 'border-cyan-300 bg-cyan-50/50 shadow-sm dark:border-cyan-500/40 dark:bg-cyan-500/5'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        Çek No {cheque.cheque_no}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChequeKey(chequeKey)
                        }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          selectedChequeKey === chequeKey
                            ? 'border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {selectedChequeKey === chequeKey ? 'Seçili' : 'Seç'}
                      </button>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${validationStatus.badgeClassName}`}
                      >
                        {validationStatus.label}
                      </span>
                      <button
                        type="button"
                        disabled={isDetailsLoading}
                        onClick={() => {
                          void loadChequeStorageDetails(cheque, true)
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {isDetailsLoading ? 'Yenileniyor…' : 'Verileri Yenile'}
                      </button>
                      <button
                        type="button"
                        disabled={dotsMocrAnalysis?.isLoading === true}
                        onClick={() => {
                          void runDotsMocrAnalysisForCheque(cheque)
                        }}
                        className="rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                      >
                        {dotsMocrAnalysis?.isLoading ? 'dots.mocr…' : 'dots.mocr Analiz'}
                      </button>
                    </div>
                  </div>

                  {storageDetails?.error ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      {storageDetails.error}
                    </p>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        key: 'front',
                        label: 'Ön Yüz',
                        previewUrl: frontPreviewUrl,
                        sizeLabel: frontImageSizeLabel,
                        dimensionsLabel: frontPreviewDimensions,
                        emptyLabel: 'Ön yüz hazırlanıyor…',
                      },
                      {
                        key: 'back',
                        label: 'Arka Yüz',
                        previewUrl: backPreviewUrl,
                        sizeLabel: backImageSizeLabel,
                        dimensionsLabel: backPreviewDimensions,
                        emptyLabel: hasBackPreview ? 'Arka yüz hazırlanıyor…' : 'Arka yüz yok',
                      },
                    ].map((preview) => (
                      <div key={preview.key} className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {preview.label}
                          </p>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {preview.dimensionsLabel ?? preview.sizeLabel ?? '-'}
                          </span>
                        </div>
                        <div className="flex min-h-[132px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                          {preview.previewUrl ? (
                            <img
                              src={preview.previewUrl}
                              alt={`${preview.label} - Çek ${cheque.cheque_no.toString()}`}
                              className="h-full max-h-[148px] w-full rounded-lg object-contain"
                            />
                          ) : (
                            <div className="space-y-1 text-center">
                              <ImageIcon className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-700" />
                              <p className="text-xs text-slate-500 dark:text-slate-400">{preview.emptyLabel}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

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

                  <div className="grid gap-3 md:grid-cols-2">
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
                        Tarama Uyumluluğu
                      </p>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        Sayfa Sayısı:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {cheque.page_count.toString()}
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
                      <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        {storageDetails.metadataJson}
                      </pre>
                    </details>
                  ) : null}
                  {dotsMocrAnalysis?.error ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      dots.mocr hatası: {dotsMocrAnalysis.error}
                    </div>
                  ) : null}
                  {dotsMocrAnalysis?.result ? (
                    <details className="rounded-md border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-500/30 dark:bg-cyan-500/10">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-cyan-800 dark:text-cyan-300">
                        dots.mocr sonucu
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="rounded-full border border-cyan-200 bg-white px-2 py-1 dark:border-cyan-500/30 dark:bg-slate-950/70">
                          model: {dotsMocrAnalysis.result.model || '-'}
                        </span>
                        <span className="rounded-full border border-cyan-200 bg-white px-2 py-1 dark:border-cyan-500/30 dark:bg-slate-950/70">
                          prompt: {dotsMocrAnalysis.result.prompt_mode || '-'}
                        </span>
                      </div>
                      {dotsMocrDisplayFields ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {dotsMocrDisplayFields.map((field) => (
                            <div
                              key={field.keyPath || field.label}
                              className="rounded-md border border-cyan-200 bg-white p-2 dark:border-cyan-500/30 dark:bg-slate-950/70"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                {field.label}
                              </p>
                              <p className="mt-1 break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {field.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <details className="mt-3 rounded-md border border-cyan-200 bg-white px-3 py-2 dark:border-cyan-500/30 dark:bg-slate-950/70">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
                          Ham JSON
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-cyan-200 bg-slate-50 p-2 text-[11px] text-slate-700 dark:border-cyan-500/30 dark:bg-slate-950 dark:text-slate-300">
                          {dotsMocrAnalysis.result.raw_response_json || dotsMocrAnalysis.result.content || '-'}
                        </pre>
                      </details>
                    </details>
                  ) : null}
                </article>
              )
            })}
            {isScanning && remainingChequeCount > 0
              ? Array.from({ length: Math.min(remainingChequeCount, 3) }, (_, index) => (
                  <article
                    key={`pending-${index.toString()}`}
                    className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-3 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-52 rounded-full bg-slate-200 dark:bg-slate-800" />
                      </div>
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
                      <div className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
                      <div className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sıradaki çekler taranıyor ve işleniyor…
                    </p>
                  </article>
                ))
              : null}
          </div>
        )}
      </section>
    </div>
  )
}
