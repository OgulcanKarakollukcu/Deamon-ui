import { Copy, Link as LinkIcon, Mail, RefreshCw } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  createCustomerScanInvite,
  getCustomerScanInviteDetail,
  listCustomerScanInvites,
} from '../services/customerLinkClient'
import type {
  CustomerScanInviteCreateRequest,
  CustomerScanInviteCreateResponse,
  CustomerScanInviteDetail,
  CustomerScanInviteStatus,
  CustomerScanInviteSummary,
} from '../types'

const POLL_INTERVAL_MS = 8_000

const INITIAL_FORM_STATE: CustomerScanInviteCreateRequest = {
  customer_national_id: '12345678987',
  customer_email: 'alphan.tulukcu@cybersoft.com.tr',
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('tr-TR')
}

function statusLabel(status: CustomerScanInviteStatus): string {
  if (status === 'claimed') {
    return 'Link Açıldı'
  }

  if (status === 'submitted') {
    return 'Gönderildi'
  }

  if (status === 'expired') {
    return 'Süresi Doldu'
  }

  return 'Bekliyor'
}

function statusBadge(status: CustomerScanInviteStatus): string {
  if (status === 'submitted') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200'
  }

  if (status === 'claimed') {
    return 'border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200'
  }

  if (status === 'expired') {
    return 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200'
  }

  return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200'
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

  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] =
    useState<CustomerScanInviteDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<boolean>(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const selectedInvite = useMemo(() => {
    if (selectedInviteId === null) {
      return null
    }

    return invites.find((item) => item.invite_id === selectedInviteId) ?? null
  }, [invites, selectedInviteId])

  const loadInvites = useCallback(async () => {
    setListError(null)

    try {
      const response = await listCustomerScanInvites()
      setInvites(response)

      if (response.length === 0) {
        setSelectedInviteId(null)
        return
      }

      setSelectedInviteId((previous) => {
        if (previous && response.some((item) => item.invite_id === previous)) {
          return previous
        }

        return response[0]?.invite_id ?? null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setListError(message)
      addLog('error', `Hata: listCustomerScanInvites ${message}`)
    } finally {
      setListLoading(false)
    }
  }, [addLog])

  const loadDetail = useCallback(
    async (inviteId: string) => {
      setDetailLoading(true)
      setDetailError(null)

      try {
        const response = await getCustomerScanInviteDetail(inviteId)
        setSelectedDetail(response)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setDetailError(message)
        addLog('error', `Hata: getCustomerScanInviteDetail invite=${inviteId} ${message}`)
      } finally {
        setDetailLoading(false)
      }
    },
    [addLog],
  )

  useEffect(() => {
    void loadInvites()

    const intervalId = window.setInterval(() => {
      void loadInvites()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadInvites])

  useEffect(() => {
    if (selectedInviteId === null) {
      setSelectedDetail(null)
      return
    }

    void loadDetail(selectedInviteId)
  }, [loadDetail, selectedInviteId])

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
      addLog('info', 'Istek: createCustomerScanInvite')
      const response = await createCustomerScanInvite(form)
      setCreateResult(response)
      setSelectedInviteId(response.invite_id)
      addLog('info', `Yanit: createCustomerScanInvite invite=${response.invite_id}`)
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
    <section className="grid h-full min-h-0 grid-cols-1 gap-5 xl:grid-cols-[460px_minmax(0,1fr)]">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0a1f44] text-white dark:bg-slate-700">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Tek Kullanımlık Link Oluştur
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sadece musteri TC ve email girin, link musteri email adresine gitsin.
            </p>
          </div>
        </header>

        <form className="space-y-4" onSubmit={handleCreateInvite}>
          <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Musteri
            </legend>

            <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              TC
              <input
                required
                maxLength={11}
                value={form.customer_national_id}
                onChange={(event) => handleFieldChange('customer_national_id', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Email
              <input
                required
                type="email"
                value={form.customer_email}
                onChange={(event) => handleFieldChange('customer_email', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0a1f44] px-4 text-sm font-semibold text-white transition hover:bg-[#102d5e] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-700 dark:hover:bg-cyan-600"
          >
            {createLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            Link Oluştur ve Mail Gönder
          </button>
        </form>

        {createResult ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
            <p className="font-semibold">Invite ID: {createResult.invite_id}</p>
            <p className="mt-1">Bitiş: {formatDateTime(createResult.expires_at)}</p>
            <p className="mt-1">
              Mail gönderimi: {createResult.email_dispatched ? 'başarılı' : 'SMTP tanımsız veya hata'}
            </p>
            <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2 font-mono text-[11px] break-all dark:border-emerald-500/40 dark:bg-slate-900/60">
              {createResult.one_time_link}
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <Copy className="h-3.5 w-3.5" /> Linki Kopyala
            </button>
            {copyStatus ? <p className="mt-1 text-[11px]">{copyStatus}</p> : null}
          </div>
        ) : null}
      </article>

      <article className="min-h-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Link ve Tarama Durumları
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Müşteri gönderimlerini otomatik yenilemeyle takip edin.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadInvites()
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Yenile
          </button>
        </header>

        {listError ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            {listError}
          </p>
        ) : null}

        <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            {listLoading ? (
              <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">Yükleniyor...</p>
            ) : invites.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">
                Henüz davet oluşturulmadı.
              </p>
            ) : (
              <ul className="space-y-2">
                {invites.map((invite) => {
                  const isSelected = invite.invite_id === selectedInviteId
                  return (
                    <li key={invite.invite_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInviteId(invite.invite_id)
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          isSelected
                            ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-500/60 dark:bg-cyan-500/10'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              Musteri TC: {invite.customer_national_id}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {invite.customer_email}
                            </p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(invite.status)}`}>
                            {statusLabel(invite.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatDateTime(invite.created_at)}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="min-h-[360px] rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            {!selectedInvite ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detay görmek için soldan bir kayıt seçin.
              </p>
            ) : detailLoading ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Detay yükleniyor...</p>
            ) : detailError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                {detailError}
              </p>
            ) : selectedDetail ? (
              <div className="space-y-3">
                <header className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Musteri TC: {selectedDetail.invite.customer_national_id}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Musteri Email: {selectedDetail.invite.customer_email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Durum: {statusLabel(selectedDetail.invite.status)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gönderilen çek: {selectedDetail.invite.check_count.toString()}
                  </p>
                </header>

                {selectedDetail.batch_image_data_url ? (
                  <section>
                    <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Toplu Fotoğraf
                    </p>
                    <img
                      src={selectedDetail.batch_image_data_url}
                      alt="Toplu çek görseli"
                      className="max-h-52 w-full rounded-lg object-cover"
                    />
                  </section>
                ) : null}

                <section>
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Çek Detayları
                  </p>

                  {selectedDetail.checks.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bu kayıt için henüz çek gönderilmedi.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {selectedDetail.checks.map((check) => (
                        <li
                          key={`${check.sequence_no.toString()}-${check.captured_at}`}
                          className="rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                        >
                          <img
                            src={check.image_data_url}
                            alt={`Çek ${check.sequence_no.toString()} fotoğrafı`}
                            className="h-28 w-full rounded object-cover"
                          />
                          <p className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                            Çek #{check.sequence_no.toString()}
                          </p>
                          <p className="mt-1 line-clamp-2 break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {check.qr_value}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {formatDateTime(check.captured_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detay bulunamadı.
              </p>
            )}
          </div>
        </div>
      </article>
    </section>
  )
}
