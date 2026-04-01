import { useEffect, useMemo, useState } from 'react'
import { FileScan, ImageIcon, Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useLogContext } from '../context/LogContext'
import { getStorageObject, listScanners, releaseScanner, reserveScanner, scanDocumentStream } from '../services'
import type {
  DocumentScanMetadata,
  DocumentScanProgress,
  DocumentType,
  ScanColorMode,
  ScanPageSize,
  Scanner,
} from '../types'

const SCAN_DPI_OPTIONS = [300, 600] as const
const SCAN_COLOR_MODE_OPTIONS: Array<{ value: ScanColorMode; label: string }> = [
  { value: 'COLOR', label: 'Renkli' },
  { value: 'GRAYSCALE', label: 'Gri Ton' },
  { value: 'BLACK_AND_WHITE', label: 'Siyah-Beyaz' },
]
const SCAN_PAGE_SIZE_OPTIONS: Array<{ value: ScanPageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'CHEQUE', label: 'Çek' },
]
const DOCUMENT_TYPE_OPTIONS: Array<{ value: DocumentType; label: string }> = [
  { value: 'GENERIC', label: 'Generic' },
]

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

type ScanForm = {
  documentId: string
  documentType: DocumentType
  scanAllFromFeeder: boolean
  sheetCount: string
  duplex: boolean
  dpi: number
  colorMode: ScanColorMode
  pageSize: ScanPageSize
}

