import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import { runZxingSmokeTest } from './utils/zxingTest'

function App() {
  const [showLanding, setShowLanding] = useState(true)

  useEffect(() => {
    void runZxingSmokeTest().catch((error: unknown) => {
      if (error instanceof Error) {
        console.error('zxing smoke test failed:', error.message)
        return
      }

      console.error('zxing smoke test failed with unknown error')
    })
  }, [])

  if (showLanding) {
    return <Landing onStart={() => setShowLanding(false)} />
  }

  return <Home onSessionReset={() => setShowLanding(true)} />
}

export default App
