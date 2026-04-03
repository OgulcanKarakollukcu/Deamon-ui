import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CaptureSession } from './pages/CaptureSession'
import { runZxingSmokeTest } from './utils/zxingTest'

function AccessClosedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] px-4 text-[#4B4F54]">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-[0_6px_20px_rgba(0,122,61,0.08)]">
        <h1 className="text-base font-semibold text-rose-700">Erisim Kisiti</h1>
        <p className="mt-2 text-sm text-rose-700/90">
          Bu ekran sadece size mail ile gelen tek kullanimlik baglanti uzerinden acilabilir.
        </p>
      </div>
    </main>
  )
}

function App() {
  const { pathname } = useLocation()

  useEffect(() => {
    void runZxingSmokeTest().catch((error: unknown) => {
      if (error instanceof Error) {
        console.error('zxing smoke test failed:', error.message)
        return
      }

      console.error('zxing smoke test failed with unknown error')
    })
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <Routes>
      <Route path="/capture/:inviteToken" element={<CaptureSession />} />
      <Route path="*" element={<AccessClosedPage />} />
    </Routes>
  )
}

export default App
