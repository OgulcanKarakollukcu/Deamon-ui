import { FileText, Folder } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  createBordro,
  getStorageObject,
  listStorageObjects,
  releaseScanner,
  resolveStorageObjectPaths,
} from '../services/branchClient'
import type {
  BordroCheckType,
  BordroCurrency,
  CheckMetadata,
  CreateBordroRequest,
  SessionBordroEntry,
} from '../types'
import ScanTab, { type ScanReservationState } from './ScanTab'

type BordroTabProps = {
  activeBordroId: string | null
  onActiveBordroChange: (bordroId: string | null) => void
}

type BordroFormState = {
  customerNo: string
  checkCount: number
  checkType: BordroCheckType
  bordroAmount: string
  accountNo: string
  customerName: string
  accountBranch: string
  currency: BordroCurrency
  showCheck: boolean
}

type SelectedPageState = {
  objectPath: string
  side: 'front' | 'back'
}

type ViewerState = {
  isLoading: boolean
  objectUrl: string | null
  objectPath: string | null
  mimeType: string | null
  renderFailed: boolean
  error: string | null
}

const CHECK_TYPE_OPTIONS: Array<{ value: BordroCheckType; label: string }> = [
  { value: 'BL', label: 'BL' },
  { value: 'BV', label: 'BV' },
  { value: 'NM', label: 'NM' },
  { value: 'VR', label: 'VR' },
]

const CURRENCY_OPTIONS: BordroCurrency[] = ['TRY', 'USD', 'EUR']
const INITIAL_SCAN_RESERVATION_STATE: ScanReservationState = {
  isReserved: false,
  scannerId: null,
  sessionId: '',
}

const INITIAL_VIEWER_STATE: ViewerState = {
  isLoading: false,
  objectUrl: null,
  objectPath: null,
  mimeType: null,
  renderFailed: false,
  error: null,
}

