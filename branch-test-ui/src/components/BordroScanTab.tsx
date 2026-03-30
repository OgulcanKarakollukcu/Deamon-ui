import { Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  getStorageObject,
  listScanners,
  listStorageObjects,
  releaseScanner,
  reserveScanner,
  resolveStorageObjectPaths,
  scanBordroDocument,
} from '../services'
import type { BordroScanMetadata, ScanColorMode, ScanPageSize, Scanner } from '../types'

type BordroScanTabProps = {
  activeBordroId: string | null
}

type SelectedPageState = {
  resultId: string
  side: 'front' | 'back'
}

type ViewerState = {
  isLoading: boolean
  objectUrl: string | null
  objectPath: string | null
  mimeType: string | null
  byteSize: number | null
  imageWidth: number | null
  imageHeight: number | null
  renderFailed: boolean
  error: string | null
}

type ParsedBordroScanStorageMetadata = {
  front_image_path: string | null
  back_image_path: string | null
  front_image_content_type: string | null
  back_image_content_type: string | null
}

type BordroScanStorageState = {
  isLoading: boolean
  error: string | null
  frontImagePath: string | null
  backImagePath: string | null
  frontImageContentType: string | null
  backImageContentType: string | null
  frontImageSizeLabel: string | null
  backImageSizeLabel: string | null
  metadataPath: string | null
  metadataJson: string | null
}

type BordroScanHistoryEntry = BordroScanMetadata & {
  resultId: string
}

const INITIAL_VIEWER_STATE: ViewerState = {
  isLoading: false,
  objectUrl: null,
  objectPath: null,
  mimeType: null,
  byteSize: null,
  imageWidth: null,
  imageHeight: null,
  renderFailed: false,
  error: null,
}

const SCAN_DPI_OPTIONS = [300, 600]
const SCAN_COLOR_MODE_OPTIONS: Array<{ value: ScanColorMode; label: string }> = [
  { value: 'COLOR', label: 'Renkli' },
  { value: 'GRAYSCALE', label: 'Gri Ton' },
  { value: 'BLACK_AND_WHITE', label: 'Siyah-Beyaz' },
]
const SCAN_PAGE_SIZE_OPTIONS: Array<{ value: ScanPageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'CHEQUE', label: 'Cek' },
]

const SCANNER_STATUS_META: Record<
  Scanner['pc_daemon_status'],
  { label: string; badgeClassName: string }
> = {
  available: {
    label: 'Musait',
    badgeClassName:
      'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  reserved: {
    label: 'Rezerve',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  },
  unavailable: {
    label: 'Hazir Degil',
    badgeClassName:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
}

let cachedSessionId: string | null = null

function createInitialStorageState(): BordroScanStorageState {
  return {
    isLoading: false,
    error: null,
    frontImagePath: null,
    backImagePath: null,
    frontImageContentType: null,
    backImageContentType: null,
    frontImageSizeLabel: null,
    backImageSizeLabel: null,
    metadataPath: null,
    metadataJson: null,
  }
}

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

function createResultId(): string {
  const cryptoApi = globalThis.crypto
  return typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : createFallbackSessionId()
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
  return duplex ? 'Cift Yuz' : 'Tek Yuz'
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
      label: 'Dogrulanamadi',
      badgeClassName:
        'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    }
  }

  if (matches) {
    return {
      label: 'Uygulandi',
      badgeClassName:
        'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }

  return {
    label: 'Farklilasti',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  }
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

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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

function parseBordroScanStorageMetadata(payload: Uint8Array): {
  metadataJson: string | null
  metadata: ParsedBordroScanStorageMetadata | null
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
        front_image_path: getNonEmptyString(parsed.front_image_path),
        back_image_path: getNonEmptyString(parsed.back_image_path),
        front_image_content_type: getNonEmptyString(parsed.front_image_content_type),
        back_image_content_type: getNonEmptyString(parsed.back_image_content_type),
      },
    }
  } catch {
    return {
      metadataJson: decodedText,
      metadata: null,
    }
  }
}

