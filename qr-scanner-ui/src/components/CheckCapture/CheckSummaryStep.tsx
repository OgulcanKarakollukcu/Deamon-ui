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
    <section className="-mx-4 -mt-14 flex h-[calc(100vh-3.5rem)] flex-col bg-slate-950 px-6 sm:-mx-6">
      <div className="mx-auto mt-8 mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/40 bg-green-500/20">
        <span className="text-2xl text-green-400">✓</span>
      </div>

      <h2 className="text-center text-xl font-semibold text-white">
        Çek #{displayIndex} Eklendi
      </h2>

      <div className="mt-4 rounded-2xl bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <img
            src={check.photoDataUrl}
            alt={`Çek ${displayIndex} fotoğrafı`}
            className="h-14 w-20 rounded-lg object-cover"
          />

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-400">QR İçeriği</p>
            <p className="mt-1 line-clamp-2 break-all font-mono text-sm text-white">
              {check.qrValue}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pb-8">
        <button
          type="button"
          onClick={onAddAnother}
          className="h-14 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Yeni Çek Ekle
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="mt-3 h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700"
        >
          Toplu Fotoğraf Çek
        </button>
      </div>
    </section>
  )
}

export default CheckSummaryStep