type SelectedPageState = {
  sheetIndex: number
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

const DEFAULT_FORM: ScanForm = {
  documentId: '',
  documentType: 'GENERIC',
  scanAllFromFeeder: false,
  sheetCount: '1',
  duplex: false,
  dpi: 300,
  colorMode: 'COLOR',
  pageSize: 'A4',
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

function formatPageSizeLabel(pageSize: ScanPageSize): string {
  if (pageSize === 'A4') {
    return 'A4'
  }

  if (pageSize === 'CHEQUE') {
    return 'Çek'
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
    label: 'Farklı',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  }
}

function inferMimeType(path: string, contentType: string | null): string {
  const normalizedContentType = contentType?.trim() ?? ''
  if (normalizedContentType.length > 0) {
    return normalizedContentType
  }

  const normalizedPath = path.trim().toLowerCase()
  if (normalizedPath.endsWith('.png')) {
    return 'image/png'
  }
  if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  return 'application/octet-stream'
}

async function readImageDimensions(
  blob: Blob,
  mimeType: string,
): Promise<{ width: number; height: number } | null> {
  if (!mimeType.startsWith('image/')) {
    return null
  }

  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob)
      const dimensions = { width: bitmap.width, height: bitmap.height }
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
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

function formatViewerInfo(viewer: ViewerState): string[] {
  const info: string[] = []
  if (viewer.mimeType) {
    info.push(viewer.mimeType)
  }
  if (viewer.byteSize !== null) {
    info.push(
      viewer.byteSize < 1024
        ? `${viewer.byteSize.toString()} B`
        : `${(viewer.byteSize / 1024).toFixed(1)} KB`,
    )
  }
  if (viewer.imageWidth !== null && viewer.imageHeight !== null) {
    info.push(`${viewer.imageWidth.toString()} x ${viewer.imageHeight.toString()} px`)
  }
  return info
}

export default function DocumentScanTab() {
  const { addLog } = useLogContext()
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [form, setForm] = useState<ScanForm>(DEFAULT_FORM)
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [reservedScannerId, setReservedScannerId] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DocumentScanMetadata | null>(null)
  const [completedSheetCount, setCompletedSheetCount] = useState<number>(0)
  const [totalSheetCount, setTotalSheetCount] = useState<number>(0)
  const [selectedPage, setSelectedPage] = useState<SelectedPageState | null>(null)
  const [viewer, setViewer] = useState<ViewerState>(INITIAL_VIEWER_STATE)

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const selectedDocumentPage = useMemo(() => {
    if (result === null || selectedPage === null) {
      return null
    }

    return result.pages.find((page) => page.sheet_index === selectedPage.sheetIndex) ?? null
  }, [result, selectedPage])

  async function handleListScanners(): Promise<void> {
    setIsListing(true)
    setError(null)

    try {
      addLog('info', 'İstek: listScanners {}')
      const nextScanners = await listScanners()
      setScanners(nextScanners)
      setHasListedScanners(true)
      addLog('info', `Yanıt: listScanners scanners=${nextScanners.length.toString()}`)

      if (nextScanners.length === 0) {
        setSelectedScannerKey(null)
        return
      }

      setSelectedScannerKey((current) => {
        if (current && nextScanners.some((scanner) => getScannerSelectionKey(scanner) === current)) {
          return current
        }

        return getScannerSelectionKey(nextScanners[0])
      })
    } catch (listError) {
      const message = getErrorMessage(listError)
      setError(message)
      addLog('error', `Hata: listScanners ${message}`)
    } finally {
      setIsListing(false)
    }
  }

  useEffect(() => {
    void handleListScanners()
  }, [])

  useEffect(() => {
    if (result === null || result.pages.length === 0) {
      setSelectedPage(null)
      return
    }

    setSelectedPage((previous) => {
      if (previous !== null) {
        const existingPage = result.pages.find((page) => page.sheet_index === previous.sheetIndex)
        if (existingPage) {
          if (previous.side === 'back' && !existingPage.back_image_path) {
            return { sheetIndex: previous.sheetIndex, side: 'front' }
          }
          return previous
        }
      }

      const latestPage = result.pages[result.pages.length - 1]
      return {
        sheetIndex: latestPage.sheet_index,
        side: 'front',
      }
    })
  }, [result])

  useEffect(() => {
    let cancelled = false

    async function loadPreview(): Promise<void> {
      if (selectedPage === null || selectedDocumentPage === null) {
        setViewer((previous) => {
          if (previous.objectUrl) {
            URL.revokeObjectURL(previous.objectUrl)
          }
          return INITIAL_VIEWER_STATE
        })
        return
      }

      const objectPath =
        selectedPage.side === 'back'
          ? selectedDocumentPage.back_image_path
          : selectedDocumentPage.front_image_path
      const contentType =
        selectedPage.side === 'back'
          ? selectedDocumentPage.back_image_content_type
          : selectedDocumentPage.front_image_content_type

      if (!objectPath) {
        setViewer((previous) => {
          if (previous.objectUrl) {
            URL.revokeObjectURL(previous.objectUrl)
          }
          return {
            ...INITIAL_VIEWER_STATE,
            error: selectedPage.side === 'back' ? 'Arka yuz yok.' : 'On yuz bulunamadi.',
          }
        })
        return
      }

      setViewer((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
        renderFailed: false,
      }))

      try {
        const objectBytes = await getStorageObject(objectPath)
        const mimeType = inferMimeType(objectPath, contentType)
        const blobBytes = new Uint8Array(objectBytes)
        const blob = new Blob([blobBytes.buffer], { type: mimeType })
        const objectUrl = URL.createObjectURL(blob)
        const dimensions = await readImageDimensions(blob, mimeType)

        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        setViewer((previous) => {
          if (previous.objectUrl) {
            URL.revokeObjectURL(previous.objectUrl)
          }
          return {
            isLoading: false,
            objectUrl,
            objectPath,
            mimeType,
            byteSize: objectBytes.length,
            imageWidth: dimensions?.width ?? null,
            imageHeight: dimensions?.height ?? null,
            renderFailed: false,
            error: null,
          }
        })
      } catch (previewError) {
        if (cancelled) {
          return
        }

        setViewer((previous) => {
          if (previous.objectUrl) {
            URL.revokeObjectURL(previous.objectUrl)
          }
          return {
            ...INITIAL_VIEWER_STATE,
            error: getErrorMessage(previewError),
          }
        })
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [selectedDocumentPage, selectedPage])

  useEffect(() => {
    return () => {
      if (viewer.objectUrl) {
        URL.revokeObjectURL(viewer.objectUrl)
      }
    }
  }, [viewer.objectUrl])

  async function handleReserve(targetScanner?: Scanner): Promise<void> {
    setError(null)

    const scanner = targetScanner ?? activeScanner
    if (scanner === null) {
      setError('Önce bir scanner seçin.')
      return
    }

    setSelectedScannerKey(getScannerSelectionKey(scanner))
    setIsReserving(true)

    try {
      addLog('info', `İstek: reserveScanner {scanner_id:${scanner.scanner_id}, session_id:${sessionId}}`)
      await reserveScanner(scanner.scanner_id, sessionId)
      setIsReserved(true)
      setReservedScannerId(scanner.scanner_id)
      addLog('info', `Yanıt: reserveScanner scanner_id=${scanner.scanner_id}`)
    } catch (reserveError) {
      const message = getErrorMessage(reserveError)
      setError(message)
      addLog('error', `Hata: reserveScanner ${message}`)
    } finally {
      setIsReserving(false)
    }
  }

  async function handleRelease(): Promise<void> {
    const scannerId = reservedScannerId ?? activeScanner?.scanner_id ?? null
    if (!isReserved || scannerId === null) {
      return
    }

    setError(null)
    setIsReleasing(true)

    try {
      addLog('info', `İstek: releaseScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await releaseScanner(scannerId, sessionId)
      setIsReserved(false)
      setReservedScannerId(null)
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
    const scannerId = reservedScannerId ?? activeScanner?.scanner_id ?? null
    if (!isReserved || scannerId === null) {
      setError('Tarama için önce scanner rezervasyonu yapın.')
      return
    }

    const documentId = form.documentId.trim()
    if (documentId.length === 0) {
      setError('Document ID zorunlu.')
      return
    }

    const trimmedSheetCount = form.sheetCount.trim()
    const sheetCount = form.scanAllFromFeeder
      ? 0
      : trimmedSheetCount.length === 0
        ? 0
        : Number.parseInt(trimmedSheetCount, 10)
    if (!Number.isFinite(sheetCount) || sheetCount < 0) {
      setError('Sheet count boş bırakılabilir veya 1 ve üzeri bir sayı olmalı.')
      return
    }

    if (!SCAN_DPI_OPTIONS.some((option) => option === form.dpi)) {
      setError('DPI alanı 300 veya 600 olmalı.')
      return
    }

    setError(null)
    setIsScanning(true)
    setResult(null)
    setCompletedSheetCount(0)
    setTotalSheetCount(sheetCount)

    try {
      addLog(
        'info',
        `İstek: scanDocument {scanner_id:${scannerId}, session_id:${sessionId}, document_id:${documentId}, document_type:${form.documentType}, sheet_count:${sheetCount.toString()}, duplex:${form.duplex ? 'true' : 'false'}, dpi:${form.dpi.toString()}, color_mode:${form.colorMode}, page_size:${form.pageSize}}`,
      )
      await scanDocumentStream({
        scanner_id: scannerId,
        session_id: sessionId,
        document_id: documentId,
        document_type: form.documentType,
        sheet_count: sheetCount,
        duplex: form.duplex,
        dpi: form.dpi,
        color_mode: form.colorMode,
        page_size: form.pageSize,
        onProgress: async (progress: DocumentScanProgress) => {
          setResult(progress.metadata)
          setCompletedSheetCount(progress.completed_sheet_count)
          setTotalSheetCount(progress.total_sheet_count)
          addLog(
            'info',
            `Yanıt: scanDocument sheet=${progress.completed_sheet_count.toString()}/${progress.total_sheet_count > 0 ? progress.total_sheet_count.toString() : '?'} object_path=${progress.metadata.object_path}`,
          )
        },
      })
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      setError(message)
      addLog('error', `Hata: scanDocument ${message}`)
    } finally {
      setIsScanning(false)
    }
  }

  const activeScannerId = activeScanner?.scanner_id ?? null
  const scanDisabled = !isReserved || (reservedScannerId ?? activeScannerId) === null
  const viewerInfo = useMemo(() => formatViewerInfo(viewer), [viewer])
  const scannedPageCount = result?.pages.length ?? 0
  const remainingPageCount = totalSheetCount > 0 ? Math.max(totalSheetCount - scannedPageCount, 0) : null
  const progressPercent =
    totalSheetCount > 0 ? Math.min(100, Math.round((scannedPageCount / totalSheetCount) * 100)) : 0
  const effectiveSettingRows = result
    ? [
        {
          key: 'duplex',
          label: 'Duplex',
          requested: form.duplex ? 'Çift Yüz' : 'Tek Yüz',
          effective: result.effective_duplex ? 'Çift Yüz' : 'Tek Yüz',
          status: getSettingStatus(result.duplex_verified, form.duplex === result.effective_duplex),
        },
        {
          key: 'dpi',
          label: 'DPI',
          requested: form.dpi.toString(),
          effective: result.effective_dpi.toString(),
          status: getSettingStatus(result.dpi_verified, form.dpi === result.effective_dpi),
        },
        {
          key: 'color_mode',
          label: 'Renk Modu',
          requested: formatScanColorModeLabel(form.colorMode),
          effective: formatScanColorModeLabel(result.effective_color_mode),
          status: getSettingStatus(result.color_mode_verified, form.colorMode === result.effective_color_mode),
        },
      ]
    : []

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
              Session ID: <span className="font-mono text-slate-700 dark:text-slate-300">{sessionId}</span>
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
            {isListing ? 'Yenileniyor...' : 'Tarayıcıları Yenile'}
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

              return (
                <article
                  key={scannerSelectionKey}
                  className={`rounded-lg border p-3 transition ${
                    isSelected
                      ? 'border-cyan-300 bg-cyan-50/70 dark:border-cyan-500/40 dark:bg-cyan-500/10'
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
                          ? 'border-cyan-300 bg-cyan-100 text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200'
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
                      {isReservedByThisSession ? 'Rezerve Edildi' : 'Rezerve Et'}
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
              {isReleasing ? 'Bırakılıyor...' : 'Rezervasyonu Bırak'}
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
            Doküman Tarama
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Document ID</span>
            <input
              value={form.documentId}
              disabled={isScanning}
              onChange={(event) => {
                setForm((current) => ({ ...current, documentId: event.target.value }))
              }}
              placeholder="doc-001"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Document Type</span>
            <select
              value={form.documentType}
              disabled={isScanning}
              onChange={(event) => {
                setForm((current) => ({ ...current, documentType: event.target.value as DocumentType }))
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Sheet Count</span>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.scanAllFromFeeder}
                disabled={isScanning}
                onChange={(event) => {
                  const checked = event.target.checked
                  setForm((current) => ({
                    ...current,
                    scanAllFromFeeder: checked,
                    sheetCount: checked ? '' : current.sheetCount.length === 0 ? '1' : current.sheetCount,
                  }))
                }}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
              />
              <span>Haznedeki her seyi tara</span>
            </div>
            <input
              type="number"
              min={0}
              step={1}
              value={form.sheetCount}
              disabled={isScanning || form.scanAllFromFeeder}
              onChange={(event) => {
                setForm((current) => ({ ...current, sheetCount: event.target.value }))
              }}
              placeholder={
                form.scanAllFromFeeder ? 'Hazne modu aktif' : 'Bos = haznedeki tum kagitlar'
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">DPI</span>
            <select
              value={form.dpi}
              disabled={isScanning}
              onChange={(event) => {
                const nextDpi = Number.parseInt(event.target.value, 10)
                if (Number.isFinite(nextDpi)) {
                  setForm((current) => ({ ...current, dpi: nextDpi }))
                }
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
              value={form.colorMode}
              disabled={isScanning}
              onChange={(event) => {
                setForm((current) => ({ ...current, colorMode: event.target.value as ScanColorMode }))
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {SCAN_COLOR_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Kağıt Boyutu</span>
            <select
              value={form.pageSize}
              disabled={isScanning}
              onChange={(event) => {
                setForm((current) => ({ ...current, pageSize: event.target.value as ScanPageSize }))
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {SCAN_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.duplex}
            disabled={isScanning}
            onChange={(event) => {
              setForm((current) => ({ ...current, duplex: event.target.checked }))
            }}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          />
          {form.duplex ? 'Çift Yüz Tara' : 'Tek Yüz Tara'}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleScan()
            }}
            disabled={scanDisabled || isScanning}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileScan className="h-4 w-4" />}
            {isScanning ? 'Doküman Taranıyor...' : 'Dokümanı Tara'}
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bu çağrı seçilen scanner üzerinde kullanıcıdan alınan ayarlarla genel doküman taraması yapar.
          </p>
        </div>

        {isScanning ? (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300">
            {totalSheetCount > 0
              ? `${completedSheetCount.toString()}/${totalSheetCount.toString()} yaprak UI'a ulaştı, tarama devam ediyor...`
              : 'Tarama başladı, ilk yapraklar bekleniyor...'}
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonuçları</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Çek ekranındaki gibi solda akış, sağda sabit önizleme olacak şekilde düzenlendi.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <span>{result ? `${result.pages.length.toString()} yaprak geldi` : 'Henüz sonuç yok'}</span>
            {totalSheetCount > 0 ? <span>/ {totalSheetCount.toString()} bekleniyor</span> : <span>/ hazne modu</span>}
          </div>
        </div>

        {(isScanning || result !== null) ? (
          <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-4 shadow-sm dark:border-cyan-500/30 dark:from-cyan-500/10 dark:via-slate-950 dark:to-sky-500/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                  Canlı Akış
                </p>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isScanning ? 'İlk tamamlanan yapraklar hazır, tarama akıyor.' : 'Doküman taraması tamamlandı.'}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {totalSheetCount > 0
                    ? `${scannedPageCount.toString()}/${totalSheetCount.toString()} yaprak işlendi.`
                    : `${scannedPageCount.toString()} yaprak işlendi, toplam hazneden okunuyor.`}
                </p>
                {selectedPage ? (
                  <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                    Aktif seçim: Yaprak {(selectedPage.sheetIndex + 1).toString()} {selectedPage.side === 'back' ? 'arka' : 'ön'}
                  </p>
                ) : null}
              </div>
              <div className="grid min-w-[220px] gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Hazır
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {scannedPageCount.toString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Kalan
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {remainingPageCount === null ? '-' : remainingPageCount.toString()}
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] xl:items-start">
          <div className="space-y-4">
            {result ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Document ID
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
                      {result.document_id}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Taranan
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {result.pages.length.toString()} / {result.sheet_count.toString()} yaprak
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Etkin DPI
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {result.effective_dpi.toString()}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Mod
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatScanColorModeLabel(result.effective_color_mode)} /{' '}
                      {formatPageSizeLabel(result.page_size)}
                    </p>
                  </div>
                </div>

                {effectiveSettingRows.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {effectiveSettingRows.map((row) => (
                      <article
                        key={row.key}
                        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.label}</p>
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${row.status.badgeClassName}`}
                          >
                            {row.status.label}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">İstenen</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200">{row.requested}</p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Uygulanan</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.effective}</p>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {result.pages.map((page) => {
                    const isSelectedFront =
                      selectedPage?.sheetIndex === page.sheet_index && selectedPage.side === 'front'
                    const isSelectedBack =
                      selectedPage?.sheetIndex === page.sheet_index && selectedPage.side === 'back'

                    return (
                      <article
                        key={page.sheet_index}
                        className={`rounded-2xl border p-4 transition ${
                          isSelectedFront || isSelectedBack
                            ? 'border-cyan-300 bg-cyan-50/50 shadow-sm dark:border-cyan-500/40 dark:bg-cyan-500/5'
                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                              Yaprak {(page.sheet_index + 1).toString()}
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                              {page.back_image_path ? 'Ön ve arka görüntü hazır.' : 'Yalnızca ön görüntü mevcut.'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPage({ sheetIndex: page.sheet_index, side: 'front' })
                              }}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                                isSelectedFront
                                  ? 'border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                              }`}
                            >
                              Önizle Ön
                            </button>

                            {page.back_image_path ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPage({ sheetIndex: page.sheet_index, side: 'back' })
                                }}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                                  isSelectedBack
                                    ? 'border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300'
                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                                }`}
                              >
                                Önizle Arka
                              </button>
                            ) : null}

                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {page.back_image_path ? 'Ön + Arka' : 'Sadece Ön'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Front
                            </p>
                            <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                              {page.front_image_path}
                            </p>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Back
                            </p>
                            <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                              {page.back_image_path ?? '-'}
                            </p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {isScanning
                  ? 'Tarama başladı. İlk tamamlanan yaprak geldiğinde soldaki akış listesi dolacak.'
                  : 'Tarama sonuçları burada listelenecek.'}
              </div>
            )}
          </div>

          <aside className="xl:sticky xl:top-4">
            <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Sabit Önizleme
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {selectedPage
                      ? `Yaprak ${(selectedPage.sheetIndex + 1).toString()} ${selectedPage.side === 'back' ? 'Arka' : 'Ön'}`
                      : 'Önizleme Hazır Değil'}
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Rahat İnceleme
                </span>
              </div>

              <div className="space-y-4 p-4">
                <div className="flex min-h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  {selectedDocumentPage === null || selectedPage === null ? (
                    <div className="space-y-2 text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Önizleme için soldan bir yaprak seçin.
                      </p>
                    </div>
                  ) : viewer.isLoading ? (
                    <div className="h-72 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                  ) : viewer.error ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      {viewer.error}
                    </p>
                  ) : viewer.objectUrl && !viewer.renderFailed ? (
                    <img
                      src={viewer.objectUrl}
                      alt={`document-${result?.document_id ?? 'preview'}-${selectedPage.side}-${selectedPage.sheetIndex.toString()}`}
                      onError={() => {
                        setViewer((previous) => ({ ...previous, renderFailed: true }))
                      }}
                      className="max-h-[620px] w-full rounded-xl object-contain"
                    />
                  ) : (
                    <div className="space-y-2 text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Görsel önizlemesi hazır değil.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Seçili Görsel
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {selectedPage
                        ? `Yaprak ${(selectedPage.sheetIndex + 1).toString()} ${selectedPage.side === 'back' ? 'Arka' : 'Ön'}`
                        : '-'}
                    </p>
                  </div>

                  {viewerInfo.length > 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Görsel: {viewerInfo.join(' | ')}</p>
                  ) : null}

                  <p className="break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedDocumentPage
                      ? selectedPage?.side === 'back'
                        ? selectedDocumentPage.back_image_path ?? '-'
                        : selectedDocumentPage.front_image_path
                      : '-'}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

