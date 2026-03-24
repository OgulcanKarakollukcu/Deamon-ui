import { type FormEvent, useState } from 'react'
import ScanTab, { type ScanReservationState } from './ScanTab'
import { useLogContext } from '../context/LogContext'
import { createBordro, releaseScanner } from '../services/branchClient'
import type {
  BordroCheckType,
  BordroCurrency,
  CreateBordroRequest,
  SessionBordroEntry,
} from '../types'

type BordroTabProps = {
  activeBordroId: string | null
  onActiveBordroChange: (bordroId: string) => void
}

type BordroFormState = {
  checkCount: number
  checkType: BordroCheckType
  bordroAmount: string
  accountNo: string
  customerName: string
  accountBranch: string
  currency: BordroCurrency
}

const CHECK_TYPE_OPTIONS: Array<{ value: BordroCheckType; label: string }> = [
  { value: 'BL', label: 'BL (Blokeli Çek)' },
  { value: 'BV', label: 'BV (Blokeli Vergi Çeki)' },
  { value: 'NM', label: 'NM (Normal Çek)' },
  { value: 'VR', label: 'VR (Vergi Çeki)' },
]

const CURRENCY_OPTIONS: BordroCurrency[] = ['TRY', 'USD', 'EUR']
const INITIAL_SCAN_RESERVATION_STATE: ScanReservationState = {
  isReserved: false,
  scannerId: null,
  sessionId: '',
}

function shortenId(value: string): string {
  if (value.length <= 14) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('tr-TR')
}

export default function BordroTab({
  activeBordroId,
  onActiveBordroChange,
}: BordroTabProps) {
  const { addLog } = useLogContext()
  const [form, setForm] = useState<BordroFormState>({
    checkCount: 1,
    checkType: 'BL',
    bordroAmount: '',
    accountNo: '',
    customerName: '',
    accountBranch: '',
    currency: 'TRY',
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

  const currentScanBordroId = scanBordroId ?? activeBordroId

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

      setBordros((prev) => [newBordro, ...prev])
      onActiveBordroChange(response.bordro_id)
      setScanBordroId(response.bordro_id)
      setModalScannedCheckCount(0)
      setModalCloseError(null)
      setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
      setIsScanModalOpen(true)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
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
        const message = closeError instanceof Error ? closeError.message : String(closeError)
        setModalCloseError(message)
        addLog('error', `Hata: releaseScanner ${message}`)
        return
      } finally {
        setIsClosingModal(false)
      }
    }

    setIsScanModalOpen(false)
    setModalScannedCheckCount(0)
    setModalCloseError(null)
    setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Bordro Parametreleri
        </h2>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Bordro Çek Adedi</span>
              <input
                type="number"
                min={1}
                required
                value={form.checkCount}
                onChange={(event) => {
                  const parsed = event.target.valueAsNumber
                  setForm((prev) => ({ ...prev, checkCount: Number.isFinite(parsed) ? parsed : 0 }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Çek Tipi</span>
              <select
                value={form.checkType}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, checkType: event.target.value as BordroCheckType }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              >
                {CHECK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Bordro Tutarı</span>
              <input
                type="text"
                required
                value={form.bordroAmount}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, bordroAmount: event.target.value }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                placeholder="Örn: 150000.75"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Hesap No</span>
              <input
                type="text"
                required
                value={form.accountNo}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, accountNo: event.target.value }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Müşteri Adı</span>
              <input
                type="text"
                required
                value={form.customerName}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, customerName: event.target.value }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Hesabın Bulunduğu Şube
              </span>
              <input
                type="text"
                required
                value={form.accountBranch}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, accountBranch: event.target.value }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Döviz Cinsi</span>
              <select
                value={form.currency}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, currency: event.target.value as BordroCurrency }))
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {isSubmitting ? 'Oluşturuluyor…' : 'Bordro Oluştur'}
            </button>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Aktif Bordrolar (Session)
        </h3>

        {bordros.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Henüz bordro oluşturulmadı.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Bordro ID
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Çek Adedi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Çek Tipi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Oluşturma Zamanı
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    İşlem
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {bordros.map((bordro) => {
                  const isActive = activeBordroId === bordro.bordro_id

                  return (
                    <tr
                      key={bordro.bordro_id}
                      className={isActive ? 'bg-amber-100 dark:bg-amber-500/15' : undefined}
                    >
                      <td
                        className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300"
                        title={bordro.bordro_id}
                      >
                        {shortenId(bordro.bordro_id)}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {bordro.check_count}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {bordro.check_type}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {formatCreatedAt(bordro.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            onActiveBordroChange(bordro.bordro_id)
                          }}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Seç
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
