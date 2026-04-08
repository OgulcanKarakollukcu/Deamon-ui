import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLogContext } from '../context/LogContext'
import {
  getCustomerScanInviteDetail,
  listCustomerScanInvites,
} from '../services/customerLinkClient'
import type {
  CustomerScanInviteDetail,
  CustomerScanInviteStatus,
  CustomerScanInviteSummary,
} from '../types'
import { formatDateTime, statusBadge, statusLabel } from '../utils/customerInviteUi'

const POLL_INTERVAL_MS = 8_000
const LIST_PAGE_SIZE = 25
const FULLSCREEN_ZOOM_MIN = 1
const FULLSCREEN_ZOOM_MAX = 4
const FULLSCREEN_ZOOM_STEP = 0.25

type StatusFilter = 'all' | CustomerScanInviteStatus

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'claimed', label: 'Link Açıldı' },
  { value: 'submitted', label: 'Gönderildi' },
  { value: 'expired', label: 'Süresi Doldu' },
]

type ParsedBarcodeTextContent = {
  kkb: string
  chequeSerialNo: string
  bankCode: string
  branchCode: string
  accountNo: string
  identityNo: string
  mersisNo: string
  isComplete: boolean
}

const BARCODE_SEGMENT_LENGTHS = {
  chequeSerialNo: 12,
  bankCode: 4,
  branchCode: 5,
  accountNo: 16,
  identityNo: 11,
  mersisNo: 16,
} as const

const BARCODE_REQUIRED_DIGIT_COUNT =
  BARCODE_SEGMENT_LENGTHS.chequeSerialNo +
  BARCODE_SEGMENT_LENGTHS.bankCode +
  BARCODE_SEGMENT_LENGTHS.branchCode +
  BARCODE_SEGMENT_LENGTHS.accountNo +
  BARCODE_SEGMENT_LENGTHS.identityNo +
  BARCODE_SEGMENT_LENGTHS.mersisNo

function parseBarcodeTextContent(qrValue: string): ParsedBarcodeTextContent {
  const normalized = qrValue.trim().replace(/\s+/g, '')
  const hasKkbPrefix = normalized.toUpperCase().startsWith('KKB')
  const payload = hasKkbPrefix ? normalized.slice(3) : normalized
  const digitsOnly = payload.replace(/\D/g, '')
  let cursor = 0

  const readSegment = (length: number): string => {
    const segment = digitsOnly.slice(cursor, cursor + length)
    cursor += length
    return segment || '-'
  }

  const chequeSerialRaw = readSegment(BARCODE_SEGMENT_LENGTHS.chequeSerialNo)
  const chequeSerialNo =
    chequeSerialRaw.length === BARCODE_SEGMENT_LENGTHS.chequeSerialNo
      ? `${chequeSerialRaw.slice(0, 2)} ${chequeSerialRaw.slice(2)}`
      : chequeSerialRaw

  return {
    kkb: 'KKB',
    chequeSerialNo,
    bankCode: readSegment(BARCODE_SEGMENT_LENGTHS.bankCode),
    branchCode: readSegment(BARCODE_SEGMENT_LENGTHS.branchCode),
    accountNo: readSegment(BARCODE_SEGMENT_LENGTHS.accountNo),
    identityNo: readSegment(BARCODE_SEGMENT_LENGTHS.identityNo),
    mersisNo: readSegment(BARCODE_SEGMENT_LENGTHS.mersisNo),
    isComplete: digitsOnly.length >= BARCODE_REQUIRED_DIGIT_COUNT,
  }
}

