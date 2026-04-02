import { QrScanner } from '../QrScanner'

export interface QrScanStepProps {
  checkPhoto: string
  onScanned: (value: string) => void
}

export function QrScanStep({ checkPhoto, onScanned }: QrScanStepProps) {
  return (
    <section className="-mx-4 -mt-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-white sm:-mx-6">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4">
        {checkPhoto ? (
          <img
            src={checkPhoto}
            alt="Çek fotoğrafı önizlemesi"
            className="h-10 w-14 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-emerald-100 text-xs font-semibold text-emerald-700">
            Yok
          </div>
        )}

        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">QR Kodu Okutun</p>
          <p className="text-xs text-slate-600">Çekin üzerindeki kareyi okutun</p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <QrScanner onResult={onScanned} />
      </div>
    </section>
  )
}

export default QrScanStep
