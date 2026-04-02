import type { CheckSession } from '../../types/check'

export interface SessionSummaryStepProps {
  session: CheckSession
  onReset: () => void
}

export function SessionSummaryStep({ session, onReset }: SessionSummaryStepProps) {
  return (
    <section className="-mx-4 -my-5 flex min-h-screen flex-col bg-white sm:-mx-6 sm:-my-8">
      <header className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Tarama Tamamlandı</h2>
        <p className="mt-1 text-sm text-slate-600">
          {session.checks.length} çek başarıyla eklendi
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Toplu Görüntü
          </p>
          {session.batchPhotoDataUrl ? (
            <img
              src={session.batchPhotoDataUrl}
              alt="Toplu çek fotoğrafı"
              className="max-h-48 w-full rounded-2xl object-cover"
            />
          ) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-slate-600">
              Toplu fotoğraf bulunamadı.
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Çekler</p>

          {session.checks.length > 0 ? (
            <ul>
              {session.checks.map((check, index) => (
                <li
                  key={check.id}
                  className="mb-3 flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"
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
        <button
          type="button"
          onClick={onReset}
          className="h-12 w-full rounded-2xl bg-[#007A3D] text-sm font-semibold text-white transition-colors hover:bg-[#018342]"
        >
          Yeni Oturum Başlat
        </button>
      </div>
    </section>
  )
}

export default SessionSummaryStep
