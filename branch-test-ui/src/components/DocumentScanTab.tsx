import { useEffect, useMemo, useState } from 'react'
import { FileScan, Loader2, RefreshCcw, ScanLine } from 'lucide-react'
import { useLogContext } from '../context/LogContext'
import { listScanners, releaseScanner, reserveScanner, scanDocument } from '../services'
import type {
  DocumentScanMetadata,
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
  sheetCount: string
  duplex: boolean
  dpi: number
  colorMode: ScanColorMode
  pageSize: ScanPageSize
}

const DEFAULT_FORM: ScanForm = {
  documentId: '',
  documentType: 'GENERIC',
  sheetCount: '1',
  duplex: false,
  dpi: 300,
  colorMode: 'COLOR',
  pageSize: 'A4',
}

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
    label: 'Farklılandı',
    badgeClassName:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  }
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

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])

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

    const sheetCount = Number.parseInt(form.sheetCount, 10)
    if (!Number.isFinite(sheetCount) || sheetCount <= 0) {
      setError('Sheet count 1 veya daha büyük bir sayı olmalı.')
      return
    }

    if (!SCAN_DPI_OPTIONS.some((option) => option === form.dpi)) {
      setError('DPI alanı 300 veya 600 olmalı.')
      return
    }

    setError(null)
    setIsScanning(true)

    try {
      addLog(
        'info',
        `İstek: scanDocument {scanner_id:${scannerId}, session_id:${sessionId}, document_id:${documentId}, document_type:${form.documentType}, sheet_count:${sheetCount.toString()}, duplex:${form.duplex ? 'true' : 'false'}, dpi:${form.dpi.toString()}, color_mode:${form.colorMode}, page_size:${form.pageSize}}`,
      )
      const response = await scanDocument({
        scanner_id: scannerId,
        session_id: sessionId,
        document_id: documentId,
        document_type: form.documentType,
        sheet_count: sheetCount,
        duplex: form.duplex,
        dpi: form.dpi,
        color_mode: form.colorMode,
        page_size: form.pageSize,
      })
      setResult(response)
      addLog(
        'info',
        `Yanıt: scanDocument object_path=${response.object_path}, pages=${response.page_count.toString()}`,
      )
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
            <input
              type="number"
              min={1}
              step={1}
              value={form.sheetCount}
              disabled={isScanning}
              onChange={(event) => {
                setForm((current) => ({ ...current, sheetCount: event.target.value }))
              }}
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
            {isScanning ? 'Doküman Taranıyor…' : 'Dokümanı Tara'}
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bu çağrı seçilen scanner üzerinde kullanıcıdan alınan ayarlarla genel doküman taraması yapar.
          </p>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonucu</h3>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {result ? `${result.page_count.toString()} sayfa` : 'Henüz tarama yok'}
          </span>
        </div>

        {!result ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Henüz doküman taranmadı.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Doküman
                </p>
                <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">document_id</p>
                <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{result.document_id}</p>
                <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">object_path</p>
                <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{result.object_path}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  İstek Özeti
                </p>
                <dl className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <dt>Sheet count</dt>
                    <dd className="font-mono">{result.sheet_count}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Page count</dt>
                    <dd className="font-mono">{result.page_count}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Kağıt</dt>
                    <dd>{formatPageSizeLabel(result.page_size)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Renk</dt>
                    <dd>{formatScanColorModeLabel(result.color_mode)}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Uygulanan Ayarlar
                </p>
                <div className="mt-2 space-y-2">
                  {effectiveSettingRows.map((row) => (
                    <div key={row.key} className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950/60">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{row.label}</p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.status.badgeClassName}`}>
                          {row.status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        İstenen: <span className="font-medium text-slate-700 dark:text-slate-300">{row.requested}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Uygulanan: <span className="font-medium text-slate-700 dark:text-slate-300">{row.effective}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sayfa Yolları</h4>
              <div className="space-y-3">
                {result.pages.map((page) => (
                  <article
                    key={`${page.sheet_index}-${page.front_image_path}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Yaprak {page.sheet_index + 1}
                      </p>
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {page.back_image_path ? 'Ön + Arka' : 'Sadece Ön'}
                      </span>
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
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
