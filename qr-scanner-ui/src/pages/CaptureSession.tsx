import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import {
  CheckPhotoStep,
  CheckSummaryStep,
  SessionSummaryStep,
  StartConsentStep,
} from '../components/CheckCapture'
import { useCheckSession } from '../hooks/useCheckSession'
import { claimInvite, submitInviteSession } from '../services/scanInviteClient'
import type { CapturedCheck } from '../types/check'
import { Landing } from './Landing'
import { closePageSafely } from '../utils/closePage'
import type {
  ClaimInviteResponse,
  SubmitInviteCheckPayload,
  SubmitInviteSessionResponse,
} from '../types/invite'

const CLAIM_CACHE_KEY_PREFIX = 'scan-link-claim:'

function isCapturedCheck(check: Partial<CapturedCheck>): check is CapturedCheck {
  return Boolean(check.id && check.photoDataUrl && check.qrValue)
}

function resolveSummaryCheck(
  currentCheck: Partial<CapturedCheck>,
  checks: CapturedCheck[],
): CapturedCheck | null {
  if (isCapturedCheck(currentCheck)) {
    return currentCheck
  }

  if (checks.length === 0) {
    return null
  }

  return checks[checks.length - 1] ?? null
}

function getSummaryCheckIndex(summaryCheck: CapturedCheck, checks: CapturedCheck[]): number {
  const index = checks.findIndex((item) => item.id === summaryCheck.id)
  if (index === -1) {
    return checks.length > 0 ? checks.length : 1
  }

  return index + 1
}

function mapSessionChecksToPayload(checks: CapturedCheck[]): SubmitInviteCheckPayload[] {
  return checks.map((check, index) => ({
    sequence_no: index + 1,
    qr_value: check.qrValue,
    image_data_url: check.photoDataUrl,
    captured_at: new Date().toISOString(),
    metadata: {
      client_check_id: check.id,
      qr_char_length: check.qrValue.length,
      source: 'mobile_browser',
    },
  }))
}

function buildSessionMetadata(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return {
      source: 'qr-scanner-ui',
    }
  }

  return {
    source: 'qr-scanner-ui',
    user_agent: window.navigator.userAgent,
    language: window.navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    submitted_from_url: window.location.href,
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('tr-TR')
}

function getClaimCacheKey(inviteToken: string): string {
  return `${CLAIM_CACHE_KEY_PREFIX}${inviteToken}`
}

function readClaimCache(inviteToken: string): ClaimInviteResponse | null {
  if (typeof window === 'undefined') {
    return null
  }

  const cacheKey = getClaimCacheKey(inviteToken)

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<ClaimInviteResponse>
    if (
      !parsed ||
      typeof parsed.invite_id !== 'string' ||
      typeof parsed.session_token !== 'string' ||
      typeof parsed.customer_national_id !== 'string' ||
      typeof parsed.customer_email !== 'string' ||
      typeof parsed.expires_at !== 'string'
    ) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    const expiresAtMs = new Date(parsed.expires_at).getTime()
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    return parsed as ClaimInviteResponse
  } catch {
    window.localStorage.removeItem(cacheKey)
    return null
  }
}

function writeClaimCache(inviteToken: string, claim: ClaimInviteResponse): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(getClaimCacheKey(inviteToken), JSON.stringify(claim))
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }
}

function clearClaimCache(inviteToken: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(getClaimCacheKey(inviteToken))
  } catch {
    // Ignore storage failures.
  }
}

