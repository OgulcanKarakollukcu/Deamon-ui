import { Copy, Link as LinkIcon, Mail, RefreshCw } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  createCustomerScanInvite,
  listCustomerScanInvites,
} from '../services/customerLinkClient'
import type {
  CustomerScanInviteCreateRequest,
  CustomerScanInviteCreateResponse,
  CustomerScanInviteSummary,
} from '../types'
import { formatDateTime, statusBadge, statusLabel } from '../utils/customerInviteUi'

const POLL_INTERVAL_MS = 8_000

const INITIAL_FORM_STATE: CustomerScanInviteCreateRequest = {
  customer_national_id: '',
  customer_email: '',
}

export default function CustomerInviteTab() {
  const { addLog } = useLogContext()
  const [form, setForm] = useState<CustomerScanInviteCreateRequest>(INITIAL_FORM_STATE)
  const [createResult, setCreateResult] =
    useState<CustomerScanInviteCreateResponse | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState<boolean>(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const [invites, setInvites] = useState<CustomerScanInviteSummary[]>([])
  const [listLoading, setListLoading] = useState<boolean>(true)
  const [listError, setListError] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    setListError(null)

    try {
      const response = await listCustomerScanInvites()
      setInvites(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setListError(message)
      addLog('error', `Hata: listCustomerScanInvites ${message}`)
    } finally {
      setListLoading(false)
    }
  }, [addLog])

  useEffect(() => {
    void loadInvites()

    const intervalId = window.setInterval(() => {
      void loadInvites()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadInvites])

  const handleFieldChange = (
    key: keyof CustomerScanInviteCreateRequest,
    value: string,
  ) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    setCopyStatus(null)
    setCreateLoading(true)

    try {
      addLog('info', 'İstek: createCustomerScanInvite')
      const response = await createCustomerScanInvite(form)
      setCreateResult(response)
      addLog('info', `Yanıt: createCustomerScanInvite invite=${response.invite_id}`)
      await loadInvites()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCreateError(message)
      addLog('error', `Hata: createCustomerScanInvite ${message}`)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!createResult?.one_time_link) {
      return
    }

    if (navigator.clipboard === undefined) {
      setCopyStatus('Panoya kopyalama desteklenmiyor.')
      return
    }

    try {
      await navigator.clipboard.writeText(createResult.one_time_link)
      setCopyStatus('Link panoya kopyalandı.')
    } catch {
      setCopyStatus('Link kopyalanamadı.')
    }
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-1 gap-5">
      <article className="rounded-2xl border border-[#DDEFE3] bg-white p-4 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-5 dark:border-[#1f3327] dark:bg-[#15271d]">
        <header className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A3D] text-white">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#4B4F54] dark:text-[#e5ebe7]">
              Tek Kullanımlık Müşteri Linki
            </h3>
            <p className="text-xs text-[#6E747B] dark:text-[#a7b5ad]">
              Sadece TC ve e-posta ile davet üret, bağlantıyı otomatik olarak gönder.
            </p>
          </div>
        </header>

        <form className="space-y-4" onSubmit={handleCreateInvite}>
          <fieldset className="grid gap-3 rounded-xl border border-[#DDEFE3] p-3 md:grid-cols-2 dark:border-[#1f3327]">
            <label className="space-y-1 text-xs font-medium text-[#5B6168] dark:text-[#c0cdc6]">
              Müşteri TC
              <input
                required
                maxLength={11}
                value={form.customer_national_id}
                onChange={(event) => handleFieldChange('customer_national_id', event.target.value)}
                className="h-10 w-full rounded-lg border border-[#D6E5DC] bg-white px-3 text-sm text-[#4B4F54] outline-none transition focus:border-[#7DB900] dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-[#5B6168] dark:text-[#c0cdc6]">
              Müşteri E-posta
              <input
                required
                type="email"
                value={form.customer_email}
                onChange={(event) => handleFieldChange('customer_email', event.target.value)}
                className="h-10 w-full rounded-lg border border-[#D6E5DC] bg-white px-3 text-sm text-[#4B4F54] outline-none transition focus:border-[#7DB900] dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
              />
            </label>
          </fieldset>

          {createError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {createError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={createLoading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#007A3D] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,122,61,0.18)] transition hover:bg-[#018342] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            Link Oluştur ve Mail Gönder
          </button>
        </form>

        {createResult ? (
          <div className="mt-4 rounded-xl border border-[#BFE0CC] bg-[#F4FBF6] p-3 text-xs text-[#007A3D] dark:border-[#2f5a43] dark:bg-[#1e3729] dark:text-[#9bd8b3]">
            <p className="font-semibold">Invite ID: {createResult.invite_id}</p>
            <p className="mt-1">Bitiş: {formatDateTime(createResult.expires_at)}</p>
            <p className="mt-1">
              Mail gönderimi: {createResult.email_dispatched ? 'başarılı' : 'SMTP tanımsız veya hata'}
            </p>
            <div className="mt-2 rounded-lg border border-[#CDE7D6] bg-white p-2 font-mono text-[11px] break-all dark:border-[#355d47] dark:bg-[#0f1a13]">
              {createResult.one_time_link}
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#BFE0CC] px-2 py-1 text-[11px] font-semibold text-[#007A3D] transition hover:bg-[#EAF4EE] dark:border-[#325a44] dark:text-[#9cd8b5] dark:hover:bg-[#274430]"
            >
              <Copy className="h-3.5 w-3.5" /> Linki Kopyala
            </button>
            {copyStatus ? <p className="mt-1 text-[11px]">{copyStatus}</p> : null}
          </div>
        ) : null}
      </article>

      <article className="min-h-0 rounded-2xl border border-[#DDEFE3] bg-white p-4 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-5 dark:border-[#1f3327] dark:bg-[#15271d]">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#4B4F54] dark:text-[#e5ebe7]">
              Gönderim Geçmişi
            </h3>
            <p className="text-xs text-[#6E747B] dark:text-[#a7b5ad]">
              Son oluşturulan link kayıtları ve güncel durumları.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadInvites()
            }}
            className="inline-flex items-center gap-1 rounded-md border border-[#D6E5DC] px-2 py-1 text-xs font-medium text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#325a44] dark:text-[#9bd8b3] dark:hover:bg-[#274430]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Yenile
          </button>
        </header>

        {listError ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            {listError}
          </p>
        ) : null}

        <div className="min-h-[280px] overflow-auto rounded-xl border border-[#DDEFE3] dark:border-[#1f3327]">
          {listLoading ? (
            <p className="px-3 py-4 text-xs text-[#6E747B] dark:text-[#a7b5ad]">Yükleniyor...</p>
          ) : invites.length === 0 ? (
            <p className="px-3 py-4 text-xs text-[#6E747B] dark:text-[#a7b5ad]">
              Henüz davet oluşturulmadı.
            </p>
          ) : (
            <table className="min-w-[760px] divide-y divide-[#E3EEE7] text-left text-xs dark:divide-[#2b4535] md:min-w-full">
              <thead className="sticky top-0 bg-[#F7FBF8] dark:bg-[#1f3528]/95">
                <tr>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">TC</th>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">E-posta</th>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">Durum</th>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">Çek</th>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">Oluşturma</th>
                  <th className="px-3 py-2 font-semibold text-[#5B6168] dark:text-[#c0cdc6]">Gönderim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECF3EE] dark:divide-[#284131]">
                {invites.map((invite) => (
                  <tr key={invite.invite_id} className="hover:bg-[#F4FBF6] dark:hover:bg-[#1f3328]/70">
                    <td className="px-3 py-2 text-[#4B4F54] dark:text-[#e5ebe7]">{invite.customer_national_id}</td>
                    <td className="px-3 py-2 text-[#5B6168] dark:text-[#c0cdc6]">{invite.customer_email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(invite.status)}`}
                      >
                        {statusLabel(invite.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#5B6168] dark:text-[#c0cdc6]">{invite.check_count.toString()}</td>
                    <td className="px-3 py-2 text-[#5B6168] dark:text-[#c0cdc6]">{formatDateTime(invite.created_at)}</td>
                    <td className="px-3 py-2 text-[#5B6168] dark:text-[#c0cdc6]">{formatDateTime(invite.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </article>
    </section>
  )
}