function shortenId(value: string): string {
  if (value.length <= 14) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPngStorageObjectPath(path: string | null): boolean {
  if (path === null) {
    return false
  }

  return path.trim().toLowerCase().endsWith('.png')
}

function isRenderableImageMimeType(mimeType: string | null): boolean {
  if (mimeType === null) {
    return false
  }

  return mimeType.startsWith('image/')
}

function buildCheckKey(check: CheckMetadata): string {
  return `${check.object_path}::${check.check_no.toString()}`
}

function hasBackPage(check: CheckMetadata): boolean {
  return check.duplex || check.page_count > 1
}

export default function BordroTab({
  activeBordroId,
  onActiveBordroChange,
}: BordroTabProps) {
  const { addLog } = useLogContext()
  const [form, setForm] = useState<BordroFormState>({
    customerNo: '10024578',
    checkCount: 2,
    checkType: 'NM',
    bordroAmount: '125000.00',
    accountNo: 'TR000000000000000000000000',
    customerName: 'Debug Müşteri A.Ş.',
    accountBranch: 'Levent Şubesi',
    currency: 'TRY',
    showCheck: true,
  })
  const [bordros, setBordros] = useState<SessionBordroEntry[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false)
  const [scanBordroId, setScanBordroId] = useState<string | null>(null)
  const [modalScannedCheckCount, setModalScannedCheckCount] = useState<number>(0)
  const [modalCloseError, setModalCloseError] = useState<string | null>(null)
  const [isClosingModal, setIsClosingModal] = useState<boolean>(false)
  const [scanReservationState, setScanReservationState] = useState<ScanReservationState>(
    INITIAL_SCAN_RESERVATION_STATE,
  )
  const [scannedChecksByBordro, setScannedChecksByBordro] = useState<Record<string, CheckMetadata[]>>({})
  const [selectedPage, setSelectedPage] = useState<SelectedPageState | null>(null)
  const [viewer, setViewer] = useState<ViewerState>(INITIAL_VIEWER_STATE)

  const currentScanBordroId = scanBordroId ?? activeBordroId
  const activeBordro = useMemo(
    () => bordros.find((bordro) => bordro.bordro_id === activeBordroId) ?? null,
    [activeBordroId, bordros],
  )
  const activeScannedChecks = useMemo(() => {
    if (!activeBordroId) {
      return []
    }

    return scannedChecksByBordro[activeBordroId] ?? []
  }, [activeBordroId, scannedChecksByBordro])

  const selectedCheck = useMemo(() => {
    if (selectedPage === null) {
      return null
    }

    return activeScannedChecks.find((check) => check.object_path === selectedPage.objectPath) ?? null
  }, [activeScannedChecks, selectedPage])

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
    if (selectedPage === null) {
      return
    }

    const existingCheck = activeScannedChecks.find((check) => check.object_path === selectedPage.objectPath)
    if (!existingCheck) {
      setSelectedPage(null)
      return
    }

    if (selectedPage.side === 'back' && !hasBackPage(existingCheck)) {
      setSelectedPage({
        objectPath: existingCheck.object_path,
        side: 'front',
      })
    }
  }, [activeScannedChecks, selectedPage])

  useEffect(() => {
    if (selectedPage !== null || activeScannedChecks.length === 0) {
      return
    }

    const firstCheck = [...activeScannedChecks].sort((left, right) => left.check_no - right.check_no)[0]
    setSelectedPage({
      objectPath: firstCheck.object_path,
      side: 'front',
    })
  }, [activeScannedChecks, selectedPage])

  const loadSelectedImage = useCallback(async (): Promise<void> => {
    if (!form.showCheck || selectedPage === null || selectedCheck === null) {
      updateViewer({
        ...INITIAL_VIEWER_STATE,
        objectPath: null,
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
      const listedPaths = await listStorageObjects(selectedCheck.object_path)
      const resolvedPaths = resolveStorageObjectPaths(listedPaths)
      const path = selectedPage.side === 'front' ? resolvedPaths.front_path : resolvedPaths.back_path

      if (!path) {
        if (selectedPage.side === 'back') {
          updateViewer({
            isLoading: false,
            objectUrl: null,
            objectPath: null,
            mimeType: null,
            renderFailed: false,
            error: null,
          })
          return
        }

        throw new Error('Ön yüz için obje path bulunamadı.')
      }

      const bytes = await getStorageObject(path)
      if (bytes.length === 0) {
        throw new Error('Görüntü verisi boş döndü.')
      }

      const mimeType = isPngStorageObjectPath(path) ? 'image/png' : 'application/octet-stream'
      const copied = new Uint8Array(bytes.byteLength)
      copied.set(bytes)
      const objectUrl = URL.createObjectURL(new Blob([copied], { type: mimeType }))

      updateViewer({
        isLoading: false,
        objectUrl,
        objectPath: path,
        mimeType,
        renderFailed: false,
        error: null,
      })
    } catch (loadError) {
      const message = getErrorMessage(loadError)
      updateViewer((previous) => ({
        ...previous,
        isLoading: false,
        objectUrl: null,
        mimeType: null,
        renderFailed: false,
        error: message,
      }))
      addLog('error', `Hata: selectedImage ${message}`)
    }
  }, [addLog, form.showCheck, selectedCheck, selectedPage, updateViewer])

  useEffect(() => {
    void loadSelectedImage()
  }, [loadSelectedImage])

  function openScanModalForBordro(bordroId: string): void {
    onActiveBordroChange(bordroId)
    setScanBordroId(bordroId)
    setModalScannedCheckCount(scannedChecksByBordro[bordroId]?.length ?? 0)
    setModalCloseError(null)
    setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
    setIsScanModalOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    if (!Number.isInteger(form.checkCount) || form.checkCount < 1) {
      setError('Bordro çek adedi en az 1 olmalı.')
      return
    }

    const bordroAmount = form.bordroAmount.trim()
    const accountNo = form.accountNo.trim()
    const customerName = form.customerName.trim()
    const accountBranch = form.accountBranch.trim()

    if (bordroAmount.length === 0) {
      setError('Bordro tutarı zorunlu.')
      return
    }

    if (accountNo.length === 0) {
      setError('Hesap no zorunlu.')
      return
    }

    if (customerName.length === 0) {
      setError('Müşteri adı zorunlu.')
      return
    }

    if (accountBranch.length === 0) {
      setError('Hesabın bulunduğu şube zorunlu.')
      return
    }

    const request: CreateBordroRequest = {
      check_count: form.checkCount,
      check_type: form.checkType,
      bordro_amount: bordroAmount,
      account_no: accountNo,
      customer_name: customerName,
      account_branch: accountBranch,
      currency: form.currency,
    }

    setIsSubmitting(true)

    try {
      addLog(
        'info',
        `İstek: createBordro {check_count:${request.check_count}, check_type:${request.check_type}, bordro_amount:${request.bordro_amount}, account_no:${request.account_no}, customer_name:${request.customer_name}, account_branch:${request.account_branch}, currency:${request.currency}}`,
      )
      const response = await createBordro(request)
      addLog('info', `Yanıt: createBordro bordro_id=${response.bordro_id}`)

      const newBordro: SessionBordroEntry = {
        bordro_id: response.bordro_id,
        check_count: request.check_count,
        check_type: request.check_type,
        bordro_amount: request.bordro_amount,
        account_no: request.account_no,
        customer_name: request.customer_name,
        account_branch: request.account_branch,
        currency: request.currency,
        created_at: new Date().toISOString(),
      }

      setBordros((previous) => [newBordro, ...previous])
      onActiveBordroChange(response.bordro_id)
      openScanModalForBordro(response.bordro_id)
    } catch (submitError) {
      const message = getErrorMessage(submitError)
      setError(message)
      addLog('error', `Hata: createBordro ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCloseScanModal(): Promise<void> {
    setModalCloseError(null)

    if (scanReservationState.isReserved && scanReservationState.scannerId !== null) {
      const shouldRelease = window.confirm(
        'Seçili scanner rezerve durumda. Kapatmadan önce scanner bırakılacak, onaylıyor musunuz?',
      )

      if (!shouldRelease) {
        return
      }

      setIsClosingModal(true)
      try {
        addLog(
          'info',
          `İstek: releaseScanner {scanner_id:${scanReservationState.scannerId}, session_id:${scanReservationState.sessionId}}`,
        )
        await releaseScanner(scanReservationState.scannerId, scanReservationState.sessionId)
        addLog('info', `Yanıt: releaseScanner scanner_id=${scanReservationState.scannerId}`)
      } catch (closeError) {
        const message = getErrorMessage(closeError)
        setModalCloseError(message)
        addLog('error', `Hata: releaseScanner ${message}`)
        return
      } finally {
        setIsClosingModal(false)
      }
    }

    setIsScanModalOpen(false)
    setScanBordroId(null)
    setModalScannedCheckCount(0)
    setModalCloseError(null)
    setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
  }

  const handleDeleteBordro = useCallback(() => {
    if (activeBordroId === null) {
      setError('Silmek için önce bir bordro seçin.')
      return
    }

    const shouldDelete = window.confirm('Seçili bordroyu session listesinden silmek istiyor musunuz?')
    if (!shouldDelete) {
      return
    }

    const nextBordros = bordros.filter((bordro) => bordro.bordro_id !== activeBordroId)
    const nextActiveBordroId = nextBordros[0]?.bordro_id ?? null

    setBordros(nextBordros)
    setScannedChecksByBordro((previous) => {
      const next = { ...previous }
      delete next[activeBordroId]
      return next
    })
    setSelectedPage(null)
    onActiveBordroChange(nextActiveBordroId)
    addLog('info', `Bordro silindi: ${activeBordroId}`)
  }, [activeBordroId, addLog, bordros, onActiveBordroChange])

  const handleMatchAction = useCallback(() => {
    if (selectedCheck === null) {
      setError('Eşleştirme için önce döküman ağacından bir sayfa seçin.')
      return
    }

    setError(null)
    addLog(
      'info',
      `Eşleştir: check_no=${selectedCheck.check_no.toString()}, micr_qr_match=${selectedCheck.micr_qr_match ? 'true' : 'false'}`,
    )
  }, [addLog, selectedCheck])

  const handleModalScannedChecksChange = useCallback(
    (checks: CheckMetadata[]) => {
      if (!currentScanBordroId) {
        return
      }

      setScannedChecksByBordro((previous) => {
        const existingChecks = previous[currentScanBordroId] ?? []
        if (checks.length === 0 && existingChecks.length > 0) {
          return previous
        }

        return {
          ...previous,
          [currentScanBordroId]: checks,
        }
      })
    },
    [currentScanBordroId],
  )

  const sortedChecks = useMemo(
    () => [...activeScannedChecks].sort((left, right) => left.check_no - right.check_no),
    [activeScannedChecks],
  )

  return (
    <div className="h-full min-h-0 space-y-4">
      <div className="grid h-full min-h-0 grid-cols-[minmax(360px,35%)_minmax(0,65%)] gap-4">
        <section className="flex min-h-0 flex-col gap-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bordro Parametreleri</h2>
              {activeBordroId ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Aktif: {shortenId(activeBordroId)}
                </span>
              ) : null}
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-center dark:border-slate-700 dark:bg-slate-950">
              <p className="text-3xl font-black tracking-[0.12em] text-slate-900 dark:text-slate-100">
                {activeBordro ? shortenId(activeBordro.bordro_id) : '00000'}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Toplam Çek
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                {(activeBordro?.check_count ?? form.checkCount).toString()}
              </p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Müşteri No</span>
                <input
                  type="text"
                  value={form.customerNo}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, customerNo: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Müşteri Adı</span>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, customerName: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Hesabın Bulunduğu Şube</span>
                <input
                  type="text"
                  required
                  value={form.accountBranch}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, accountBranch: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Çek Tipi</span>
                <select
                  value={form.checkType}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, checkType: event.target.value as BordroCheckType }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CHECK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Hesap No</span>
                <input
                  type="text"
                  required
                  value={form.accountNo}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, accountNo: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Döviz Cinsi</span>
                <select
                  value={form.currency}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, currency: event.target.value as BordroCurrency }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Bordro Çek Adedi</span>
                <input
                  type="number"
                  min={1}
                  required
                  inputMode="numeric"
                  value={form.checkCount}
                  onChange={(event) => {
                    const parsed = event.target.valueAsNumber
                    const nextCount = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1
                    setForm((previous) => ({ ...previous, checkCount: nextCount }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Bordro Tutarı</span>
                <input
                  type="text"
                  required
                  value={form.bordroAmount}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, bordroAmount: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Aktif Bordro</span>
                <select
                  value={activeBordroId ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim()
                    onActiveBordroChange(nextValue.length > 0 ? nextValue : null)
                    setSelectedPage(null)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Seçili Bordro Yok</option>
                  {bordros.map((bordro) => (
                    <option key={bordro.bordro_id} value={bordro.bordro_id}>
                      {shortenId(bordro.bordro_id)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="col-span-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.showCheck}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, showCheck: event.target.checked }))
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                Çeki Göster
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {isSubmitting ? 'Bordro Oluşturuluyor…' : 'Bordro Oluştur'}
              </button>
            </form>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeBordroId === null) {
                    setError('Tarama için önce aktif bordro seçin.')
                    return
                  }

                  setError(null)
                  openScanModalForBordro(activeBordroId)
                }}
                className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                TARA
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isScanModalOpen) {
                    void handleCloseScanModal()
                    return
                  }
                  setSelectedPage(null)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                KAPAT
              </button>

              <button
                type="button"
                onClick={handleDeleteBordro}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                SİL
              </button>

              <button
                type="button"
                onClick={handleMatchAction}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                EŞLEŞTİR
              </button>
            </div>
          </article>

          <article className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Döküman Ağacı</h3>
            </div>

            <div className="min-h-0 overflow-auto p-3">
              {activeBordroId === null ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Önce bir bordro seçin.
                </p>
              ) : sortedChecks.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Seçili bordro için taranmış çek bulunmuyor.
                </p>
              ) : (
                sortedChecks.map((check) => {
                  const documentLabel = `Döküman ${check.check_no.toString()}`
                  const pages: Array<{ side: 'front' | 'back'; label: string }> = [{ side: 'front', label: 'Sayfa 1' }]
                  if (hasBackPage(check)) {
                    pages.push({ side: 'back', label: 'Sayfa 2' })
                  }

                  return (
                    <div key={buildCheckKey(check)} className="mb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <Folder className="h-4 w-4 text-amber-500" />
                        {documentLabel}
                      </div>

                      <div className="mt-1 space-y-1 pl-6">
                        {pages.map((page) => {
                          const isSelected =
                            selectedPage?.objectPath === check.object_path && selectedPage.side === page.side

                          return (
                            <button
                              type="button"
                              key={`${check.object_path}-${page.side}`}
                              onClick={() => {
                                setSelectedPage({
                                  objectPath: check.object_path,
                                  side: page.side,
                                })
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                                isSelected
                                  ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-200'
                                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <FileText className="h-4 w-4" />
                              {page.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </article>
        </section>

        <section className="min-h-0 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Çek Görüntüsü</h3>

              <div className="mt-3 flex h-[calc(100%-1.75rem)] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-900">
                {selectedCheck === null || selectedPage === null ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Görüntülenecek çek seçin</p>
                ) : !form.showCheck ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Çeki Göster kapalı. Görüntü gizlendi.
                  </p>
                ) : viewer.isLoading ? (
                  <div className="h-56 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
                ) : viewer.error ? (
                  <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
                    <p>{viewer.error}</p>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSelectedImage()
                      }}
                      className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-slate-800"
                    >
                      Tekrar Dene
                    </button>
                  </div>
                ) : viewer.objectUrl && viewer.mimeType === 'image/png' && isRenderableImageMimeType(viewer.mimeType) && !viewer.renderFailed ? (
                  <img
                    src={viewer.objectUrl}
                    alt={`Check ${selectedCheck.check_no.toString()} ${selectedPage.side}`}
                    onError={() => {
                      updateViewer((previous) => ({ ...previous, renderFailed: true }))
                    }}
                    className="h-full w-full rounded-md border border-slate-300 bg-white object-contain dark:border-slate-700 dark:bg-slate-950"
                  />
                ) : viewer.objectUrl ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <p>
                      {viewer.mimeType === 'image/png'
                        ? 'Bu dosya tarayıcıda görselleştirilemedi.'
                        : 'Legacy .bin kayıt: önizleme devre dışı, dosyayı indirebilirsiniz.'}
                    </p>
                    <a
                      href={viewer.objectUrl}
                      download={`check-${selectedCheck.check_no.toString()}-${selectedPage.side}${viewer.mimeType === 'image/png' ? '.png' : '.bin'}`}
                      className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Dosyayı İndir
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedPage.side === 'back' ? 'Arka yüz yok.' : 'Ön yüz görüntüsü bulunamadı.'}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                MICR KOD :{' '}
                {selectedCheck?.micr ? (
                  <span className="font-mono text-slate-900 dark:text-slate-100">{selectedCheck.micr}</span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">&nbsp;</span>
                )}
              </p>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {isScanModalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
            <div className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 md:px-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Bordro Tarama
                  </h3>
                  {currentScanBordroId ? (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Bordro ID:{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {currentScanBordroId}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Taranan Çek: <span className="font-semibold">{modalScannedCheckCount}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleCloseScanModal()
                  }}
                  disabled={isClosingModal}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isClosingModal ? 'Bırakılıyor…' : 'Kapat'}
                </button>
              </div>
              {modalCloseError ? (
                <p className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300 md:mx-6">
                  {modalCloseError}
                </p>
              ) : null}

              <div className="overflow-y-auto p-4 md:p-6">
                <ScanTab
                  activeBordroId={currentScanBordroId}
                  onScannedCheckCountChange={setModalScannedCheckCount}
                  onScannedChecksChange={handleModalScannedChecksChange}
                  onReservationStateChange={setScanReservationState}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
