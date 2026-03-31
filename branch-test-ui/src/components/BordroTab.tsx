import { FileText, Folder } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  createBordro,
  getStorageObject,
  releaseScanner,
} from '../services/branchClient'
import type {
  BordroChequeType,
  BordroCurrency,
  ChequeMetadata,
  CreateBordroRequest,
  SessionBordroEntry,
} from '../types'
import { type ScanReservationState, type ScanSettings } from './ScanTab'
import UnifiedScanTab from './UnifiedScanTab'

type BordroTabProps = {
  activeBordroId: string | null
  onActiveBordroChange: (bordroId: string | null) => void
}

type BordroFormState = {
  customerNo: string
  chequeCount: number
  chequeType: BordroChequeType
  bordroAmount: string
  accountNo: string
  customerName: string
  accountBranch: string
  currency: BordroCurrency
  showCheque: boolean
}

type SelectedPageState = {
  objectPath: string
  side: 'front' | 'back'
}

type ViewerState = {
  isLoading: boolean
  objectUrl: string | null
  objectPath: string | null
  mimeType: string | null
  byteSize: number | null
  imageWidth: number | null
  imageHeight: number | null
  renderFailed: boolean
  error: string | null
}

const CHEQUE_TYPE_OPTIONS: Array<{ value: BordroChequeType; label: string }> = [
  { value: 'BL', label: 'BL' },
  { value: 'BV', label: 'BV' },
  { value: 'NM', label: 'NM' },
  { value: 'VR', label: 'VR' },
]

const CURRENCY_OPTIONS: BordroCurrency[] = ['TRY', 'USD', 'EUR']
const INITIAL_SCAN_RESERVATION_STATE: ScanReservationState = {
  isReserved: false,
  scannerId: null,
  sessionId: '',
}
const DEFAULT_BORDRO_SCAN_SETTINGS: ScanSettings = {
  duplex: false,
  dpi: 300,
  color_mode: 'COLOR',
  page_size: 'CHEQUE',
}

const INITIAL_VIEWER_STATE: ViewerState = {
  isLoading: false,
  objectUrl: null,
  objectPath: null,
  mimeType: null,
  byteSize: null,
  imageWidth: null,
  imageHeight: null,
  renderFailed: false,
  error: null,
}

function shortenId(value: string): string {
  if (value.length <= 14) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getStorageObjectPath(path: string): string | null {
  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}

function inferMimeTypeFromPath(path: string): string {
  const normalized = path.trim().toLowerCase()
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.png')) {
    return 'image/png'
  }

  return 'application/octet-stream'
}

function resolvePreviewMimeType(contentType: string | null, path: string): string {
  const normalizedContentType = contentType?.trim() ?? ''
  if (normalizedContentType.length > 0) {
    return normalizedContentType
  }

  return inferMimeTypeFromPath(path)
}

function resolveDownloadExtension(path: string, mimeType: string | null): string {
  const normalizedPath = path.trim().toLowerCase()
  if (normalizedPath.endsWith('.png')) {
    return '.png'
  }

  if (normalizedPath.endsWith('.jpg')) {
    return '.jpg'
  }

  if (normalizedPath.endsWith('.jpeg')) {
    return '.jpeg'
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ''
  if (normalizedMimeType === 'image/png') {
    return '.png'
  }

  if (normalizedMimeType === 'image/jpeg') {
    return '.jpg'
  }

  return '.bin'
}

function formatFileSize(byteSize: number | null): string | null {
  if (byteSize === null || byteSize < 0) {
    return null
  }

  if (byteSize < 1024) {
    return `${byteSize.toString()} B`
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`
  }

  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`
}

function isRenderableImageMimeType(mimeType: string | null): boolean {
  if (mimeType === null) {
    return false
  }

  return mimeType.startsWith('image/')
}

async function readImageDimensions(blob: Blob, mimeType: string): Promise<{ width: number; height: number } | null> {
  if (!mimeType.startsWith('image/')) {
    return null
  }

  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob)
      const dimensions = {
        width: bitmap.width,
        height: bitmap.height,
      }
      bitmap.close()
      return dimensions
    } catch {
      // Fall back to Image decoding below.
    }
  }

  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

function buildChequeKey(cheque: ChequeMetadata): string {
  return `${cheque.object_path}::${cheque.cheque_no.toString()}`
}

