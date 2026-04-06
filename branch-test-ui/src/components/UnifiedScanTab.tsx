import clsx from 'clsx'
import { FileText, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import BordroScanTab from './BordroScanTab'
import ScanTab, { type ScanTabProps } from './ScanTab'

export type UnifiedScanMode = 'CHEQUE' | 'BORDRO_A4'

type UnifiedScanTabProps = ScanTabProps & {
  defaultMode?: UnifiedScanMode
  showModeSelector?: boolean
}

const MODE_OPTIONS: Array<{
  value: UnifiedScanMode
  label: string
  description: string
  icon: typeof ScanLine
}> = [
  {
    value: 'CHEQUE',
    label: 'Çek',
    description: 'Mevcut canlı akışlı cheque tarama ekranı',
    icon: ScanLine,
  },
  {
    value: 'BORDRO_A4',
    label: 'A4 Bordro',
    description: 'MICR ve QR olmadan düz doküman tarama',
    icon: FileText,
  },
]

export default function UnifiedScanTab({
  activeBordroId,
  expectedChequeCount,
  initialScannedCheques,
  initialScanSettings,
  onScannedChequeCountChange,
  onScannedChequesChange,
  onScanSettingsChange,
  onReservationStateChange,
  defaultMode = 'CHEQUE',
  showModeSelector = true,
}: UnifiedScanTabProps) {
  const [mode, setMode] = useState<UnifiedScanMode>(defaultMode)

  useEffect(() => {
    setMode(defaultMode)
  }, [defaultMode])

  return (
    <div className="space-y-5">
      {showModeSelector ? (
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-emerald-50/70 to-amber-50/70 p-4 shadow-sm dark:border-neutral-900 dark:from-neutral-950 dark:via-emerald-500/5 dark:to-amber-500/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-neutral-400">
                Tarama Modu
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">
                Aynı ekranda çek ve A4 bordro tarama
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
                İhtiyaca göre modu seçip aynı tarama akışı içinde devam edebilirsiniz.
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white/90 p-1 dark:border-neutral-800 dark:bg-neutral-950/80">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon
                const isActive = mode === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setMode(option.value)
                    }}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const isActive = mode === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value)
                  }}
                  className={clsx(
                    'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition',
                    isActive
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-900 dark:bg-neutral-950/50 dark:hover:bg-neutral-900',
                  )}
                >
                  <div
                    className={clsx(
                      'mt-0.5 rounded-lg p-2',
                      isActive
                        ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                        : 'bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-neutral-300',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      {option.label}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">{option.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {mode === 'CHEQUE' ? (
        <ScanTab
          activeBordroId={activeBordroId}
          expectedChequeCount={expectedChequeCount}
          initialScannedCheques={initialScannedCheques}
          initialScanSettings={initialScanSettings}
          onScannedChequeCountChange={onScannedChequeCountChange}
          onScannedChequesChange={onScannedChequesChange}
          onScanSettingsChange={onScanSettingsChange}
          onReservationStateChange={onReservationStateChange}
        />
      ) : (
        <BordroScanTab activeBordroId={activeBordroId} />
      )}
    </div>
  )
}
