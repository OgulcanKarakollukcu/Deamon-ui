import { useEffect } from 'react'
import { QrScannerDemo } from './pages/QrScannerDemo'
import { runZxingSmokeTest } from './utils/zxingTest'

function App() {
  useEffect(() => {
    void runZxingSmokeTest().catch((error: unknown) => {
      if (error instanceof Error) {
        console.error('zxing smoke test failed:', error.message)
        return
      }

      console.error('zxing smoke test failed with unknown error')
    })
  }, [])

  if (window.location.pathname === '/qr-demo') {
    return <QrScannerDemo />
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl items-center px-4 py-10 sm:px-8">
        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">
            Daemon UI
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-4xl">
            Yeni React Projesi Hazır
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
            Bu uygulama Vite + React + TypeScript ve Tailwind ile kuruldu.
            Düzen mobil ekranlara uyumludur ve mevcut projelere dokunmadan
            ayrı klasörde başlatıldı.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Stack
              </p>
              <p className="mt-1 font-semibold">React + TS</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Styling
              </p>
              <p className="mt-1 font-semibold">Tailwind CSS</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Uyum
              </p>
              <p className="mt-1 font-semibold">Mobil Öncelikli</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
