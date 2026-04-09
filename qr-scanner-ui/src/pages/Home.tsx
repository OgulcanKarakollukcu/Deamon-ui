import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import {
  CheckPhotoStep,
  CheckSummaryStep,
  SessionSummaryStep,
  StartConsentStep,
} from '../components/CheckCapture'
import { SiteFooter } from '../components/SiteFooter'
import { SideMenu, useMenuState } from '../components/SideMenu'
import { useCheckSession } from '../hooks/useCheckSession'
import type { CapturedCheck } from '../types/check'
import { Landing } from './Landing'

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

  return checks[checks.length - 1]
}

function getSummaryCheckIndex(summaryCheck: CapturedCheck, checks: CapturedCheck[]): number {
  const index = checks.findIndex((item) => item.id === summaryCheck.id)
  if (index === -1) {
    return checks.length > 0 ? checks.length : 1
  }

  return index + 1
}

export function Home() {
  const navigate = useNavigate()
  const { open, toggle, close } = useMenuState()
  const {
    session,
    step,
    currentCheck,
    start,
    proceedToCheckPhoto,
    goToHomeLanding,
    saveCheckPhoto,
    addChecksBulk,
    addAnotherCheck,
    retakeCheck,
    finish,
    reset,
  } = useCheckSession()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [step])

  const handleSessionReset = (): void => {
    reset()
    navigate('/')
  }

  let content: ReactNode

  switch (step) {
    case 'home-landing':
      content = (
        <AppLayout
          stepLabel="Çek Tarama"
          stepCurrent={1}
          stepTotal={1}
          onMenuOpen={toggle}
          fullWidth
        >
          <Landing onStart={start} embedded />
        </AppLayout>
      )
      break

    case 'check-photo':
      content = (
        <main className="h-[100dvh] w-full overflow-hidden bg-black">
          <CheckPhotoStep onCapture={saveCheckPhoto} onCaptureMultiple={addChecksBulk} />
        </main>
      )
      break

    case 'pre-start-info':
      content = (
        <AppLayout
          stepLabel="Bilgilendirme ve KVKK Onayı"
          stepCurrent={1}
          stepTotal={1}
          onMenuOpen={toggle}
          fullWidth
        >
          <StartConsentStep
            onContinue={proceedToCheckPhoto}
            onBack={goToHomeLanding}
          />
        </AppLayout>
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
            onMenuOpen={toggle}
          >
            <section className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-base font-semibold text-red-700">
                Çek özeti hazırlanamadı
              </h2>
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
          onMenuOpen={toggle}
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
              <button
                type="button"
                onClick={toggle}
                className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-md text-[#007A3D] transition-colors hover:text-[#018342]"
                aria-label="Menüyü aç"
              >
                <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
                <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
                <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
              </button>
              <p className="text-sm font-medium text-slate-900">Oturum Özeti</p>
              <span className="w-10" />
            </div>
          </header>

          <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-20 sm:px-6 sm:pb-8">
            <SessionSummaryStep
              session={session}
              onReset={handleSessionReset}
              onRetakeCheck={retakeCheck}
            />
          </div>

          <SiteFooter />
        </main>
      )
      break

    default:
      content = null
  }

  return (
    <>
      {content}
      <SideMenu open={open} onClose={close} />
    </>
  )
}

export default Home