function hasBackPage(cheque: ChequeMetadata): boolean {
  return cheque.effective_duplex || cheque.page_count > 1
}

export default function BordroTab({
  activeBordroId,
  onActiveBordroChange,
}: BordroTabProps) {
  const { addLog } = useLogContext()
  const [form, setForm] = useState<BordroFormState>({
    customerNo: '10024578',
    chequeCount: 2,
    chequeType: 'NM',
    bordroAmount: '125000.00',
    accountNo: 'TR000000000000000000000000',
    customerName: 'Debug Müşteri A.Ş.',
    accountBranch: 'Levent Şubesi',
    currency: 'TRY',
    showCheque: true,
  })
  const [bordros, setBordros] = useState<SessionBordroEntry[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false)
  const [scanBordroId, setScanBordroId] = useState<string | null>(null)
  const [modalScannedChequeCount, setModalScannedChequeCount] = useState<number>(0)
  const [modalCloseError, setModalCloseError] = useState<string | null>(null)
  const [isClosingModal, setIsClosingModal] = useState<boolean>(false)
  const [scanReservationState, setScanReservationState] = useState<ScanReservationState>(
    INITIAL_SCAN_RESERVATION_STATE,
  )
  const [scannedChequesByBordro, setScannedChequesByBordro] = useState<Record<string, ChequeMetadata[]>>({})
  const [scanSettingsByBordro, setScanSettingsByBordro] = useState<Record<string, ScanSettings>>({})
  const [selectedPage, setSelectedPage] = useState<SelectedPageState | null>(null)
  const [viewer, setViewer] = useState<ViewerState>(INITIAL_VIEWER_STATE)

  const currentScanBordroId = scanBordroId ?? activeBordroId
  const activeBordro = useMemo(
    () => bordros.find((bordro) => bordro.bordro_id === activeBordroId) ?? null,
    [activeBordroId, bordros],
  )
  const currentScanBordro = useMemo(
    () => bordros.find((bordro) => bordro.bordro_id === currentScanBordroId) ?? null,
    [bordros, currentScanBordroId],
  )
  const currentScanSettings = useMemo<ScanSettings>(() => {
    if (!currentScanBordroId) {
      return DEFAULT_BORDRO_SCAN_SETTINGS
    }

    return scanSettingsByBordro[currentScanBordroId] ?? DEFAULT_BORDRO_SCAN_SETTINGS
  }, [currentScanBordroId, scanSettingsByBordro])
  const currentScanCheques = useMemo(() => {
    if (!currentScanBordroId) {
      return []
    }

    return scannedChequesByBordro[currentScanBordroId] ?? []
  }, [currentScanBordroId, scannedChequesByBordro])
  const activeScannedCheques = useMemo(() => {
    if (!activeBordroId) {
      return []
    }

    return scannedChequesByBordro[activeBordroId] ?? []
  }, [activeBordroId, scannedChequesByBordro])

  const selectedCheque = useMemo(() => {
    if (selectedPage === null) {
      return null
    }

    return activeScannedCheques.find((cheque) => cheque.object_path === selectedPage.objectPath) ?? null
  }, [activeScannedCheques, selectedPage])

  const updateViewer = useCallback(
    (updater: ViewerState | ((previous: ViewerState) => ViewerState)) => {
      setViewer((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        if (previous.objectUrl && previous.objectUrl !== next.objectUrl) {
          URL.revokeObjectURL(previous.objectUrl)
        }
        return next
      })
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (viewer.objectUrl) {
        URL.revokeObjectURL(viewer.objectUrl)
      }
    }
  }, [viewer.objectUrl])

  useEffect(() => {
    if (selectedPage === null) {
      return
    }

    const existingCheque = activeScannedCheques.find((cheque) => cheque.object_path === selectedPage.objectPath)
    if (!existingCheque) {
      setSelectedPage(null)
      return
    }

    if (selectedPage.side === 'back' && !hasBackPage(existingCheque)) {
      setSelectedPage({
        objectPath: existingCheque.object_path,
        side: 'front',
      })
    }
  }, [activeScannedCheques, selectedPage])

  useEffect(() => {
    if (selectedPage !== null || activeScannedCheques.length === 0) {
      return
    }

    const firstCheque = [...activeScannedCheques].sort((left, right) => left.cheque_no - right.cheque_no)[0]
    setSelectedPage({
      objectPath: firstCheque.object_path,
      side: 'front',
    })
  }, [activeScannedCheques, selectedPage])

  const loadSelectedImage = useCallback(async (): Promise<void> => {
    if (!form.showCheque || selectedPage === null || selectedCheque === null) {
      updateViewer({
        ...INITIAL_VIEWER_STATE,
        objectPath: null,
      })
      return
    }

    updateViewer((previous) => ({
      ...previous,
      isLoading: true,
      error: null,
      renderFailed: false,
    }))

    try {
      const frontImagePath = getStorageObjectPath(selectedCheque.front_image_path)
      const backImagePath = getStorageObjectPath(selectedCheque.back_image_path)
      const path = selectedPage.side === 'front' ? frontImagePath : backImagePath

      if (!path) {
        if (selectedPage.side === 'back') {
          updateViewer({
            isLoading: false,
            objectUrl: null,
            objectPath: null,
            mimeType: null,
            byteSize: null,
            imageWidth: null,
            imageHeight: null,
            renderFailed: false,
            error: null,
          })
          return
        }

        throw new Error('Ön yüz için obje path bulunamadı.')
      }

      const objectBytes = await getStorageObject(path)
      if (objectBytes.length === 0) {
        throw new Error('Görüntü verisi boş döndü.')
      }

      const metadataContentType =
        selectedPage.side === 'front'
          ? selectedCheque.front_image_content_type
          : selectedCheque.back_image_content_type
      const mimeType = resolvePreviewMimeType(metadataContentType, path)
      const copied = new Uint8Array(objectBytes.byteLength)
      copied.set(objectBytes)
      const blob = new Blob([copied], { type: mimeType })
      const objectUrl = URL.createObjectURL(blob)
      const dimensions = await readImageDimensions(blob, mimeType)

      updateViewer({
        isLoading: false,
        objectUrl,
        objectPath: path,
        mimeType,
        byteSize: blob.size,
        imageWidth: dimensions?.width ?? null,
        imageHeight: dimensions?.height ?? null,
        renderFailed: false,
        error: null,
      })
    } catch (loadError) {
      const message = getErrorMessage(loadError)
      updateViewer((previous) => ({
        ...previous,
        isLoading: false,
        objectUrl: null,
        mimeType: null,
        byteSize: null,
        imageWidth: null,
        imageHeight: null,
        renderFailed: false,
        error: message,
      }))
      addLog('error', `Hata: selectedImage ${message}`)
    }
  }, [addLog, form.showCheque, selectedCheque, selectedPage, updateViewer])

  useEffect(() => {
    void loadSelectedImage()
  }, [loadSelectedImage])

  function openScanModalForBordro(bordroId: string): void {
    onActiveBordroChange(bordroId)
    setScanBordroId(bordroId)
    setModalScannedChequeCount(scannedChequesByBordro[bordroId]?.length ?? 0)
    setModalCloseError(null)
    setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
    setIsScanModalOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    if (!Number.isInteger(form.chequeCount) || form.chequeCount < 1) {
      setError('Bordro çek adedi en az 1 olmalı.')
      return
    }

    const bordroAmount = form.bordroAmount.trim()
    const accountNo = form.accountNo.trim()
    const customerName = form.customerName.trim()
    const accountBranch = form.accountBranch.trim()

    if (bordroAmount.length === 0) {
      setError('Bordro tutarı zorunlu.')
      return
    }

    if (accountNo.length === 0) {
      setError('Hesap no zorunlu.')
      return
    }

    if (customerName.length === 0) {
      setError('Müşteri adı zorunlu.')
      return
    }

    if (accountBranch.length === 0) {
      setError('Hesabın bulunduğu şube zorunlu.')
      return
    }

    const request: CreateBordroRequest = {
      cheque_count: form.chequeCount,
      cheque_type: form.chequeType,
      bordro_amount: bordroAmount,
      account_no: accountNo,
      customer_name: customerName,
      account_branch: accountBranch,
      currency: form.currency,
    }

    setIsSubmitting(true)

    try {
      addLog(
        'info',
        `İstek: createBordro {cheque_count:${request.cheque_count}, cheque_type:${request.cheque_type}, bordro_amount:${request.bordro_amount}, account_no:${request.account_no}, customer_name:${request.customer_name}, account_branch:${request.account_branch}, currency:${request.currency}}`,
      )
      const response = await createBordro(request)
      addLog('info', `Yanıt: createBordro bordro_id=${response.bordro_id}`)

      const newBordro: SessionBordroEntry = {
        bordro_id: response.bordro_id,
        cheque_count: request.cheque_count,
        cheque_type: request.cheque_type,
        bordro_amount: request.bordro_amount,
        account_no: request.account_no,
        customer_name: request.customer_name,
        account_branch: request.account_branch,
        currency: request.currency,
        created_at: new Date().toISOString(),
      }

      setBordros((previous) => [newBordro, ...previous])
      setScanSettingsByBordro((previous) => {
        if (previous[response.bordro_id]) {
          return previous
        }

        return {
          ...previous,
          [response.bordro_id]: {
            ...DEFAULT_BORDRO_SCAN_SETTINGS,
          },
        }
      })
      onActiveBordroChange(response.bordro_id)
    } catch (submitError) {
      const message = getErrorMessage(submitError)
      setError(message)
      addLog('error', `Hata: createBordro ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCloseScanModal(): Promise<void> {
    setModalCloseError(null)

    if (scanReservationState.isReserved && scanReservationState.scannerId !== null) {
      const shouldRelease = window.confirm(
        'Seçili scanner rezerve durumda. Kapatmadan önce scanner bırakılacak, onaylıyor musunuz?',
      )

      if (!shouldRelease) {
        return
      }

      setIsClosingModal(true)
      try {
        addLog(
          'info',
          `İstek: releaseScanner {scanner_id:${scanReservationState.scannerId}, session_id:${scanReservationState.sessionId}}`,
        )
        await releaseScanner(scanReservationState.scannerId, scanReservationState.sessionId)
        addLog('info', `Yanıt: releaseScanner scanner_id=${scanReservationState.scannerId}`)
      } catch (closeError) {
        const message = getErrorMessage(closeError)
        setModalCloseError(message)
        addLog('error', `Hata: releaseScanner ${message}`)
        return
      } finally {
        setIsClosingModal(false)
      }
    }

    setIsScanModalOpen(false)
    setScanBordroId(null)
    setModalScannedChequeCount(0)
    setModalCloseError(null)
    setScanReservationState(INITIAL_SCAN_RESERVATION_STATE)
  }

  const handleDeleteBordro = useCallback(() => {
    if (activeBordroId === null) {
      setError('Silmek için önce bir bordro seçin.')
      return
    }

    const shouldDelete = window.confirm('Seçili bordroyu session listesinden silmek istiyor musunuz?')
    if (!shouldDelete) {
      return
    }

    const nextBordros = bordros.filter((bordro) => bordro.bordro_id !== activeBordroId)
    const nextActiveBordroId = nextBordros[0]?.bordro_id ?? null

    setBordros(nextBordros)
    setScannedChequesByBordro((previous) => {
      const next = { ...previous }
      delete next[activeBordroId]
      return next
    })
    setScanSettingsByBordro((previous) => {
      const next = { ...previous }
      delete next[activeBordroId]
      return next
    })
    setSelectedPage(null)
    onActiveBordroChange(nextActiveBordroId)
    addLog('info', `Bordro silindi: ${activeBordroId}`)
  }, [activeBordroId, addLog, bordros, onActiveBordroChange])

  const handleMatchAction = useCallback(() => {
    if (selectedCheque === null) {
      setError('Eşleştirme için önce döküman ağacından bir sayfa seçin.')
      return
    }

    setError(null)
    addLog(
      'info',
      `Eşleştir: cheque_no=${selectedCheque.cheque_no.toString()}, micr_qr_match=${selectedCheque.micr_qr_match ? 'true' : 'false'}`,
    )
  }, [addLog, selectedCheque])

  const handleModalScannedChequesChange = useCallback(
    (cheques: ChequeMetadata[]) => {
      if (!currentScanBordroId) {
        return
      }

      setScannedChequesByBordro((previous) => {
        if (previous[currentScanBordroId] === cheques) {
          return previous
        }

        return {
          ...previous,
          [currentScanBordroId]: cheques,
        }
      })
    },
    [currentScanBordroId],
  )
  const handleScanSettingsChange = useCallback(
    (settings: ScanSettings) => {
      if (!currentScanBordroId) {
        return
      }

      setScanSettingsByBordro((previous) => {
        const existing = previous[currentScanBordroId]
        if (
          existing &&
          existing.duplex === settings.duplex &&
          existing.dpi === settings.dpi &&
          existing.color_mode === settings.color_mode
        ) {
          return previous
        }

        return {
          ...previous,
          [currentScanBordroId]: {
            ...settings,
          },
        }
      })
    },
    [currentScanBordroId],
  )

  const sortedCheques = useMemo(
    () => [...activeScannedCheques].sort((left, right) => left.cheque_no - right.cheque_no),
    [activeScannedCheques],
  )
  const activeChequeCount = activeBordro?.cheque_count ?? form.chequeCount
  const formattedChequeCount = activeChequeCount.toString().padStart(3, '0')
  const viewerInfo = [
    viewer.mimeType,
    formatFileSize(viewer.byteSize),
    viewer.imageWidth !== null && viewer.imageHeight !== null
      ? `${viewer.imageWidth.toString()} x ${viewer.imageHeight.toString()} px`
      : null,
  ].filter((value): value is string => Boolean(value))

  return (
    <div className="h-full min-h-0 space-y-4">
      <div className="grid h-full min-h-0 grid-cols-[minmax(360px,35%)_minmax(0,65%)] gap-4">
        <section className="flex min-h-0 flex-col gap-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bordro Parametreleri</h2>
              {activeBordroId ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Aktif: {shortenId(activeBordroId)}
                </span>
              ) : null}
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-center dark:border-slate-700 dark:bg-slate-950">
              <p className="text-4xl font-black tabular-nums tracking-[0.2em] text-slate-900 dark:text-slate-100">
                {formattedChequeCount}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Çek Sayısı
              </p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Müşteri No</span>
                <input
                  type="text"
                  value={form.customerNo}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, customerNo: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Müşteri Adı</span>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, customerName: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Hesabın Bulunduğu Şube</span>
                <input
                  type="text"
                  required
                  value={form.accountBranch}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, accountBranch: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Çek Tipi</span>
                <select
                  value={form.chequeType}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, chequeType: event.target.value as BordroChequeType }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CHEQUE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Hesap No</span>
                <input
                  type="text"
                  required
                  value={form.accountNo}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, accountNo: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Döviz Cinsi</span>
                <select
                  value={form.currency}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, currency: event.target.value as BordroCurrency }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Bordro Çek Adedi</span>
                <input
                  type="number"
                  min={1}
                  required
                  inputMode="numeric"
                  value={form.chequeCount}
                  onChange={(event) => {
                    const parsed = event.target.valueAsNumber
                    const nextCount = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1
                    setForm((previous) => ({ ...previous, chequeCount: nextCount }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Bordro Tutarı</span>
                <input
                  type="text"
                  required
                  value={form.bordroAmount}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, bordroAmount: event.target.value }))
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="col-span-2 space-y-1 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Aktif Bordro</span>
                <select
                  value={activeBordroId ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim()
                    onActiveBordroChange(nextValue.length > 0 ? nextValue : null)
                    setSelectedPage(null)
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Seçili Bordro Yok</option>
                  {bordros.map((bordro) => (
                    <option key={bordro.bordro_id} value={bordro.bordro_id}>
                      {shortenId(bordro.bordro_id)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="col-span-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.showCheque}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, showCheque: event.target.checked }))
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                Çeki Göster
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {isSubmitting ? 'Bordro Oluşturuluyor…' : 'Bordro Oluştur'}
              </button>
            </form>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeBordroId === null) {
                    setError('Tarama için önce aktif bordro seçin.')
                    return
                  }

                  setError(null)
                  openScanModalForBordro(activeBordroId)
                }}
                className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                TARA
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isScanModalOpen) {
                    void handleCloseScanModal()
                    return
                  }
                  setSelectedPage(null)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                KAPAT
              </button>

              <button
                type="button"
                onClick={handleDeleteBordro}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                SİL
              </button>

              <button
                type="button"
                onClick={handleMatchAction}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                EŞLEŞTİR
              </button>
            </div>
          </article>

          <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Döküman Ağacı</h3>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
              {activeBordroId === null ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Önce bir bordro seçin.
                </p>
              ) : sortedCheques.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Seçili bordro için taranmış çek bulunmuyor.
                </p>
              ) : (
                sortedCheques.map((cheque) => {
                  const documentLabel = `Döküman ${cheque.cheque_no.toString()}`
                  const pages: Array<{ side: 'front' | 'back'; label: string }> = [{ side: 'front', label: 'Sayfa 1' }]
                  if (hasBackPage(cheque)) {
                    pages.push({ side: 'back', label: 'Sayfa 2' })
                  }

                  return (
                    <div key={buildChequeKey(cheque)} className="mb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <Folder className="h-4 w-4 text-amber-500" />
                        {documentLabel}
                      </div>

                      <div className="mt-1 space-y-1 pl-6">
                        {pages.map((page) => {
                          const isSelected =
                            selectedPage?.objectPath === cheque.object_path && selectedPage.side === page.side

                          return (
                            <button
                              type="button"
                              key={`${cheque.object_path}-${page.side}`}
                              onClick={() => {
                                setSelectedPage({
                                  objectPath: cheque.object_path,
                                  side: page.side,
                                })
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                                isSelected
                                  ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-200'
                                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <FileText className="h-4 w-4" />
                              {page.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </article>
        </section>

        <section className="min-h-0 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Çek Görüntüsü</h3>

              <div className="mt-3 flex h-[calc(100%-1.75rem)] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-900">
                {selectedCheque === null || selectedPage === null ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Görüntülenecek çek seçin</p>
                ) : !form.showCheque ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Çeki Göster kapalı. Görüntü gizlendi.
                  </p>
                ) : viewer.isLoading ? (
                  <div className="h-56 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
                ) : viewer.error ? (
                  <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
                    <p>{viewer.error}</p>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSelectedImage()
                      }}
                      className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-slate-800"
                    >
                      Tekrar Dene
                    </button>
                  </div>
                ) : viewer.objectUrl && isRenderableImageMimeType(viewer.mimeType) && !viewer.renderFailed ? (
                  <img
                    src={viewer.objectUrl}
                    alt={`Cheque ${selectedCheque.cheque_no.toString()} ${selectedPage.side}`}
                    onError={() => {
                      updateViewer((previous) => ({ ...previous, renderFailed: true }))
                    }}
                    className="h-full w-full rounded-md border border-slate-300 bg-white object-contain dark:border-slate-700 dark:bg-slate-950"
                  />
                ) : viewer.objectUrl ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <p>
                      {isRenderableImageMimeType(viewer.mimeType)
                        ? 'Bu dosya tarayıcıda görselleştirilemedi.'
                        : 'Legacy .bin kayıt: önizleme devre dışı, dosyayı indirebilirsiniz.'}
                    </p>
                    <a
                      href={viewer.objectUrl}
                      download={`cheque-${selectedCheque.cheque_no.toString()}-${selectedPage.side}${resolveDownloadExtension(
                        viewer.objectPath ?? '',
                        viewer.mimeType,
                      )}`}
                      className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Dosyayı İndir
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedPage.side === 'back' ? 'Arka yüz yok.' : 'Ön yüz görüntüsü bulunamadı.'}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              {viewerInfo.length > 0 ? (
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Görsel: {viewerInfo.join(' | ')}
                </p>
              ) : null}
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                MICR KOD :{' '}
                {selectedCheque?.micr ? (
                  <span className="font-mono text-slate-900 dark:text-slate-100">{selectedCheque.micr}</span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">&nbsp;</span>
                )}
              </p>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {isScanModalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
            <div className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 md:px-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Bordro Tarama
                  </h3>
                  {currentScanBordroId ? (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Bordro ID:{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {currentScanBordroId}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Taranan Çek: <span className="font-semibold">{modalScannedChequeCount}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleCloseScanModal()
                  }}
                  disabled={isClosingModal}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isClosingModal ? 'Bırakılıyor…' : 'Kapat'}
                </button>
              </div>
              {modalCloseError ? (
                <p className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300 md:mx-6">
                  {modalCloseError}
                </p>
              ) : null}

              <div className="overflow-y-auto p-4 md:p-6">
                <UnifiedScanTab
                  activeBordroId={currentScanBordroId}
                  expectedChequeCount={currentScanBordro?.cheque_count ?? null}
                  initialScannedCheques={currentScanCheques}
                  initialScanSettings={currentScanSettings}
                  onScannedChequeCountChange={setModalScannedChequeCount}
                  onScannedChequesChange={handleModalScannedChequesChange}
                  onScanSettingsChange={handleScanSettingsChange}
                  onReservationStateChange={setScanReservationState}
                  defaultMode="CHEQUE"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
