import { useEffect, useMemo, useState } from 'react'
import { Upload, Search, Clock3, Binary, ScanLine, Sparkles } from 'lucide-react'
import {
  analyzeChequeImage,
  analyzeUploadedChequeWithDotsMocr,
  analyzeUploadedChequeWithQwen,
  listChequeAnalysisModels,
} from '../services'
import { useLogContext } from '../context/LogContext'
import type {
  ChequeAnalysisModels,
  ChequeImageDebugResult,
  DotsMocrChequeAnalysisResult,
  QwenChequeAnalysisResult,
} from '../types'
import { normalizeMicrValue, parseMicrFieldsWithQrHint, parseQrFields } from '../utils/chequeFields'
import type { DotsMocrBoundingBox } from '../utils/dotsMocrFields'
import { parseDotsMocrDisplayFields } from '../utils/dotsMocrFields'

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value.toString()} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

type HoveredAnalysisField = {
  label: string
  value: string
  bbox: DotsMocrBoundingBox
  tone: 'amber' | 'emerald'
}

type AiAnalysisTab = 'dots' | 'qwen'

function toPercent(value: number): string {
  return `${Math.min(100, Math.max(0, (value / 1000) * 100)).toFixed(2)}%`
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} sn`
  }

  return `${value.toString()} ms`
}

export default function ChequeDebugTab() {
  const { addLog } = useLogContext()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dpi, setDpi] = useState<string>('300')
  const [analysisModels, setAnalysisModels] = useState<ChequeAnalysisModels | null>(null)
  const [dotsMocrModelOverride, setDotsMocrModelOverride] = useState<string>('')
  const [qwenModelOverride, setQwenModelOverride] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAnalyzingDotsMocr, setIsAnalyzingDotsMocr] = useState(false)
  const [isAnalyzingQwen, setIsAnalyzingQwen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dotsMocrErrorMessage, setDotsMocrErrorMessage] = useState<string | null>(null)
  const [qwenErrorMessage, setQwenErrorMessage] = useState<string | null>(null)
  const [modelLoadErrorMessage, setModelLoadErrorMessage] = useState<string | null>(null)
  const [result, setResult] = useState<ChequeImageDebugResult | null>(null)
  const [dotsMocrResult, setDotsMocrResult] = useState<DotsMocrChequeAnalysisResult | null>(null)
  const [qwenResult, setQwenResult] = useState<QwenChequeAnalysisResult | null>(null)
  const [hoveredAnalysisField, setHoveredAnalysisField] = useState<HoveredAnalysisField | null>(null)
  const [activeAiTab, setActiveAiTab] = useState<AiAnalysisTab>('dots')

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

  useEffect(() => {
    let isCancelled = false

    async function loadAnalysisModels(): Promise<void> {
      try {
        const nextModels = await listChequeAnalysisModels()
        if (isCancelled) {
          return
        }

        setAnalysisModels(nextModels)
        setModelLoadErrorMessage(null)
        setDotsMocrModelOverride((previous) =>
          previous.trim().length > 0
            ? previous
            : nextModels.default_dots_mocr_model ||
              nextModels.dots_mocr_models[0] ||
              '',
        )
        setQwenModelOverride((previous) =>
          previous.trim().length > 0
            ? previous
            : nextModels.default_qwen_model ||
              nextModels.qwen_models[0] ||
              '',
        )
      } catch (error) {
        if (isCancelled) {
          return
        }

        const message = error instanceof Error ? error.message : String(error)
        setModelLoadErrorMessage(message)
      }
    }

    void loadAnalysisModels()

    return () => {
      isCancelled = true
    }
  }, [])

  const resolvedDpi = useMemo(() => {
    const parsed = Number.parseInt(dpi, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300
  }, [dpi])
  const selectedFileMimeType = useMemo(() => {
    if (selectedFile === null) {
      return ''
    }

    const explicitMimeType = selectedFile.type.trim().toLowerCase()
    if (explicitMimeType.startsWith('image/')) {
      return explicitMimeType
    }

    const normalizedName = selectedFile.name.trim().toLowerCase()
    if (normalizedName.endsWith('.png')) {
      return 'image/png'
    }

    if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
      return 'image/jpeg'
    }

    return ''
  }, [selectedFile])
  const parsedMicrFields =
    result ? parseMicrFieldsWithQrHint(result.micr_data, result.qr_data) : null
  const normalizedMicr =
    parsedMicrFields !== null
      ? normalizeMicrValue(
          `${parsedMicrFields.chequeSerialNo}${parsedMicrFields.bankCode}${parsedMicrFields.branchCode}${parsedMicrFields.accountNumber}`,
        )
      : result
        ? normalizeMicrValue(result.micr_data)
        : ''
  const parsedQrFields = result ? parseQrFields(result.qr_data) : null
  const dotsMocrDisplayFields = useMemo(
    () =>
      dotsMocrResult
        ? parseDotsMocrDisplayFields(dotsMocrResult.content, dotsMocrResult.raw_response_json)
        : null,
    [dotsMocrResult],
  )
  const qwenDisplayFields = useMemo(
    () => (qwenResult ? parseDotsMocrDisplayFields(qwenResult.content, qwenResult.raw_response_json) : null),
    [qwenResult],
  )
  const activeAiResult = activeAiTab === 'dots' ? dotsMocrResult : qwenResult
  const activeAiDisplayFields = activeAiTab === 'dots' ? dotsMocrDisplayFields : qwenDisplayFields
  const activeAiErrorMessage = activeAiTab === 'dots' ? dotsMocrErrorMessage : qwenErrorMessage

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

  async function handleAnalyzeDotsMocr(): Promise<void> {
    if (selectedFile === null) {
      setDotsMocrErrorMessage('Lutfen once bir image sec.')
      return
    }

    setIsAnalyzingDotsMocr(true)
    setDotsMocrErrorMessage(null)
    setDotsMocrResult(null)
    setActiveAiTab('dots')

    try {
      const image = new Uint8Array(await selectedFile.arrayBuffer())
      addLog(
        'info',
        `Cheque debug dots.mocr basladi: ${selectedFile.name}, bytes=${image.length.toString()}, mime=${selectedFileMimeType || '-'}, model=${dotsMocrModelOverride.trim() || '<env/default>'}`,
      )
      const nextResult = await analyzeUploadedChequeWithDotsMocr({
        image,
        image_mime_type: selectedFileMimeType || undefined,
        model_override: dotsMocrModelOverride.trim() || undefined,
      })
      setDotsMocrResult(nextResult)
      addLog(
        'info',
        `Cheque debug dots.mocr tamamlandi: model=${nextResult.model || '-'}, prompt=${nextResult.prompt_mode || '-'}, total_ms=${nextResult.total_ms.toString()}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDotsMocrErrorMessage(message)
      addLog('error', `Cheque debug dots.mocr hatasi: ${message}`)
    } finally {
      setIsAnalyzingDotsMocr(false)
    }
  }

  async function handleAnalyzeQwen(): Promise<void> {
    if (selectedFile === null) {
      setQwenErrorMessage('Lutfen once bir image sec.')
      return
    }

    setIsAnalyzingQwen(true)
    setQwenErrorMessage(null)
    setQwenResult(null)
    setActiveAiTab('qwen')

    try {
      const image = new Uint8Array(await selectedFile.arrayBuffer())
      addLog(
        'info',
        `Cheque debug qwen basladi: ${selectedFile.name}, bytes=${image.length.toString()}, mime=${selectedFileMimeType || '-'}, model=${qwenModelOverride.trim() || '<env/default>'}`,
      )
      const nextResult = await analyzeUploadedChequeWithQwen({
        image,
        image_mime_type: selectedFileMimeType || undefined,
        model_override: qwenModelOverride.trim() || undefined,
      })
      setQwenResult(nextResult)
      addLog(
        'info',
        `Cheque debug qwen tamamlandi: model=${nextResult.model || '-'}, prompt=${nextResult.prompt_mode || '-'}, total_ms=${nextResult.total_ms.toString()}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQwenErrorMessage(message)
      addLog('error', `Cheque debug qwen hatasi: ${message}`)
    } finally {
      setIsAnalyzingQwen(false)
    }
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-neutral-900 dark:bg-neutral-950/40">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-white via-emerald-50/70 to-amber-50/70 px-5 py-4 dark:border-neutral-900 dark:from-neutral-950 dark:via-emerald-500/5 dark:to-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-2.5 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-neutral-300">
                <Sparkles className="h-3.5 w-3.5" />
                Advanced Debug
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-neutral-100">Cheque Debug</h3>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                Tek bir image yukle; ayni dosya icin MICR/QR, dots.mocr ve Qwen analizlerini daha duzenli sekilde incele.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Dosya</div>
              <div className="mt-1 max-w-[220px] truncate font-medium text-slate-900 dark:text-neutral-100">{selectedFile?.name ?? 'Henuz secilmedi'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Boyut</div>
              <div className="mt-1 font-medium text-slate-900 dark:text-neutral-100">{selectedFile ? formatBytes(selectedFile.size) : '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Aktif Tab</div>
              <div className="mt-1 font-medium text-slate-900 dark:text-neutral-100">{activeAiTab === 'dots' ? 'dots.mocr' : 'Qwen'}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.35fr)_110px_220px_minmax(0,1fr)] xl:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">Image dosyasi</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/bmp,image/tiff,image/tif"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setSelectedFile(file)
                  setResult(null)
                  setDotsMocrResult(null)
                  setQwenResult(null)
                  setActiveAiTab('dots')
                  setHoveredAnalysisField(null)
                  setErrorMessage(null)
                  setDotsMocrErrorMessage(null)
                  setQwenErrorMessage(null)
                }}
                className="block w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:file:bg-neutral-100 dark:file:text-neutral-900"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">DPI</span>
              <input
                type="number"
                min={1}
                step={1}
                value={dpi}
                onChange={(event) => {
                  setDpi(event.target.value)
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">Qwen model</span>
              <select
                value={qwenModelOverride}
                onChange={(event) => {
                  setQwenModelOverride(event.target.value)
                }}
                disabled={(analysisModels?.qwen_models.length ?? 0) === 0}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
              >
                {(analysisModels?.qwen_models ?? []).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            {selectedFile ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-neutral-900 dark:bg-neutral-950/40 dark:text-neutral-300">
                <div className="font-medium text-slate-900 dark:text-neutral-100">{selectedFile.name}</div>
                <div className="mt-1">{formatBytes(selectedFile.size)}</div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 dark:border-neutral-900 dark:bg-neutral-950/40 dark:text-neutral-500">
                Dosya secildiginde boyut bilgisi burada gorunecek.
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => {
                void handleAnalyze()
              }}
              disabled={selectedFile === null || isAnalyzing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Search className={`h-4 w-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              {isAnalyzing ? 'Analiz Calisiyor...' : 'MICR ve QR Oku'}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleAnalyzeDotsMocr()
              }}
              disabled={selectedFile === null || isAnalyzingDotsMocr}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            >
              <ScanLine className={`h-4 w-4 ${isAnalyzingDotsMocr ? 'animate-pulse' : ''}`} />
              {isAnalyzingDotsMocr ? 'dots.mocr Calisiyor...' : 'dots.mocr Analiz'}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleAnalyzeQwen()
              }}
              disabled={selectedFile === null || isAnalyzingQwen}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              <ScanLine className={`h-4 w-4 ${isAnalyzingQwen ? 'animate-pulse' : ''}`} />
              {isAnalyzingQwen ? 'Qwen Calisiyor...' : 'Qwen Analiz'}
            </button>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
              {errorMessage}
            </div>
          ) : null}

          {dotsMocrErrorMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              dots.mocr: {dotsMocrErrorMessage}
            </div>
          ) : null}

          {qwenErrorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
              qwen: {qwenErrorMessage}
            </div>
          ) : null}

          {modelLoadErrorMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              Model listesi yuklenemedi: {modelLoadErrorMessage}
            </div>
          ) : null}

          <p className="text-xs text-slate-500 dark:text-neutral-400">
            Not: dots.mocr sabit/varsayilan model akisi ile calisir. Qwen dropdown'u sadece image destekli ve OpenAI-compatible `chat/completions` ile calisan modelleri gosterir; istersen `QWEN_VISION_MODELS` ile daha da daraltabilirsin.
          </p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            dots.mocr ve Qwen upload akisleri su an PNG/JPEG dosyalari destekler. Diger formatlarda backend acik bir hata dondurur.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.9fr)] xl:items-start">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-900 dark:bg-neutral-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Cek Preview</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                Aktif AI tabindaki alanlar hover ile cek uzerinde vurgulanir.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                DPI {resolvedDpi.toString()}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                {selectedFileMimeType || 'image/*'}
              </span>
            </div>
          </div>
          <div className="mt-4 flex min-h-[440px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-gradient-to-br from-white via-slate-50 to-amber-50/60 p-4 xl:min-h-[72vh] dark:border-neutral-800 dark:bg-gradient-to-br dark:from-neutral-950 dark:via-neutral-950 dark:to-emerald-500/5">
            {previewUrl ? (
              <div className="relative inline-block">
                <img
                  src={previewUrl}
                  alt={selectedFile?.name ?? 'Cheque preview'}
                  className="max-h-[66vh] max-w-full rounded-[22px] object-contain shadow-[0_20px_60px_rgba(15,23,42,0.18)] xl:max-h-[68vh]"
                />
                {hoveredAnalysisField ? (
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      className={`absolute rounded-lg border-2 shadow-[0_0_0_9999px_rgba(15,23,42,0.14)] ${
                        hoveredAnalysisField.tone === 'amber'
                          ? 'border-amber-400 bg-amber-400/10'
                          : 'border-emerald-400 bg-emerald-400/10'
                      }`}
                      style={{
                        left: toPercent(hoveredAnalysisField.bbox.x1),
                        top: toPercent(hoveredAnalysisField.bbox.y1),
                        width: toPercent(
                          Math.max(0, hoveredAnalysisField.bbox.x2 - hoveredAnalysisField.bbox.x1),
                        ),
                        height: toPercent(
                          Math.max(0, hoveredAnalysisField.bbox.y2 - hoveredAnalysisField.bbox.y1),
                        ),
                      }}
                    >
                      <div
                        className={`absolute left-0 top-0 -translate-y-[calc(100%+8px)] rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-lg ${
                          hoveredAnalysisField.tone === 'amber' ? 'bg-amber-600' : 'bg-emerald-600'
                        }`}
                      >
                        {hoveredAnalysisField.label}: {hoveredAnalysisField.value}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-neutral-400">Henuz image secilmedi.</p>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 xl:max-h-[84vh] xl:overflow-y-auto dark:border-neutral-900 dark:bg-neutral-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Analiz Sonucu</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                Temel OCR sonucunu ustte, AI parser sonucunu sekmelerde inceleyebilirsin.
              </p>
            </div>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-neutral-800 dark:bg-neutral-950">
              <button
                type="button"
                onClick={() => {
                  setActiveAiTab('dots')
                  setHoveredAnalysisField(null)
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  activeAiTab === 'dots'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                <ScanLine className="h-4 w-4" />
                dots.mocr
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAiTab('qwen')
                  setHoveredAnalysisField(null)
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  activeAiTab === 'qwen'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Qwen
              </button>
            </div>
          </div>
          {result || dotsMocrResult || qwenResult ? (
            <div className="mt-4 grid gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-900 dark:bg-neutral-950/40">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">MICR</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-neutral-100">{normalizedMicr || '-'}</div>
                <dl className="mt-3 space-y-1 text-sm text-slate-700 dark:text-neutral-200">
                  <div className="flex items-start justify-between gap-3">
                    <dt>Çek Seri No</dt>
                    <dd className="font-mono">{parsedMicrFields?.chequeSerialNo ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Banka Kodu</dt>
                    <dd className="font-mono">{parsedMicrFields?.bankCode ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Şube Kodu</dt>
                    <dd className="font-mono">{parsedMicrFields?.branchCode ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Hesap No</dt>
                    <dd className="break-all font-mono">{parsedMicrFields?.accountNumber ?? '-'}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-900 dark:bg-neutral-950/40">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">QR</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-neutral-100">{result?.qr_data || '-'}</div>
                <dl className="mt-3 space-y-1 text-sm text-slate-700 dark:text-neutral-200">
                  <div className="flex items-start justify-between gap-3">
                    <dt>Çek Seri No</dt>
                    <dd className="font-mono">{parsedQrFields?.chequeSerialNo ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Banka Kodu</dt>
                    <dd className="font-mono">{parsedQrFields?.bankCode ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Şube Kodu</dt>
                    <dd className="font-mono">{parsedQrFields?.branchCode ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Hesap No</dt>
                    <dd className="break-all font-mono">{parsedQrFields?.accountNumber ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>TCKN/VKN</dt>
                    <dd className="font-mono">{parsedQrFields?.identityNumber ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt>Mersis No</dt>
                    <dd className="break-all font-mono">{parsedQrFields?.mersisNumber ?? '-'}</dd>
                  </div>
                </dl>
              </div>

              <div
                className={`rounded-[24px] border p-4 ${
                  activeAiTab === 'dots'
                    ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10'
                    : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        activeAiTab === 'dots'
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {activeAiTab === 'dots' ? 'dots.mocr' : 'Qwen'}
                    </div>
                    <h4 className="mt-2 text-base font-semibold text-slate-900 dark:text-neutral-100">
                      {activeAiTab === 'dots' ? 'Structured cheque parse' : 'Vision LLM parse'}
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border bg-white px-2.5 py-1 text-[11px] ${
                        activeAiTab === 'dots'
                          ? 'border-amber-200 text-amber-700 dark:border-amber-500/30 dark:bg-neutral-950/70 dark:text-amber-300'
                          : 'border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:bg-neutral-950/70 dark:text-emerald-300'
                      }`}
                    >
                      {activeAiResult?.model || '-'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-neutral-300">
                      {formatDuration(activeAiResult?.total_ms)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Prompt</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-neutral-100">
                      {activeAiResult?.prompt_mode || '-'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Alan sayisi</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-neutral-100">
                      {activeAiDisplayFields?.length ?? 0}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">Durum</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-neutral-100">
                      {activeAiResult ? 'Hazir' : activeAiErrorMessage ? 'Hatali' : 'Bekliyor'}
                    </div>
                  </div>
                </div>

                {activeAiErrorMessage ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                    {activeAiTab === 'dots' ? 'dots.mocr' : 'qwen'}: {activeAiErrorMessage}
                  </div>
                ) : null}

                {activeAiResult ? (
                  activeAiDisplayFields ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {activeAiDisplayFields.map((field) => (
                        <div
                          key={field.keyPath || field.label}
                          className={`rounded-2xl border bg-white p-3 transition dark:bg-neutral-950/60 ${
                            activeAiTab === 'dots'
                              ? 'border-amber-200 hover:border-amber-300 dark:border-amber-500/30'
                              : 'border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/30'
                          }`}
                          onMouseEnter={() => {
                            if (field.bbox) {
                              setHoveredAnalysisField({
                                label: field.label,
                                value: field.value,
                                bbox: field.bbox,
                                tone: activeAiTab === 'dots' ? 'amber' : 'emerald',
                              })
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredAnalysisField((current) =>
                              current?.label === field.label &&
                              current.tone === (activeAiTab === 'dots' ? 'amber' : 'emerald')
                                ? null
                                : current,
                            )
                          }}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
                            {field.label}
                          </p>
                          <p className="mt-1 break-all font-mono text-[12px] text-slate-700 dark:text-neutral-300">
                            {field.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      Sonuc geldi ama JSON parse edilemedi. Ham yaniti asagidaki bloktan acabilirsin.
                    </p>
                  )
                ) : (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
                    {activeAiTab === 'dots'
                      ? 'dots.mocr analizi henuz calistirilmadi.'
                      : 'Qwen analizi henuz calistirilmadi.'}
                  </p>
                )}

                {activeAiResult ? (
                  <details
                    className={`mt-4 rounded-2xl border bg-white px-3 py-2 dark:bg-neutral-950/70 ${
                      activeAiTab === 'dots'
                        ? 'border-amber-200 dark:border-amber-500/30'
                        : 'border-emerald-200 dark:border-emerald-500/30'
                    }`}
                  >
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-neutral-300">
                      Ham JSON
                    </summary>
                    <pre
                      className={`mt-2 max-h-56 overflow-auto rounded-xl border bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-neutral-950 dark:text-neutral-300 ${
                        activeAiTab === 'dots'
                          ? 'border-amber-200 dark:border-amber-500/30'
                          : 'border-emerald-200 dark:border-emerald-500/30'
                      }`}
                    >
                      {activeAiResult.raw_response_json || activeAiResult.content || '-'}
                    </pre>
                  </details>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-900 dark:bg-neutral-950/40">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  <Clock3 className="h-4 w-4" />
                  Sureler
                </div>
                <dl className="mt-3 space-y-2 text-sm text-slate-700 dark:text-neutral-200">
                  <div className="flex items-center justify-between gap-3">
                    <dt>MICR</dt>
                    <dd>{formatDuration(result?.micr_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>QR</dt>
                    <dd>{formatDuration(result?.qr_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>dots.mocr</dt>
                    <dd>{formatDuration(dotsMocrResult?.total_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Qwen</dt>
                    <dd>{formatDuration(qwenResult?.total_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-semibold text-slate-900 dark:text-neutral-100">
                    <dt>Toplam</dt>
                    <dd>{formatDuration(result?.total_ms)}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-900 dark:bg-neutral-950/40">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  <Binary className="h-4 w-4" />
                  Meta
                </div>
                <dl className="mt-3 space-y-2 text-sm text-slate-700 dark:text-neutral-200">
                  <div className="flex items-center justify-between gap-3">
                    <dt>DPI</dt>
                    <dd>{result ? result.effective_dpi.toString() : '-'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Boyut</dt>
                    <dd>{selectedFile ? formatBytes(selectedFile.size) : result ? formatBytes(result.image_size_bytes) : '-'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Eslesme</dt>
                    <dd>{result ? (result.micr_qr_match ? 'true' : 'false') : '-'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
              Bir image secip analizi baslatinca MICR, QR ve sure metrikleri burada gorunecek.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
