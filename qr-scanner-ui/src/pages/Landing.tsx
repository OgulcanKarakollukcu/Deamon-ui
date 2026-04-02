import { useMemo, useState, type CSSProperties } from 'react'

interface LogoModuleMap {
  [path: string]: string
}

const ASSET_LOGO_SVG = import.meta.glob('../assets/cybersoft-logo.svg', {
  eager: true,
  import: 'default',
}) as LogoModuleMap
const ASSET_LOGO_PNG = import.meta.glob('../assets/cybersoft-logo.png', {
  eager: true,
  import: 'default',
}) as LogoModuleMap
const ASSET_LOGO_WEBP = import.meta.glob('../assets/cybersoft-logo.webp', {
  eager: true,
  import: 'default',
}) as LogoModuleMap

const PUBLIC_LOGO_CANDIDATES = [
  '/cybersoft-logo.svg',
  '/cybersoft-logo.png',
  '/cybersoft-logo.webp',
]

export interface LandingProps {
  onStart: () => void
}

export function Landing({ onStart }: LandingProps) {
  const [logoIndex, setLogoIndex] = useState(0)

  const logoCandidates = useMemo(() => {
    return [
      ...Object.values(ASSET_LOGO_SVG),
      ...Object.values(ASSET_LOGO_PNG),
      ...Object.values(ASSET_LOGO_WEBP),
      ...PUBLIC_LOGO_CANDIDATES,
    ]
  }, [])

  const activeLogoSrc = logoCandidates[logoIndex] ?? null

  const logoAnimationStyle: CSSProperties = {
    animation: 'fadeSlideUp 480ms ease-out both',
  }
  const buttonAnimationStyle: CSSProperties = {
    animation: 'fadeSlideUp 480ms ease-out 150ms both',
  }

  const handleLogoError = (): void => {
    setLogoIndex((prev) => prev + 1)
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <style>
        {`@keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }`}
      </style>

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div style={logoAnimationStyle} className="mb-6">
            {activeLogoSrc ? (
              <img
                src={activeLogoSrc}
                alt="Cybersoft logo"
                className="h-20 w-auto"
                onError={handleLogoError}
              />
            ) : (
              <div
                style={{ fontFamily: "'DM Sans', sans-serif" }}
                className="text-3xl font-bold tracking-tight text-white"
              >
                cyber<span className="text-blue-500">soft</span>
              </div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white">Çek Tarama Sistemi</h1>
          <p className="mt-2 text-sm text-slate-400">
            Çekleri hızlı ve güvenli dijitalleştirin
          </p>

          <button
            type="button"
            onClick={onStart}
            style={buttonAnimationStyle}
            className="mt-8 h-14 w-full max-w-xs rounded-2xl bg-blue-600 text-lg font-semibold text-white transition-transform hover:bg-blue-500 active:scale-95"
          >
            Başla
          </button>
        </div>

        <p className="text-center text-xs text-slate-600">© Cybersoft</p>
      </div>
    </main>
  )
}

export default Landing
