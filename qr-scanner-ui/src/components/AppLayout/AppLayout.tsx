import type { ReactNode } from 'react'

export interface AppLayoutProps {
  children: ReactNode
  stepLabel: string
  stepCurrent: number
  stepTotal: number
  onBack?: () => void
}

function clampProgress(stepCurrent: number, stepTotal: number): number {
  const safeTotal = stepTotal > 0 ? stepTotal : 1
  const value = (stepCurrent / safeTotal) * 100
  return Math.min(100, Math.max(0, value))
}

export function AppLayout({
  children,
  stepLabel,
  stepCurrent,
  stepTotal,
  onBack,
}: AppLayoutProps) {
  const progressPercent = clampProgress(stepCurrent, stepTotal)

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-x-0 top-0 z-30">
        <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-[4.5rem] items-center gap-2">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300"
                  aria-label="Geri"
                >
                  Geri
                </button>
              ) : null}
              <span className="text-sm font-semibold lowercase tracking-wide text-slate-400">
                cs
              </span>
            </div>

            <p className="truncate px-2 text-sm font-medium text-white">{stepLabel}</p>

            <p className="min-w-[3rem] text-right text-xs text-slate-400">
              {stepCurrent}/{stepTotal}
            </p>
          </div>
        </header>

        <div className="h-0.5 w-full bg-slate-800">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-6 pt-14 sm:px-6 sm:pb-8">
        {children}
      </div>
    </main>
  )
}

export default AppLayout
