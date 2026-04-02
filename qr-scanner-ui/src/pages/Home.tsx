import type { ReactNode } from 'react'
import { AppLayout } from '../components/AppLayout'
import {
  BatchPhotoStep,
  CheckPhotoStep,
  CheckSummaryStep,
  QrScanStep,
  SessionSummaryStep,
} from '../components/CheckCapture'
import { useCheckSession } from '../hooks/useCheckSession'
import type { CapturedCheck } from '../types/check'

export interface HomeProps {
  onSessionReset?: () => void
}

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

export function Home({ onSessionReset }: HomeProps) {
  const {
    session,
    step,
    currentCheck,
    saveCheckPhoto,
    saveQrValue,
    addAnotherCheck,
    goToBatchPhoto,
    saveBatchPhoto,
    reset,
  } = useCheckSession()

  const handleSessionReset = (): void => {
    reset()
    onSessionReset?.()
  }

  let content: ReactNode

  switch (step) {
    case 'check-photo':
      content = (
        <AppLayout stepLabel="Fotoğraf Çek" stepCurrent={1} stepTotal={3}>
          <CheckPhotoStep onCapture={saveCheckPhoto} />
        </AppLayout>
      )
      break

    case 'qr-scan':
      content = (
        <AppLayout stepLabel="QR Tara" stepCurrent={2} stepTotal={3}>
          <QrScanStep
            checkPhoto={currentCheck.photoDataUrl ?? ''}
            onScanned={saveQrValue}
          />
        </AppLayout>
      )
      break

    case 'check-summary': {
      const summaryCheck = resolveSummaryCheck(currentCheck, session.checks)

      if (!summaryCheck) {
        content = (
          <AppLayout stepLabel="Çek Tamamlandı" stepCurrent={3} stepTotal={3}>
            <section className="space-y-4 rounded-2xl border border-red-500/50 bg-red-500/10 p-5">
              <h2 className="text-base font-semibold text-red-100">
                Çek özeti hazırlanamadı
              </h2>
              <p className="text-sm text-red-100/90">
                Çek bilgileri eksik görünüyor. Yeni bir çekle devam edebilirsiniz.
              </p>
              <button
                type="button"
                onClick={addAnotherCheck}
                className="w-full rounded-xl bg-red-200 px-4 py-3 text-sm font-semibold text-red-950 transition-colors hover:bg-red-100"
              >
                Yeni Çek Ekle
              </button>
            </section>
          </AppLayout>
        )
        break
      }

      content = (
        <AppLayout stepLabel="Çek Tamamlandı" stepCurrent={3} stepTotal={3}>
          <CheckSummaryStep
            check={summaryCheck}
            checkIndex={getSummaryCheckIndex(summaryCheck, session.checks)}
            onAddAnother={addAnotherCheck}
            onFinish={goToBatchPhoto}
          />
        </AppLayout>
      )
      break
    }

    case 'batch-photo':
      content = (
        <AppLayout stepLabel="Toplu Fotoğraf" stepCurrent={1} stepTotal={1}>
          <BatchPhotoStep
            checkCount={session.checks.length}
            onCapture={saveBatchPhoto}
          />
        </AppLayout>
      )
      break

    case 'session-summary':
      content = (
        <main className="min-h-screen bg-slate-950 text-slate-100">
          <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
            <SessionSummaryStep session={session} onReset={handleSessionReset} />
          </div>
        </main>
      )
      break

    default:
      content = null
  }

  return content
}

export default Home