export function CaptureSession() {
  const navigate = useNavigate()
  const { inviteToken } = useParams<{ inviteToken: string }>()
  const [claimData, setClaimData] = useState<ClaimInviteResponse | null>(null)
  const [claimLoading, setClaimLoading] = useState<boolean>(true)
  const [claimError, setClaimError] = useState<string | null>(null)

  const [submitLoading, setSubmitLoading] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitInviteSessionResponse | null>(null)

  const {
    session,
    step,
    currentCheck,
    start,
    proceedToCheckPhoto,
    goToHomeLanding,
    saveCheckPhoto,
    addAnotherCheck,
    retakeCheck,
    finish,
    reset,
  } = useCheckSession()

  useEffect(() => {
    if (!inviteToken) {
      setClaimError('Link parametresi bulunamadı.')
      setClaimLoading(false)
      return
    }

    const cachedClaim = readClaimCache(inviteToken)
    if (cachedClaim) {
      setClaimData(cachedClaim)
      setClaimError(null)
      setClaimLoading(false)
      return
    }

    let isMounted = true
    const runClaim = async () => {
      setClaimLoading(true)
      setClaimError(null)

      try {
        const response = await claimInvite(inviteToken)
        if (!isMounted) {
          return
        }
        setClaimData(response)
        writeClaimCache(inviteToken, response)
      } catch (error) {
        if (!isMounted) {
          return
        }

        const message = error instanceof Error ? error.message : String(error)
        setClaimError(message)
        setClaimData(null)
      } finally {
        if (isMounted) {
          setClaimLoading(false)
        }
      }
    }

    void runClaim()

    return () => {
      isMounted = false
    }
  }, [inviteToken])

  const inviteExpiresAt = useMemo(() => {
    if (!claimData) {
      return '-'
    }

    return formatDateTime(claimData.expires_at)
  }, [claimData])

  useEffect(() => {
    if (!submitResult || !inviteToken) {
      return
    }

    const redirectTimer = window.setTimeout(() => {
      navigate(`/capture/${inviteToken}/completed`, { replace: true })
    }, 700)

    return () => {
      window.clearTimeout(redirectTimer)
    }
  }, [inviteToken, navigate, submitResult])

  const handleSubmitSession = async () => {
    if (!claimData || submitLoading || submitResult) {
      return
    }

    setSubmitError(null)
    setSubmitLoading(true)

    try {
      const checks = mapSessionChecksToPayload(session.checks)
      const response = await submitInviteSession(claimData.invite_id, claimData.session_token, {
        checks,
        completed_at: new Date().toISOString(),
        session_metadata: buildSessionMetadata(),
      })
      setSubmitResult(response)
      if (inviteToken) {
        clearClaimCache(inviteToken)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSubmitError(message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleResetSession = () => {
    reset()
    setSubmitLoading(false)
    setSubmitError(null)
    setSubmitResult(null)
  }

  const handleRetakeFromSummary = (checkId: string): void => {
    setSubmitLoading(false)
    setSubmitError(null)
    setSubmitResult(null)
    retakeCheck(checkId)
  }

  if (claimLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] px-4 text-[#4B4F54]">
        <div className="w-full max-w-md rounded-2xl border border-[#DDEFE3] bg-white p-5 text-center shadow-[0_6px_20px_rgba(0,122,61,0.1)]">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#D3E9DB] border-t-[#007A3D]" />
          <p className="mt-3 text-sm">Davet linki doğrulanıyor...</p>
        </div>
      </main>
    )
  }

  if (claimError || !claimData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] px-4 text-[#4B4F54]">
        <div className="w-full max-w-md rounded-2xl border border-[#DDEFE3] bg-white p-6 shadow-[0_8px_24px_rgba(0,122,61,0.08)]">
          <img
            src="/sekerbank_mini.svg"
            alt="Şekerbank"
            className="mx-auto h-8 w-auto"
          />
          <h1 className="mt-3 text-center text-lg font-semibold text-slate-900">İşleminiz için teşekkür ederiz</h1>
          <p className="mt-2 text-center text-sm text-[#5B6168]">
            Bu bağlantı şu an kullanılamıyor. İşlem tamamlanmış, süresi dolmuş veya bağlantı geçersiz olabilir.
          </p>
          <p className="mt-1 text-center text-sm text-[#5B6168]">Bu sayfayı kapatabilirsiniz.</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl border border-[#D6E5DC] bg-white text-sm font-semibold text-[#007A3D] transition-colors hover:bg-[#F3F8F5]"
            >
              Tekrar Dene
            </button>
            <button
              type="button"
              onClick={closePageSafely}
              className="h-11 rounded-xl bg-[#007A3D] text-sm font-semibold text-white transition-colors hover:bg-[#018342]"
            >
              Sayfayı Kapat
            </button>
          </div>

          <p className="mt-2 text-center text-[11px] text-[#8A9096]">
            Bazı tarayıcılar güvenlik nedeniyle otomatik kapatmaya izin vermeyebilir.
          </p>
        </div>
      </main>
    )
  }

  let content: ReactNode

  switch (step) {
    case 'home-landing':
      content = (
        <AppLayout
          stepLabel="Çek Tarama"
          stepCurrent={1}
          stepTotal={1}
          fullWidth
        >
          <section className="mx-auto w-full max-w-3xl px-0">
            <Landing onStart={start} embedded />
            <div className="mx-4 mb-6 rounded-2xl border border-[#DDEFE3] bg-white p-4 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:mx-6">
              <p className="text-xs uppercase tracking-wide text-[#007A3D]">Davet Onaylandı</p>
              <p className="mt-2 text-sm text-[#6E747B]">
                Müşteri TC: <strong>{claimData.customer_national_id}</strong>
              </p>
              <p className="mt-1 text-sm text-[#6E747B]">
                Müşteri e-posta: <strong>{claimData.customer_email}</strong>
              </p>
              <p className="mt-1 text-sm text-[#6E747B]">Link geçerlilik: {inviteExpiresAt}</p>
            </div>
          </section>
        </AppLayout>
      )
      break

    case 'pre-start-info':
      content = (
        <AppLayout
          stepLabel="Bilgilendirme ve KVKK Onayı"
          stepCurrent={1}
          stepTotal={1}
          fullWidth
        >
          <StartConsentStep
            onContinue={proceedToCheckPhoto}
            onBack={goToHomeLanding}
            customerNationalId={claimData.customer_national_id}
            customerEmail={claimData.customer_email}
            inviteExpiresAtText={inviteExpiresAt}
          />
        </AppLayout>
      )
      break

    case 'check-photo':
      content = (
        <main className="h-[100dvh] w-full overflow-hidden bg-black">
          <CheckPhotoStep onCapture={saveCheckPhoto} />
        </main>
      )
      break

    case 'check-summary': {
      const summaryCheck = resolveSummaryCheck(currentCheck, session.checks)

      if (!summaryCheck) {
        content = (
          <AppLayout
            stepLabel="Çek Tamamlandı"
            stepCurrent={2}
            stepTotal={2}
          >
            <section className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-base font-semibold text-red-700">Çek özeti hazırlanamadı</h2>
              <p className="text-sm text-red-700/90">
                Çek bilgileri eksik görünüyor. Yeni bir çekle devam edebilirsiniz.
              </p>
              <button
                type="button"
                onClick={addAnotherCheck}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                Yeni Çek Ekle
              </button>
            </section>
          </AppLayout>
        )
        break
      }

      content = (
        <AppLayout
          stepLabel="Çek Tamamlandı"
          stepCurrent={2}
          stepTotal={2}
        >
          <CheckSummaryStep
            check={summaryCheck}
            checkIndex={getSummaryCheckIndex(summaryCheck, session.checks)}
            checks={session.checks}
            onAddAnother={addAnotherCheck}
            onRetakeCheck={retakeCheck}
            onFinish={finish}
          />
        </AppLayout>
      )
      break
    }

    case 'session-summary':
      content = (
        <main className="flex min-h-screen flex-col bg-white text-slate-900">
          <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-[#DFDFDF] bg-white/95 backdrop-blur-sm">
            <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-between px-4 sm:px-6">
              <div className="w-10" />
              <p className="text-sm font-medium text-slate-900">Oturum Özeti</p>
              <span className="w-10" />
            </div>
          </header>

          <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-20 sm:px-6 sm:pb-8">
            <SessionSummaryStep
              session={session}
              onReset={handleResetSession}
              onSubmit={handleSubmitSession}
              onRetakeCheck={handleRetakeFromSummary}
              isSubmitting={submitLoading}
              submitSuccess={submitResult !== null}
              submitError={submitError}
            />
          </div>
        </main>
      )
      break

    default:
      content = null
  }

  return <>{content}</>
}

export default CaptureSession
