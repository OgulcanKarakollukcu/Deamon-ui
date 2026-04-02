import { useCallback } from 'react'
import { QrScanner } from '../components/QrScanner'

export function QrScannerDemo() {
  const handleResult = useCallback((): void => {
    // QrScanner sonucu kendi içinde gösteriyor, demo sayfasında ek state gerekmiyor.
  }, [])

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col items-center justify-center gap-5">
        <h1 className="text-center text-lg font-semibold tracking-wide text-slate-100 sm:text-xl">
          QR / DataMatrix Okuyucu
        </h1>
        <QrScanner onResult={handleResult} />
      </div>
    </main>
  )
}

export default QrScannerDemo
