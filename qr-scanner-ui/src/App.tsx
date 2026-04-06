import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CaptureCompleted } from './pages/CaptureCompleted'
import { CaptureSession } from './pages/CaptureSession'
import { closePageSafely } from './utils/closePage'
import { runZxingSmokeTest } from './utils/zxingTest'

function AccessClosedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] px-4 text-[#4B4F54]">
      <div className="w-full max-w-md rounded-2xl border border-[#DDEFE3] bg-white p-6 text-center shadow-[0_6px_20px_rgba(0,122,61,0.08)]">
        <img
          src="/sekerbank_mini.svg"
          alt="Şekerbank"
          className="mx-auto h-8 w-auto"
        />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">İşleminiz için teşekkür ederiz</h1>
        <p className="mt-2 text-sm text-[#5B6168]">
          Bu bağlantı artık aktif değil veya doğrudan açılmaya çalışıldı.
        </p>
        <p className="mt-1 text-sm text-[#5B6168]">Bu sayfayı kapatabilirsiniz.</p>
        <button
          type="button"
          onClick={closePageSafely}
          className="mt-5 h-11 w-full rounded-xl bg-[#007A3D] text-sm font-semibold text-white transition-colors hover:bg-[#018342]"
        >
          Sayfayı Kapat
        </button>
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
      <Route path="/capture/:inviteToken/completed" element={<CaptureCompleted />} />
      <Route path="/capture/:inviteToken" element={<CaptureSession />} />
      <Route path="*" element={<AccessClosedPage />} />
    </Routes>
  )
}

export default App
