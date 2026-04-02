import type { ReactNode } from 'react'
import { SiteFooter } from '../SiteFooter'

export interface AppLayoutProps {
  children: ReactNode
  stepLabel: string
  stepCurrent: number
  stepTotal: number
  onBack?: () => void
  onMenuOpen?: () => void
  fullWidth?: boolean
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
  onMenuOpen,
  fullWidth = false,
}: AppLayoutProps) {
  const progressPercent = clampProgress(stepCurrent, stepTotal)
  const headerContentClass = fullWidth
    ? 'mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6'
    : 'mx-auto flex h-full w-full max-w-3xl items-center justify-between px-4 sm:px-6'
  const bodyContentClass = fullWidth
    ? 'mx-auto w-full flex-1 px-0 pb-6 pt-14 sm:px-0 sm:pb-8'
    : 'mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-14 sm:px-6 sm:pb-8'

  return (
    <main className="flex min-h-screen flex-col bg-[#F3F3F3] text-[#4B4F54]">
      <div className="fixed inset-x-0 top-0 z-30">
        <header className="h-14 border-b border-[#DFDFDF] bg-white/95 backdrop-blur-sm">
          <div className={headerContentClass}>
            <div className="flex min-w-[4.5rem] items-center gap-2">
              {onMenuOpen ? (
                <button
                  type="button"
                  onClick={onMenuOpen}
                  className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-md text-[#007A3D] transition-colors hover:text-[#018342]"
                  aria-label="Menüyü aç"
                >
                  <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
                  <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
                  <span className="h-0.5 w-5 rounded bg-[#007A3D]" />
                </button>
              ) : null}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-md border border-[#7DB900]/40 px-2 py-1 text-xs font-medium text-[#007A3D] transition-colors hover:bg-[#EAF4EE]"
                  aria-label="Geri"
                >
                  Geri
                </button>
              ) : null}
              <img
                src="/sekerbank_mini.svg"
                alt="Şekerbank mini logo"
                className="h-6 w-auto"
              />
            </div>

            <p className="truncate px-2 text-sm font-medium text-[#4B4F54]">{stepLabel}</p>

            <p className="min-w-[3rem] text-right text-xs text-[#007A3D]">
              {stepCurrent}/{stepTotal}
            </p>
          </div>
        </header>

        <div className="h-0.5 w-full bg-[#DFDFDF]">
          <div
            className="h-full bg-[#7DB900] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className={bodyContentClass}>
        {children}
      </div>

      <SiteFooter />
    </main>
  )
}

export default AppLayout