function inferMimeTypeFromPath(path: string): string {
  const normalized = path.trim().toLowerCase()
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.png')) {
    return 'image/png'
  }

  return 'application/octet-stream'
}

function resolvePreviewMimeType(contentType: string | null, path: string): string {
  const normalizedContentType = contentType?.trim() ?? ''
  if (normalizedContentType.length > 0) {
    return normalizedContentType
  }

  return inferMimeTypeFromPath(path)
}

function isRenderableImageMimeType(mimeType: string | null): boolean {
  if (mimeType === null) {
    return false
  }

  return mimeType.startsWith('image/')
}

function resolveDownloadExtension(path: string, mimeType: string | null): string {
  const normalizedPath = path.trim().toLowerCase()
  if (normalizedPath.endsWith('.png')) {
    return '.png'
  }

  if (normalizedPath.endsWith('.jpg')) {
    return '.jpg'
  }

  if (normalizedPath.endsWith('.jpeg')) {
    return '.jpeg'
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ''
  if (normalizedMimeType === 'image/png') {
    return '.png'
  }

  if (normalizedMimeType === 'image/jpeg') {
    return '.jpg'
  }

  return '.bin'
}

async function readImageDimensions(blob: Blob, mimeType: string): Promise<{ width: number; height: number } | null> {
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

function hasBackPage(result: BordroScanMetadata): boolean {
  return result.effective_duplex || result.page_count > 1
}

export default function BordroScanTab({ activeBordroId }: BordroScanTabProps) {
  const { addLog } = useLogContext()
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [reservedScannerId, setReservedScannerId] = useState<string | null>(null)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [bordroIdInput, setBordroIdInput] = useState<string>(activeBordroId ?? '')
  const [isDuplex, setIsDuplex] = useState<boolean>(false)
  const [scanDpi, setScanDpi] = useState<number>(300)
  const [scanColorMode, setScanColorMode] = useState<ScanColorMode>('COLOR')
  const [scanPageSize, setScanPageSize] = useState<ScanPageSize>('A4')
  const [scanResults, setScanResults] = useState<BordroScanHistoryEntry[]>([])
  const [storageDetailsByResultId, setStorageDetailsByResultId] = useState<
    Record<string, BordroScanStorageState>
  >({})
  const [selectedPage, setSelectedPage] = useState<SelectedPageState | null>(null)
  const [viewer, setViewer] = useState<ViewerState>(INITIAL_VIEWER_STATE)

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const activeScannerId = activeScanner?.scanner_id ?? null
  const reservationScannerId = isReserved ? reservedScannerId : activeScannerId
  const targetBordroId = bordroIdInput.trim()
  const scanDisabled = !isReserved || reservationScannerId === null || targetBordroId.length === 0
  const selectedResult = useMemo(() => {
    if (selectedPage === null) {
      return null
    }

    return scanResults.find((result) => result.resultId === selectedPage.resultId) ?? null
  }, [scanResults, selectedPage])
  const selectedStorageDetails = selectedResult
    ? storageDetailsByResultId[selectedResult.resultId] ?? null
    : null

  const updateViewer = useCallback(
    (updater: ViewerState | ((previous: ViewerState) => ViewerState)) => {
      setViewer((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        if (previous.objectUrl && previous.objectUrl !== next.objectUrl) {
          URL.revokeObjectURL(previous.objectUrl)
        }
        return next
      })
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (viewer.objectUrl) {
        URL.revokeObjectURL(viewer.objectUrl)
      }
    }
  }, [viewer.objectUrl])

  useEffect(() => {
    if (!bordroIdInput.trim() && activeBordroId) {
      setBordroIdInput(activeBordroId)
    }
  }, [activeBordroId, bordroIdInput])

  useEffect(() => {
    if (selectedPage !== null || scanResults.length === 0) {
      return
    }

    setSelectedPage({
      resultId: scanResults[0].resultId,
      side: 'front',
    })
  }, [scanResults, selectedPage])

  useEffect(() => {
    if (selectedPage === null) {
      return
    }

    const currentResult = scanResults.find((result) => result.resultId === selectedPage.resultId)
    if (!currentResult) {
      setSelectedPage(null)
      return
    }

    if (selectedPage.side === 'back' && !hasBackPage(currentResult)) {
      setSelectedPage({
        resultId: currentResult.resultId,
        side: 'front',
      })
    }
  }, [scanResults, selectedPage])

  const updateStorageState = useCallback(
    (
      resultId: string,
      updater: (previous: BordroScanStorageState | undefined) => BordroScanStorageState,
    ): void => {
      setStorageDetailsByResultId((previous) => ({
        ...previous,
        [resultId]: updater(previous[resultId]),
      }))
    },
    [],
  )

  const loadStorageDetails = useCallback(
    async (result: BordroScanHistoryEntry, forceReload = false): Promise<void> => {
      const currentState = storageDetailsByResultId[result.resultId]
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

      updateStorageState(result.resultId, (previous) => ({
        ...(previous ?? createInitialStorageState()),
        isLoading: true,
        error: null,
      }))

      try {
        addLog('info', `Istek: listObjects {prefix:${result.object_path}}`)
        const listedPaths = await listStorageObjects(result.object_path)
        addLog('info', `Yanit: listObjects objects=${listedPaths.length.toString()}`)

        const resolvedPaths = resolveStorageObjectPaths(listedPaths)
        const metadataPath = resolvedPaths.metadata_path
        let metadataJson: string | null = null
        let parsedMetadata: ParsedBordroScanStorageMetadata | null = null

        if (metadataPath) {
          try {
            const metadataPayload = await getStorageObject(metadataPath)
            const parsedResult = parseBordroScanStorageMetadata(metadataPayload)
            metadataJson = parsedResult.metadataJson
            parsedMetadata = parsedResult.metadata
          } catch (metadataError) {
            addLog('warn', `Uyari: metadata.json okunamadi ${getErrorMessage(metadataError)}`)
          }
        }

        const frontImagePath = firstNonEmpty(resolvedPaths.front_path, parsedMetadata?.front_image_path)
        const backImagePath = firstNonEmpty(resolvedPaths.back_path, parsedMetadata?.back_image_path)
        const frontImageSizeLabel = frontImagePath
          ? formatByteSize((await getStorageObject(frontImagePath)).length)
          : null
        const backImageSizeLabel = backImagePath
          ? formatByteSize((await getStorageObject(backImagePath)).length)
          : null

        updateStorageState(result.resultId, () => ({
          isLoading: false,
          error: null,
          frontImagePath,
          backImagePath,
          frontImageContentType: parsedMetadata?.front_image_content_type ?? null,
          backImageContentType: parsedMetadata?.back_image_content_type ?? null,
          frontImageSizeLabel,
          backImageSizeLabel,
          metadataPath,
          metadataJson,
        }))
      } catch (storageError) {
        const message = getErrorMessage(storageError)
        updateStorageState(result.resultId, (previous) => ({
          ...(previous ?? createInitialStorageState()),
          isLoading: false,
          error: message,
        }))
        addLog('error', `Hata: bordro storage detaylari ${message}`)
      }
    },
    [addLog, storageDetailsByResultId, updateStorageState],
  )

  useEffect(() => {
    for (const result of scanResults) {
      if (!storageDetailsByResultId[result.resultId]) {
        void loadStorageDetails(result)
      }
    }
  }, [loadStorageDetails, scanResults, storageDetailsByResultId])

  const loadSelectedPreview = useCallback(async (): Promise<void> => {
    if (selectedPage === null || selectedResult === null) {
      updateViewer({
        ...INITIAL_VIEWER_STATE,
        objectPath: null,
      })
      return
    }

    if (!selectedStorageDetails || selectedStorageDetails.isLoading) {
      updateViewer((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
        renderFailed: false,
      }))
      return
    }

    const path =
      selectedPage.side === 'front'
        ? selectedStorageDetails.frontImagePath
        : selectedStorageDetails.backImagePath
    const contentType =
      selectedPage.side === 'front'
        ? selectedStorageDetails.frontImageContentType
        : selectedStorageDetails.backImageContentType

    if (!path) {
      updateViewer({
        isLoading: false,
        objectUrl: null,
        objectPath: null,
        mimeType: null,
        byteSize: null,
        imageWidth: null,
        imageHeight: null,
        renderFailed: false,
        error: selectedPage.side === 'back' ? null : 'On yuz goruntusu bulunamadi.',
      })
      return
    }

    updateViewer((previous) => ({
      ...previous,
      isLoading: true,
      error: null,
      renderFailed: false,
    }))

    try {
      const objectBytes = await getStorageObject(path)
      if (objectBytes.length === 0) {
        throw new Error('Goruntu verisi bos dondu.')
      }

      const mimeType = resolvePreviewMimeType(contentType, path)
      const copied = new Uint8Array(objectBytes.byteLength)
      copied.set(objectBytes)
      const blob = new Blob([copied], { type: mimeType })
      const objectUrl = URL.createObjectURL(blob)
      const dimensions = await readImageDimensions(blob, mimeType)

      updateViewer({
        isLoading: false,
        objectUrl,
        objectPath: path,
        mimeType,
        byteSize: blob.size,
        imageWidth: dimensions?.width ?? null,
        imageHeight: dimensions?.height ?? null,
        renderFailed: false,
        error: null,
      })
    } catch (previewError) {
      updateViewer((previous) => ({
        ...previous,
        isLoading: false,
        objectUrl: null,
        mimeType: null,
        byteSize: null,
        imageWidth: null,
        imageHeight: null,
        renderFailed: false,
        error: getErrorMessage(previewError),
      }))
    }
  }, [selectedPage, selectedResult, selectedStorageDetails, updateViewer])

  useEffect(() => {
    void loadSelectedPreview()
  }, [loadSelectedPreview])

  const handleListScanners = useCallback(async (): Promise<void> => {
    setError(null)
    setIsListing(true)

    try {
      addLog('info', 'Istek: listScanners {}')
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
      addLog('info', `Yanit: listScanners scanners=${listedScanners.length.toString()}`)
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
      setError('Once bir scanner secin.')
      return
    }

    const scannerKey = getScannerSelectionKey(scanner)
    if (selectedScannerKey !== scannerKey) {
      setSelectedScannerKey(scannerKey)
    }

    const scannerId = scanner.scanner_id
    setIsReserving(true)

    try {
      addLog('info', `Istek: reserveScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await reserveScanner(scannerId, sessionId)
      setIsReserved(true)
      setReservedScannerId(scannerId)
      addLog('info', `Yanit: reserveScanner scanner_id=${scannerId}`)
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
      addLog('info', `Istek: releaseScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await releaseScanner(scannerId, sessionId)
      setIsReserved(false)
      setReservedScannerId(null)
      setSelectedScannerKey(null)
      addLog('info', `Yanit: releaseScanner scanner_id=${scannerId}`)
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
      setError('Tarama icin once scanner rezervasyonu yapin.')
      return
    }

    if (targetBordroId.length === 0) {
      setError('Bordro ID zorunlu.')
      return
    }

    if (!SCAN_DPI_OPTIONS.includes(scanDpi)) {
      setError('DPI alani 300 veya 600 olmali.')
      return
    }

    setIsScanning(true)

    try {
      addLog(
        'info',
        `Istek: scanServiceScanBordro {scanner_id:${scannerId}, session_id:${sessionId}, bordro_id:${targetBordroId}, duplex:${isDuplex ? 'true' : 'false'}, dpi:${scanDpi.toString()}, color_mode:${scanColorMode}, page_size:${scanPageSize}}`,
      )

      const metadata = await scanBordroDocument({
        scanner_id: scannerId,
        session_id: sessionId,
        bordro_id: targetBordroId,
        duplex: isDuplex,
        dpi: scanDpi,
        color_mode: scanColorMode,
        page_size: scanPageSize,
      })

      const nextResult: BordroScanHistoryEntry = {
        ...metadata,
        resultId: createResultId(),
      }

      setScanResults((previous) => [nextResult, ...previous])
      setSelectedPage({
        resultId: nextResult.resultId,
        side: 'front',
      })
      addLog('info', `Yanit: scanServiceScanBordro object_path=${metadata.object_path}`)
      void loadStorageDetails(nextResult, true)
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      setError(message)
      addLog('error', `Hata: scanServiceScanBordro ${message}`)
    } finally {
      setIsScanning(false)
    }
  }

  const viewerInfo = [
    viewer.mimeType,
    viewer.byteSize !== null ? formatByteSize(viewer.byteSize) : null,
    viewer.imageWidth !== null && viewer.imageHeight !== null
      ? `${viewer.imageWidth.toString()} x ${viewer.imageHeight.toString()} px`
      : null,
  ].filter((value): value is string => Boolean(value))

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Adim 1
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Scanner Secimi ve Rezervasyon
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
            {isListing ? 'Yenileniyor...' : 'Tarayicilari Yenile'}
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
                    ? 'Hazir Degil'
                    : isReserving && isSelected
                      ? 'Rezerve Ediliyor...'
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
                      {isSelected ? 'Secildi' : 'Sec'}
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
            Kullanilabilir scanner bulunamadi.
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
              {isReleasing ? 'Birakiliyor...' : 'Rezervasyonu Birak'}
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
            Adim 2
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            A4 Bordro Tarama
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Bu ekran duz bordro dokumani tarar. MICR veya QR tespiti yapmaz.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Aktif Bordro
            </p>
            {activeBordroId ? (
              <>
                <p className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                  {activeBordroId}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBordroIdInput(activeBordroId)
                  }}
                  className="mt-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Bu bordroyu kullan
                </button>
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Bordro sekmesinde bir bordro secip burada kullanabilirsiniz.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Hedef Bordro ID
            </p>
            <input
              type="text"
              value={bordroIdInput}
              onChange={(event) => {
                setBordroIdInput(event.target.value)
              }}
              placeholder="Bordro ID girin"
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rezervasyon
            </p>
            {isReserved ? (
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                Hazir: <span className="font-mono font-medium">{reservedScannerId ?? activeScannerId ?? '-'}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Tarama icin once scanner rezerve edin.
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
            {isDuplex ? 'Cift Yuz' : 'Tek Yuz'}
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
                if (nextPageSize === 'A4' || nextPageSize === 'CHEQUE') {
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
            {isScanning ? 'Taraniyor...' : 'Tara'}
          </button>
        </form>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonuclari</h3>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {scanResults.length.toString()} dokuman
            </span>
          </div>

          {scanResults.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              Henuz bordro taramasi alinmadi.
            </p>
          ) : (
            <div className="space-y-4">
              {scanResults.map((result, index) => {
                const storageDetails = storageDetailsByResultId[result.resultId]
                const scanSettings = [
                  {
                    key: 'duplex',
                    label: 'Duplex',
                    requested: formatDuplexLabel(result.duplex),
                    effective: formatDuplexLabel(result.effective_duplex),
                    status: getSettingStatus(result.duplex_verified, result.duplex === result.effective_duplex),
                  },
                  {
                    key: 'dpi',
                    label: 'DPI',
                    requested: result.dpi > 0 ? result.dpi.toString() : '-',
                    effective: result.effective_dpi > 0 ? result.effective_dpi.toString() : '-',
                    status: getSettingStatus(result.dpi_verified, result.dpi === result.effective_dpi),
                  },
                  {
                    key: 'color_mode',
                    label: 'Renk Modu',
                    requested: formatScanColorModeLabel(result.color_mode),
                    effective: formatScanColorModeLabel(result.effective_color_mode),
                    status: getSettingStatus(
                      result.color_mode_verified,
                      result.color_mode === result.effective_color_mode,
                    ),
                  },
                  {
                    key: 'page_size',
                    label: 'Sayfa Boyutu',
                    requested: result.page_size,
                    effective: result.page_size,
                    status: getSettingStatus(true, true),
                  },
                ]

                return (
                  <article
                    key={result.resultId}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Tarama {index + 1}
                        </p>
                        <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                          {result.object_path}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={storageDetails?.isLoading ?? false}
                        onClick={() => {
                          void loadStorageDetails(result, true)
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {storageDetails?.isLoading ? 'Yenileniyor...' : 'Yollari Yenile'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPage({ resultId: result.resultId, side: 'front' })
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                          selectedPage?.resultId === result.resultId && selectedPage.side === 'front'
                            ? 'bg-cyan-600 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        On Yuz
                      </button>
                      {hasBackPage(result) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPage({ resultId: result.resultId, side: 'back' })
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                            selectedPage?.resultId === result.resultId && selectedPage.side === 'back'
                              ? 'bg-cyan-600 text-white'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Arka Yuz
                        </button>
                      ) : null}
                    </div>

                    {storageDetails?.error ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                        {storageDetails.error}
                      </p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Depolama Referanslari
                        </p>
                        <div className="mt-2 space-y-2">
                          <div>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">front_image_path</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {storageDetails?.frontImagePath ?? '-'}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Boyut: {storageDetails?.frontImageSizeLabel ?? '-'}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">back_image_path</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {storageDetails?.backImagePath ?? 'Arka yuz yok'}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Boyut:{' '}
                              {storageDetails?.backImageSizeLabel ??
                                (storageDetails?.backImagePath ? '-' : 'Arka yuz yok')}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">metadata.json</p>
                            <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {storageDetails?.metadataPath ?? '-'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tarama Ozeti
                        </p>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          Sayfa Sayisi:{' '}
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {result.page_count.toString()}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          Bordro ID:{' '}
                          <span className="font-mono text-slate-700 dark:text-slate-200">{result.bordro_id}</span>
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
                                Istenen: {setting.requested} | Uygulanan: {setting.effective}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Durum
                        </p>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                          Bu kayit sadece dokuman taramasi icerir.
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          MICR ve QR analizi bu akista calistirilmaz.
                        </p>
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
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <section className="min-h-0 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex h-full min-h-[420px] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dokuman Onizleme</h3>
              {selectedResult ? (
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedResult.object_path}
                </p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 p-4">
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-900">
                {selectedResult === null || selectedPage === null ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Onizleme icin bir tarama secin.</p>
                ) : viewer.isLoading ? (
                  <div className="h-56 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
                ) : viewer.error ? (
                  <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
                    <p>{viewer.error}</p>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSelectedPreview()
                      }}
                      className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-slate-800"
                    >
                      Tekrar Dene
                    </button>
                  </div>
                ) : viewer.objectUrl && isRenderableImageMimeType(viewer.mimeType) && !viewer.renderFailed ? (
                  <img
                    src={viewer.objectUrl}
                    alt={`bordro-${selectedResult.bordro_id}-${selectedPage.side}`}
                    onError={() => {
                      updateViewer((previous) => ({ ...previous, renderFailed: true }))
                    }}
                    className="h-full w-full rounded-md border border-slate-300 bg-white object-contain dark:border-slate-700 dark:bg-slate-950"
                  />
                ) : viewer.objectUrl ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <p>Dosya tarayicida gorsellestirilemedi. Isterseniz indirebilirsiniz.</p>
                    <a
                      href={viewer.objectUrl}
                      download={`bordro-${selectedResult.bordro_id}-${selectedPage.side}${resolveDownloadExtension(
                        viewer.objectPath ?? '',
                        viewer.mimeType,
                      )}`}
                      className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Dosyayi Indir
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedPage.side === 'back' ? 'Arka yuz yok.' : 'On yuz goruntusu bulunamadi.'}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              {viewerInfo.length > 0 ? (
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Gorsel: {viewerInfo.join(' | ')}</p>
              ) : null}
              <p className="text-sm text-slate-700 dark:text-slate-200">
                Secili sayfa:{' '}
                <span className="font-medium">{selectedPage?.side === 'back' ? 'Arka Yuz' : 'On Yuz'}</span>
              </p>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
