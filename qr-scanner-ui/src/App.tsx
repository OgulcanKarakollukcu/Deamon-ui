import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BireyselKredi } from './pages/BireyselKredi'
import { Home } from './pages/Home'
import { KurumsalKredi } from './pages/KurumsalKredi'
import { runZxingSmokeTest } from './utils/zxingTest'

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
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/bireysel-kredi" element={<BireyselKredi />} />
      <Route path="/kurumsal-kredi" element={<KurumsalKredi />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default App
