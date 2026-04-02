import type { CapturedCheck } from '../../types/check'

export interface CheckSummaryStepProps {
  check: CapturedCheck
  checkIndex: number
  onAddAnother: () => void
  onFinish: () => void
}

export function CheckSummaryStep({
  check,
  checkIndex,
  onAddAnother,
  onFinish,
}: CheckSummaryStepProps) {
  const displayIndex = checkIndex

  return (
    <section className="-mx-4 -mt-14 flex h-[calc(100vh-3.5rem)] flex-col bg-white px-6 sm:-mx-6">
      <div className="mx-auto mt-8 mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/40 bg-green-500/20">
        <span className="text-2xl text-green-400">✓</span>
      </div>

      <h2 className="text-center text-xl font-semibold text-slate-900">
        Çek #{displayIndex} Eklendi
      </h2>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <img
            src={check.photoDataUrl}
            alt={`Çek ${displayIndex} fotoğrafı`}
            className="h-14 w-20 rounded-lg object-cover"
          />

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">QR İçeriği</p>
            <p className="mt-1 line-clamp-2 break-all font-mono text-sm text-slate-900">
              {check.qrValue}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pb-8">
        <button
          type="button"
          onClick={onAddAnother}
          className="h-14 w-full rounded-2xl bg-[#007A3D] text-base font-semibold text-white transition-colors hover:bg-[#018342]"
        >
          Yeni Çek Ekle
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="mt-3 h-12 w-full rounded-2xl border border-[#D6E5DC] bg-white text-sm font-semibold text-[#007A3D] transition-colors hover:bg-[#F3F8F5]"
        >
          Toplu Fotoğraf Çek
        </button>
      </div>
    </section>
  )
}

export default CheckSummaryStep
