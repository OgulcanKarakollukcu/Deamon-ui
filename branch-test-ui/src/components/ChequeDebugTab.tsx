import { useEffect, useMemo, useState } from 'react'
import { Upload, Search, Clock3, Binary } from 'lucide-react'
import { analyzeChequeImage } from '../services'
import { useLogContext } from '../context/LogContext'
import type { ChequeImageDebugResult } from '../types'

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value.toString()} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

export default function ChequeDebugTab() {
  const { addLog } = useLogContext()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dpi, setDpi] = useState<string>('300')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [result, setResult] = useState<ChequeImageDebugResult | null>(null)

  useEffect(() => {
    if (selectedFile === null) {
      setPreviewUrl(null)
      return
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(nextPreviewUrl)

    return () => {
      URL.revokeObjectURL(nextPreviewUrl)
    }
  }, [selectedFile])

  const resolvedDpi = useMemo(() => {
    const parsed = Number.parseInt(dpi, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300
  }, [dpi])

  async function handleAnalyze(): Promise<void> {
    if (selectedFile === null) {
      setErrorMessage('Lutfen once bir image sec.')
      return
    }

    setIsAnalyzing(true)
    setErrorMessage(null)
    setResult(null)

    try {
      const image = new Uint8Array(await selectedFile.arrayBuffer())
      addLog('info', `Cheque debug analyze basladi: ${selectedFile.name}, bytes=${image.length.toString()}, dpi=${resolvedDpi.toString()}`)
      const nextResult = await analyzeChequeImage({
        image,
        dpi: resolvedDpi,
      })
      setResult(nextResult)
      addLog(
        'info',
        `Cheque debug analyze tamamlandi: qr=${nextResult.qr_data || '-'}, micr=${nextResult.micr_data || '-'}, total_ms=${nextResult.total_ms.toString()}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      addLog('error', `Cheque debug analyze hatasi: ${message}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-900 p-2 text-white dark:bg-slate-100 dark:text-slate-900">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cheque Debug</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Tek bir image yukle, branch tarafinda full-image MICR ve QR analizi calissin.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Image dosyasi</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/bmp,image/tiff,image/tif"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                setSelectedFile(file)
                setResult(null)
                setErrorMessage(null)
              }}
              className="block w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-slate-100 dark:file:text-slate-900"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">DPI</span>
            <input
              type="number"
              min={1}
              step={1}
              value={dpi}
              onChange={(event) => {
                setDpi(event.target.value)
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          {selectedFile ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <div className="font-medium text-slate-900 dark:text-slate-100">{selectedFile.name}</div>
              <div className="mt-1">{formatBytes(selectedFile.size)}</div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void handleAnalyze()
            }}
            disabled={selectedFile === null || isAnalyzing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            <Search className={`h-4 w-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
            {isAnalyzing ? 'Analiz Calisiyor...' : 'MICR ve QR Oku'}
          </button>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Preview</h3>
          <div className="mt-4 flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={selectedFile?.name ?? 'Cheque preview'}
                className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-lg"
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Henuz image secilmedi.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Analiz Sonucu</h3>
          {result ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">MICR</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{result.micr_data || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">QR</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{result.qr_data || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  Sureler
                </div>
                <dl className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <dt>MICR</dt>
                    <dd>{result.micr_ms.toString()} ms</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>QR</dt>
                    <dd>{result.qr_ms.toString()} ms</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-semibold text-slate-900 dark:text-slate-100">
                    <dt>Toplam</dt>
                    <dd>{result.total_ms.toString()} ms</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Binary className="h-4 w-4" />
                  Meta
                </div>
                <dl className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <dt>DPI</dt>
                    <dd>{result.effective_dpi.toString()}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Boyut</dt>
                    <dd>{formatBytes(result.image_size_bytes)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Eslesme</dt>
                    <dd>{result.micr_qr_match ? 'true' : 'false'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Bir image secip analizi baslatinca MICR, QR ve sure metrikleri burada gorunecek.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
