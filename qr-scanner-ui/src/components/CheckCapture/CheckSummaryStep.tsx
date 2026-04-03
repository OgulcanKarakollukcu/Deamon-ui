import { useEffect, useMemo, useState } from 'react'
import type { CapturedCheck } from '../../types/check'

export interface CheckSummaryStepProps {
  check: CapturedCheck
  checkIndex: number
  checks: CapturedCheck[]
  onAddAnother: () => void
  onFinish: () => void
}

export function CheckSummaryStep({
  check,
  checkIndex,
  checks,
  onAddAnother,
  onFinish,
}: CheckSummaryStepProps) {
  const displayChecks = useMemo(() => {
    if (checks.length === 0) {
      return [check]
    }

    const hasCurrent = checks.some((item) => item.id === check.id)
    return hasCurrent ? checks : [...checks, check]
  }, [check, checks])

  const [selectedCheckId, setSelectedCheckId] = useState<string>(check.id)

  useEffect(() => {
    setSelectedCheckId(check.id)
  }, [check.id])

  const selectedCheck =
    displayChecks.find((item) => item.id === selectedCheckId) ?? check

  const selectedIndex = Math.max(
    1,
    displayChecks.findIndex((item) => item.id === selectedCheck.id) + 1 || checkIndex,
  )

  return (
    <section className="-mx-4 -mt-14 flex h-[calc(100vh-3.5rem)] flex-col bg-white px-6 sm:-mx-6">
      <div className="mx-auto mt-8 mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/40 bg-green-500/20">
        <span className="text-2xl text-green-400">✓</span>
      </div>

      <h2 className="text-center text-xl font-semibold text-slate-900">
        Çek #{checkIndex} Eklendi
      </h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Eklenen çeklerden birini seçip detaylarını inceleyebilirsiniz.
      </p>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Eklenen Çekler</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {displayChecks.map((item, index) => {
              const isActive = selectedCheck.id === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCheckId(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'border-[#007A3D] bg-white shadow-[0_4px_16px_rgba(0,122,61,0.14)]'
                        : 'border-emerald-100 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <img
                      src={item.photoDataUrl}
                      alt={`Çek ${index + 1} önizleme`}
                      className="h-11 w-16 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Çek #{index + 1}</p>
                      <p className="mt-1 line-clamp-1 break-all font-mono text-xs text-slate-600">
                        {item.qrValue}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Seçili Çek #{selectedIndex}</p>
          <img
            src={selectedCheck.photoDataUrl}
            alt={`Çek ${selectedIndex} fotoğrafı`}
            className="mt-3 max-h-[40vh] w-full rounded-xl border border-emerald-100 bg-slate-50 object-contain"
          />

          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">QR İçeriği</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-900">
              {selectedCheck.qrValue}
            </p>
          </div>
        </div>
      </div>

      <div className="pb-8">
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
