import { useEffect, useMemo, useState } from 'react'
import type { CheckSession } from '../../types/check'

export interface SessionSummaryStepProps {
  session: CheckSession
  onReset: () => void
  onSubmit?: () => void
  onRetakeCheck?: (checkId: string) => void
  isSubmitting?: boolean
  submitSuccess?: boolean
  submitError?: string | null
}

export function SessionSummaryStep({
  session,
  onReset,
  onSubmit,
  onRetakeCheck,
  isSubmitting = false,
  submitSuccess = false,
  submitError = null,
}: SessionSummaryStepProps) {
  const hasSubmitAction = onSubmit !== undefined
  const hasRetakeAction = onRetakeCheck !== undefined
  const submitButtonDisabled = isSubmitting || submitSuccess || session.checks.length === 0
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(
    session.checks[0]?.id ?? null,
  )

  useEffect(() => {
    if (session.checks.length === 0) {
      setSelectedCheckId(null)
      return
    }

    const hasCurrentSelection = session.checks.some((check) => check.id === selectedCheckId)
    if (!hasCurrentSelection) {
      setSelectedCheckId(session.checks[0]?.id ?? null)
    }
  }, [selectedCheckId, session.checks])

  const selectedCheck = useMemo(() => {
    if (!selectedCheckId) {
      return null
    }

    return session.checks.find((check) => check.id === selectedCheckId) ?? null
  }, [selectedCheckId, session.checks])

  const selectedCheckIndex = selectedCheck
    ? session.checks.findIndex((check) => check.id === selectedCheck.id) + 1
    : null

  const retakeButtonDisabled =
    !selectedCheck || !hasRetakeAction || isSubmitting || submitSuccess

  const handleRetakeCheck = (): void => {
    if (!selectedCheck || !onRetakeCheck) {
      return
    }

    onRetakeCheck(selectedCheck.id)
  }

  return (
    <section className="-mx-4 -my-5 flex min-h-screen flex-col bg-white sm:-mx-6 sm:-my-8">
      <header className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Tarama Tamamlandı</h2>
        <p className="mt-1 text-sm text-slate-600">
          {session.checks.length} çek başarıyla eklendi
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pb-6 pt-6">
          {selectedCheck ? (
            <div className="mb-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">
                Seçili Çek #{selectedCheckIndex}
              </p>
              <img
                src={selectedCheck.photoDataUrl}
                alt={`Çek ${selectedCheckIndex ?? 1} büyük önizleme`}
                className="mt-3 max-h-[42vh] w-full rounded-xl border border-emerald-100 bg-slate-50 object-contain"
              />
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">QR İçeriği</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">
                  {selectedCheck.qrValue}
                </p>
              </div>
            </div>
          ) : null}

          {hasRetakeAction ? (
            <button
              type="button"
              onClick={handleRetakeCheck}
              disabled={retakeButtonDisabled}
              className="mb-4 h-11 w-full rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bu Çeki Sil ve Yeniden Çek
            </button>
          ) : null}

          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Çekler</p>

          {session.checks.length > 0 ? (
            <ul>
              {session.checks.map((check, index) => (
                <li
                  key={check.id}
                  className="mb-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCheckId(check.id)}
                    className={`flex w-full gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selectedCheckId === check.id
                        ? 'border-[#007A3D] bg-[#EDF8F1] shadow-[0_4px_14px_rgba(0,122,61,0.12)]'
                        : 'border-emerald-100 bg-emerald-50 hover:bg-emerald-100/70'
                    }`}
                  >
                    <img
                      src={check.photoDataUrl}
                      alt={`Çek ${index + 1} fotoğrafı`}
                      className="h-11 w-16 rounded-lg object-cover"
                    />

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">Çek #{index + 1}</p>
                      <p className="mt-1 line-clamp-1 break-all font-mono text-xs text-slate-600">
                        {check.qrValue}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-slate-600">
              Oturumda çek bulunamadı.
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-emerald-100 bg-white px-6 py-4">
        {submitError ? (
          <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {submitError}
          </p>
        ) : null}

        {submitSuccess ? (
          <p className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Çekler ve metadata şubeye iletildi.
          </p>
        ) : null}

        {hasSubmitAction ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitButtonDisabled}
            className="mb-2 h-12 w-full rounded-2xl bg-[#007A3D] text-sm font-semibold text-white transition-colors hover:bg-[#018342] disabled:cursor-not-allowed disabled:bg-[#A5A7AA]"
          >
            {isSubmitting ? 'Gönderiliyor...' : submitSuccess ? 'Gönderim Tamamlandı' : 'Çekleri Gönder'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onReset}
          className={`h-12 w-full rounded-2xl text-sm font-semibold transition-colors ${
            hasSubmitAction
              ? 'border border-[#D6E5DC] bg-white text-[#007A3D] hover:bg-[#F3F8F5]'
              : 'bg-[#007A3D] text-white hover:bg-[#018342]'
          }`}
        >
          {hasSubmitAction ? 'Oturumu Temizle' : 'Yeni Oturum Başlat'}
        </button>
      </div>
    </section>
  )
}

export default SessionSummaryStep