export default function IntelligenceTab() {
  const { addLog } = useLogContext()
  const [invites, setInvites] = useState<CustomerScanInviteSummary[]>([])
  const [listLoading, setListLoading] = useState<boolean>(true)
  const [listError, setListError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CustomerScanInviteDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<boolean>(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState<boolean>(false)
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)
  const [fullscreenZoom, setFullscreenZoom] = useState<number>(FULLSCREEN_ZOOM_MIN)
  const [selectedCheckIndex, setSelectedCheckIndex] = useState<number>(0)

  const selectedInvite = useMemo(() => {
    if (selectedInviteId === null) {
      return null
    }

    return invites.find((invite) => invite.invite_id === selectedInviteId) ?? null
  }, [invites, selectedInviteId])

  const fullscreenImages = useMemo(() => {
    if (!selectedDetail) {
      return []
    }

    return selectedDetail.checks.map((check) => ({
      src: check.image_data_url,
      alt: `Çek ${check.sequence_no.toString()} görseli`,
    }))
  }, [selectedDetail])

  const selectedCheck = useMemo(() => {
    if (!selectedDetail || selectedDetail.checks.length === 0) {
      return null
    }

    const normalizedIndex = Math.min(
      Math.max(selectedCheckIndex, 0),
      selectedDetail.checks.length - 1,
    )
    return selectedDetail.checks[normalizedIndex] ?? null
  }, [selectedCheckIndex, selectedDetail])

  const parsedSelectedQrContent = useMemo(() => {
    if (!selectedCheck) {
      return null
    }

    return parseBarcodeTextContent(selectedCheck.qr_value)
  }, [selectedCheck])

  const summaryStats = useMemo(() => {
    let pendingCount = 0
    let claimedCount = 0
    let submittedCount = 0
    let expiredCount = 0
    let totalCheckCount = 0

    for (const invite of invites) {
      if (invite.status === 'pending') {
        pendingCount += 1
      } else if (invite.status === 'claimed') {
        claimedCount += 1
      } else if (invite.status === 'submitted') {
        submittedCount += 1
      } else if (invite.status === 'expired') {
        expiredCount += 1
      }

      totalCheckCount += invite.check_count
    }

    return {
      totalInviteCount: invites.length,
      pendingCount,
      claimedCount,
      submittedCount,
      expiredCount,
      totalCheckCount,
    }
  }, [invites])

  const filteredInvites = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('tr-TR')

    return invites.filter((invite) => {
      if (statusFilter !== 'all' && invite.status !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return (
        invite.customer_national_id.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        invite.customer_email.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        invite.invite_id.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
      )
    })
  }, [invites, searchQuery, statusFilter])

  const listedInvites = useMemo(() => {
    return filteredInvites.slice(0, LIST_PAGE_SIZE)
  }, [filteredInvites])

  const loadInvites = useCallback(async () => {
    setListError(null)

    try {
      const response = await listCustomerScanInvites()
      setInvites(response)

      if (response.length === 0) {
        setSelectedInviteId(null)
        setDetailOpen(false)
        setSelectedDetail(null)
        return
      }

      setSelectedInviteId((previous) => {
        if (previous && response.some((invite) => invite.invite_id === previous)) {
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

  const openDetail = useCallback((inviteId: string) => {
    setSelectedInviteId(inviteId)
    setSelectedCheckIndex(0)
    setDetailOpen(true)
  }, [])

  const openFullscreenImage = useCallback((index: number) => {
    setFullscreenZoom(FULLSCREEN_ZOOM_MIN)
    setFullscreenIndex(index)
  }, [])

  const zoomInFullscreenImage = useCallback(() => {
    setFullscreenZoom((previous) =>
      Math.min(FULLSCREEN_ZOOM_MAX, Number((previous + FULLSCREEN_ZOOM_STEP).toFixed(2))),
    )
  }, [])

  const zoomOutFullscreenImage = useCallback(() => {
    setFullscreenZoom((previous) =>
      Math.max(FULLSCREEN_ZOOM_MIN, Number((previous - FULLSCREEN_ZOOM_STEP).toFixed(2))),
    )
  }, [])

  const resetFullscreenZoom = useCallback(() => {
    setFullscreenZoom(FULLSCREEN_ZOOM_MIN)
  }, [])

  const goToPreviousFullscreenImage = useCallback(() => {
    setFullscreenIndex((previous) => {
      if (previous === null || fullscreenImages.length <= 1) {
        return previous
      }

      return (previous - 1 + fullscreenImages.length) % fullscreenImages.length
    })
  }, [fullscreenImages.length])

  const goToNextFullscreenImage = useCallback(() => {
    setFullscreenIndex((previous) => {
      if (previous === null || fullscreenImages.length <= 1) {
        return previous
      }

      return (previous + 1) % fullscreenImages.length
    })
  }, [fullscreenImages.length])

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
    if (!detailOpen || selectedInviteId === null) {
      return
    }

    void loadDetail(selectedInviteId)
  }, [detailOpen, loadDetail, selectedInviteId])

  useEffect(() => {
    if (!selectedDetail || selectedDetail.checks.length === 0) {
      setSelectedCheckIndex(0)
      return
    }

    setSelectedCheckIndex((previous) => {
      if (previous < 0) {
        return 0
      }
      if (previous >= selectedDetail.checks.length) {
        return selectedDetail.checks.length - 1
      }
      return previous
    })
  }, [selectedDetail])

  useEffect(() => {
    if (fullscreenIndex === null) {
      return
    }

    if (fullscreenImages.length === 0) {
      setFullscreenIndex(null)
      return
    }

    if (fullscreenIndex >= fullscreenImages.length) {
      setFullscreenIndex(fullscreenImages.length - 1)
    }
  }, [fullscreenImages.length, fullscreenIndex])

  const activeFullscreenImage = useMemo(() => {
    if (fullscreenIndex === null || fullscreenImages.length === 0) {
      return null
    }

    const normalizedIndex =
      ((fullscreenIndex % fullscreenImages.length) + fullscreenImages.length) %
      fullscreenImages.length
    const image = fullscreenImages[normalizedIndex]
    if (!image) {
      return null
    }

    return {
      ...image,
      index: normalizedIndex,
      total: fullscreenImages.length,
    }
  }, [fullscreenImages, fullscreenIndex])

  useEffect(() => {
    if (activeFullscreenImage === null) {
      return
    }

    setFullscreenZoom(FULLSCREEN_ZOOM_MIN)
  }, [activeFullscreenImage?.index])

  useEffect(() => {
    if (activeFullscreenImage === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreenIndex(null)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousFullscreenImage()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNextFullscreenImage()
        return
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomInFullscreenImage()
        return
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOutFullscreenImage()
        return
      }

      if (event.key === '0') {
        event.preventDefault()
        resetFullscreenZoom()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    activeFullscreenImage,
    goToNextFullscreenImage,
    goToPreviousFullscreenImage,
    resetFullscreenZoom,
    zoomInFullscreenImage,
    zoomOutFullscreenImage,
  ])

  const fullscreenOverlay =
    activeFullscreenImage === null
      ? null
      : createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
            onClick={() => {
              setFullscreenIndex(null)
            }}
            role="presentation"
          >
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-500/40 bg-neutral-900/90 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation()
                  zoomOutFullscreenImage()
                }}
                disabled={fullscreenZoom <= FULLSCREEN_ZOOM_MIN}
                aria-label="Uzaklaştır"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-500/40 bg-neutral-900/90 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation()
                  zoomInFullscreenImage()
                }}
                disabled={fullscreenZoom >= FULLSCREEN_ZOOM_MAX}
                aria-label="Yakınlaştır"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-500/40 bg-neutral-900/90 px-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                onClick={(event) => {
                  event.stopPropagation()
                  resetFullscreenZoom()
                }}
              >
                {(fullscreenZoom * 100).toFixed(0)}%
              </button>
            </div>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-lg border border-neutral-500/40 bg-neutral-900/90 px-3 py-1 text-sm font-semibold text-white transition hover:bg-neutral-800"
              onClick={(event) => {
                event.stopPropagation()
                setFullscreenIndex(null)
              }}
            >
              Kapat
            </button>
            {activeFullscreenImage.total > 1 ? (
              <>
                <button
                  type="button"
                  className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-500/40 bg-neutral-900/90 text-white transition hover:bg-neutral-800"
                  onClick={(event) => {
                    event.stopPropagation()
                    goToPreviousFullscreenImage()
                  }}
                  aria-label="Önceki çek"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-500/40 bg-neutral-900/90 text-white transition hover:bg-neutral-800"
                  onClick={(event) => {
                    event.stopPropagation()
                    goToNextFullscreenImage()
                  }}
                  aria-label="Sonraki çek"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
            <div
              className="h-[82.8vh] w-[86.4vw] overflow-auto rounded-lg"
              onClick={(event) => {
                event.stopPropagation()
              }}
              onWheel={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.deltaY < 0) {
                  zoomInFullscreenImage()
                } else if (event.deltaY > 0) {
                  zoomOutFullscreenImage()
                }
              }}
            >
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src={activeFullscreenImage.src}
                  alt={activeFullscreenImage.alt}
                  className="h-full w-full rounded-lg object-contain"
                  style={{
                    transform: `scale(${fullscreenZoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 120ms ease-out',
                  }}
                  draggable={false}
                />
              </div>
            </div>
            {activeFullscreenImage.total > 1 ? (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-neutral-600/50 bg-neutral-900/85 px-3 py-1 text-sm font-semibold text-neutral-100">
                {(activeFullscreenImage.index + 1).toString()} / {activeFullscreenImage.total.toString()}
              </div>
            ) : null}
          </div>,
          document.body,
        )

  if (detailOpen) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-4">
        <article className="min-h-0 overflow-auto rounded-3xl border border-[#DDEFE3] bg-white/95 p-4 shadow-[0_14px_36px_rgba(0,122,61,0.08)] backdrop-blur-sm sm:p-6 dark:border-[#1f3327] dark:bg-[#132017]/95">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#DDEFE3] pb-4 dark:border-[#1f3327]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false)
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-950/70 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Listeye Dön
              </button>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A3D] text-white">
                <Eye className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                    Kayıt Detayı
                  </h3>
                  {selectedDetail ? (
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-sm font-semibold ${statusBadge(selectedDetail.invite.status)}`}
                    >
                      {statusLabel(selectedDetail.invite.status)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-500 dark:text-neutral-400">
                  Davet, müşteri ve tarama detayları bu ekranda ayrıntılı gösterilir.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedInviteId) {
                  void loadDetail(selectedInviteId)
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-950/70 dark:text-neutral-100 dark:hover:bg-neutral-800"
              disabled={detailLoading || selectedInviteId === null}
            >
              <RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} />
              Detayı Yenile
            </button>
          </header>

          {!selectedInvite ? (
            <p className="text-sm text-slate-500 dark:text-neutral-400">Seçili kayıt bulunamadı.</p>
          ) : detailLoading ? (
            <p className="text-sm text-slate-500 dark:text-neutral-400">Detay yükleniyor...</p>
          ) : detailError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {detailError}
            </p>
          ) : selectedDetail ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/35">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                  Müşteri ve Kayıt Bilgileri
                </h4>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                  Durum bilgisi başlıkta rozet olarak, temel kayıt bilgileri bu panelde.
                </p>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-neutral-900/50">
                    <p className="font-semibold text-slate-500 dark:text-neutral-400">TC Kimlik</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      {selectedDetail.invite.customer_national_id}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-neutral-900/50">
                    <p className="font-semibold text-slate-500 dark:text-neutral-400">E-posta</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      {selectedDetail.invite.customer_email}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-neutral-900/50">
                    <p className="font-semibold text-slate-500 dark:text-neutral-400">Gönderilen Çek</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-100">
                      {selectedDetail.invite.check_count.toString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-neutral-900/50">
                    <p className="font-semibold text-slate-500 dark:text-neutral-400">Son İşlem</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      {formatDateTime(
                        selectedDetail.invite.submitted_at ?? selectedDetail.invite.claimed_at,
                      )}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/35">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      Çek Kayıtları ({selectedDetail.checks.length.toString()})
                    </h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                      Soldan çek seçin, sağda önizleme ve altında QR bilgisi görünsün.
                    </p>
                  </div>
                  {selectedCheck ? (
                    <button
                      type="button"
                      onClick={() => {
                        openFullscreenImage(selectedCheckIndex)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Tam Ekran
                    </button>
                  ) : null}
                </div>

                {selectedDetail.checks.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-neutral-400">
                    Bu kayıtta gönderilen çek bulunmuyor.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/50">
                      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                        Çek Dosya Ağacı
                      </div>
                      <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto dark:divide-neutral-900">
                        {selectedDetail.checks.map((check, checkIndex) => {
                          const isSelected = checkIndex === selectedCheckIndex
                          return (
                            <li key={`${check.sequence_no.toString()}-${check.captured_at}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCheckIndex(checkIndex)
                                }}
                                className={`flex w-full items-start gap-3 px-3 py-2 text-left transition ${
                                  isSelected
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10'
                                    : 'hover:bg-slate-50 dark:hover:bg-neutral-900'
                                }`}
                              >
                                <span className="rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
                                  <img
                                    src={check.image_data_url}
                                    alt={`Çek ${check.sequence_no.toString()} küçük görseli`}
                                    className="h-16 w-24 object-contain"
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    çek_{check.sequence_no.toString()}.jpg
                                  </span>
                                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-neutral-400">
                                    Çek No: {check.sequence_no.toString()}
                                  </span>
                                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-neutral-400">
                                    {formatDateTime(check.captured_at)}
                                  </span>
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </aside>

                    <div className="min-w-0 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/50">
                        {selectedCheck ? (
                          <button
                            type="button"
                            onClick={() => {
                              openFullscreenImage(selectedCheckIndex)
                            }}
                            className="block w-full rounded-lg border border-slate-200 bg-slate-50 p-2 transition hover:bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                            aria-label={`Çek ${selectedCheck.sequence_no.toString()} görselini tam ekranda aç`}
                          >
                            <img
                              src={selectedCheck.image_data_url}
                              alt={`Çek ${selectedCheck.sequence_no.toString()} görseli`}
                              className="max-h-[460px] w-full object-contain"
                            />
                          </button>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-neutral-400">Çek seçilmedi.</p>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40">
                        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
                          QR Bilgisi
                        </p>
                        {selectedCheck ? (
                          <>
                            <p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">
                              Çek No: <span className="font-semibold">{selectedCheck.sequence_no.toString()}</span>
                            </p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
                              Çek Zamanı: {formatDateTime(selectedCheck.captured_at)}
                            </p>
                            <p className="mt-2 break-all rounded-md border border-slate-200 bg-white p-3 font-mono text-sm font-semibold leading-relaxed text-slate-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                              {selectedCheck.qr_value}
                            </p>
                            {parsedSelectedQrContent ? (
                              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    KKB
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.kkb}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    Çek Seri Sıra No
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.chequeSerialNo}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    Banka Kodu
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.bankCode}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    Şube Kodu
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.branchCode}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950 sm:col-span-2">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    Hesap No (MICR son 16)
                                  </p>
                                  <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.accountNo}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    TCKN / VKN
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.identityNo}
                                  </p>
                                </div>
                                <div className="rounded-md bg-white p-2 dark:bg-neutral-950">
                                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    Mersis No
                                  </p>
                                  <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                    {parsedSelectedQrContent.mersisNo}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                            {parsedSelectedQrContent && !parsedSelectedQrContent.isComplete ? (
                              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                QR içeriği beklenen format uzunluğundan kısa; alanlar mevcut veriye göre ayrıldı.
                              </p>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {}}
                              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007A3D] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,122,61,0.28)] transition hover:bg-[#018342]"
                            >
                              <Send className="h-4 w-4" />
                              İstihbarata Gönder
                            </button>
                            <p className="mt-1 text-center text-sm text-slate-500 dark:text-neutral-400">
                              Bu aksiyon yakında aktif olacak.
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">
                            QR kaydı bulunamadı.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-400">Detay bulunamadı.</p>
          )}
        </article>

        {fullscreenOverlay}
      </section>
    )
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-1 gap-5">
      <article className="min-h-0 rounded-3xl border border-[#DDEFE3] bg-white/95 p-4 shadow-[0_14px_36px_rgba(0,122,61,0.08)] backdrop-blur-sm sm:p-6 dark:border-[#1f3327] dark:bg-[#132017]/95">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#DDEFE3] pb-4 dark:border-[#1f3327]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A3D] text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                İstihbarat Sistemi
              </h3>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                Kayıtlarınızı tabloda filtreleyin, satıra tıklayınca tam sayfa detaya geçin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadInvites()
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-950/70 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" /> Listeyi Yenile
          </button>
        </header>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Toplam Kayıt
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-neutral-100">
              {summaryStats.totalInviteCount.toString()}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Bekleyen
            </p>
            <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-300">
              {summaryStats.pendingCount.toString()}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Açılan
            </p>
            <p className="mt-1 text-xl font-bold text-[#007A3D] dark:text-[#9bd8b3]">
              {summaryStats.claimedCount.toString()}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Gönderilen
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {summaryStats.submittedCount.toString()}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Süresi Dolan
            </p>
            <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-300">
              {summaryStats.expiredCount.toString()}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Toplam Çek
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-neutral-100">
              {summaryStats.totalCheckCount.toString()}
            </p>
          </article>
        </section>

        <section className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_220px] dark:border-neutral-800 dark:bg-neutral-950/40">
          <label className="space-y-1 text-sm font-semibold text-slate-600 dark:text-neutral-300">
            <span className="inline-flex items-center gap-1">
              <Search className="h-3.5 w-3.5" />
              Arama (TC, e-posta, davet id)
            </span>
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
              }}
              placeholder="Örn. 12345678987 veya müşteri@domain.com"
              className="h-10 w-full rounded-lg border border-[#D6E5DC] bg-white px-3 text-sm text-[#4B4F54] outline-none transition focus:border-[#7DB900] dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
            />
          </label>

          <label className="space-y-1 text-sm font-semibold text-slate-600 dark:text-neutral-300">
            <span className="inline-flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              Durum Filtresi
            </span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter)
              }}
              className="h-10 w-full rounded-lg border border-[#D6E5DC] bg-white px-3 text-sm text-[#4B4F54] outline-none transition focus:border-[#7DB900] dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {listError ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            {listError}
          </p>
        ) : null}

        <div className="min-h-[460px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
          {listLoading ? (
            <p className="px-3 py-4 text-sm text-slate-500 dark:text-neutral-400">Yükleniyor...</p>
          ) : filteredInvites.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500 dark:text-neutral-400">
              Filtreye uygun kayıt bulunmuyor.
            </p>
          ) : (
            <table className="min-w-[980px] divide-y divide-slate-200 text-left text-sm dark:divide-neutral-800 lg:min-w-full">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-neutral-950/90">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">TC</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">E-posta</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">Durum</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">Çek</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">Oluşturma</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">Gönderim</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 dark:text-neutral-300">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-900">
                {listedInvites.map((invite) => (
                  <tr
                    key={invite.invite_id}
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      openDetail(invite.invite_id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openDetail(invite.invite_id)
                      }
                    }}
                    className="cursor-pointer outline-none transition hover:bg-[#EAF4EE] focus-visible:bg-[#EAF4EE] dark:hover:bg-[#214330]/70 dark:focus-visible:bg-[#214330]/70"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-neutral-100">
                      {invite.customer_national_id}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-neutral-300">
                      {invite.customer_email}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-semibold ${statusBadge(invite.status)}`}
                      >
                        {statusLabel(invite.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-neutral-300">
                      {invite.check_count.toString()}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-neutral-300">
                      {formatDateTime(invite.created_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-neutral-300">
                      {formatDateTime(invite.submitted_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF4EE] px-2 py-1 text-sm font-semibold text-[#007A3D] dark:bg-[#214330] dark:text-[#9bd8b3]">
                        <Eye className="h-3.5 w-3.5" />
                        Detay Aç
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredInvites.length > LIST_PAGE_SIZE ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-neutral-400">
            {`${LIST_PAGE_SIZE.toString()} kayıt gösteriliyor. Daha fazla kayıt için filtreyi daraltın.`}
          </p>
        ) : null}
      </article>

      {fullscreenOverlay}
    </section>
  )
}
