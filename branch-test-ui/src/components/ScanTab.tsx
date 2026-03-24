import { useEffect, useMemo, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import { listScanners, releaseScanner, reserveScanner, scanCheck } from '../services/branchClient'
import type { CheckMetadata, Scanner } from '../types'

type ScanTabProps = {
  activeBordroId: string | null
  onScannedCheckCountChange?: (count: number) => void
  onReservationStateChange?: (state: ScanReservationState) => void
}

export type ScanReservationState = {
  isReserved: boolean
  scannerId: string | null
  sessionId: string
}

let cachedSessionId: string | null = null

function getStableSessionId(): string {
  if (cachedSessionId === null) {
    cachedSessionId = crypto.randomUUID()
  }

  return cachedSessionId
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getScannerSelectionKey(scanner: Scanner): string {
  return [scanner.scanner_id, scanner.pc_daemon_id, scanner.scan_grpc_addr].join('|')
}

export default function ScanTab({
  activeBordroId,
  onScannedCheckCountChange,
  onReservationStateChange,
}: ScanTabProps) {
  const { addLog } = useLogContext()
  const [sessionId] = useState<string>(() => getStableSessionId())
  const [radioGroupName] = useState<string>(() => `scanner-select-${crypto.randomUUID()}`)
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [selectedScannerKey, setSelectedScannerKey] = useState<string | null>(null)
  const [isReserved, setIsReserved] = useState<boolean>(false)
  const [scannedChecks, setScannedChecks] = useState<CheckMetadata[]>([])
  const [checkNo, setCheckNo] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [hasListedScanners, setHasListedScanners] = useState<boolean>(false)
  const [isListing, setIsListing] = useState<boolean>(false)
  const [isReserving, setIsReserving] = useState<boolean>(false)
  const [isReleasing, setIsReleasing] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)

  const activeScanner = useMemo(() => {
    if (selectedScannerKey === null) {
      return null
    }

    return scanners.find((scanner) => getScannerSelectionKey(scanner) === selectedScannerKey) ?? null
  }, [scanners, selectedScannerKey])
  const activeScannerId = activeScanner?.scanner_id ?? null

  const scanDisabled = !isReserved || activeScanner === null || activeBordroId === null

  useEffect(() => {
    onScannedCheckCountChange?.(scannedChecks.length)
  }, [onScannedCheckCountChange, scannedChecks.length])

  useEffect(() => {
    onReservationStateChange?.({
      isReserved,
      scannerId: activeScannerId,
      sessionId,
    })
  }, [activeScannerId, isReserved, onReservationStateChange, sessionId])

  async function handleListScanners(): Promise<void> {
    setError(null)
    setIsListing(true)

    try {
      addLog('info', 'İstek: listScanners {}')
      const listedScanners = await listScanners()
      const sortedScanners = [...listedScanners].sort((left, right) =>
        left.scanner_id.localeCompare(right.scanner_id),
      )
      setScanners(sortedScanners)
      setSelectedScannerKey((previousSelectionKey) => {
        if (previousSelectionKey === null) {
          return null
        }

        const selectionExists = sortedScanners.some(
          (scanner) => getScannerSelectionKey(scanner) === previousSelectionKey,
        )

        return selectionExists ? previousSelectionKey : null
      })
      setHasListedScanners(true)
      addLog('info', `Yanıt: listScanners scanners=${listedScanners.length}`)
    } catch (listError) {
      const message = getErrorMessage(listError)
      setError(message)
      addLog('error', `Hata: listScanners ${message}`)
    } finally {
      setIsListing(false)
    }
  }

  async function handleReserve(): Promise<void> {
    setError(null)

    if (activeScanner === null) {
      setError('Önce bir scanner seçin.')
      return
    }

    const scannerId = activeScanner.scanner_id
    setIsReserving(true)

    try {
      addLog('info', `İstek: reserveScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await reserveScanner(scannerId, sessionId)
      setIsReserved(true)
      addLog('info', `Yanıt: reserveScanner scanner_id=${scannerId}`)
    } catch (reserveError) {
      const message = getErrorMessage(reserveError)
      setError(message)
      addLog('error', `Hata: reserveScanner ${message}`)
    } finally {
      setIsReserving(false)
    }
  }

  async function handleRelease(): Promise<void> {
    setError(null)

    if (!isReserved || activeScanner === null) {
      return
    }

    const scannerId = activeScanner.scanner_id
    setIsReleasing(true)

    try {
      addLog('info', `İstek: releaseScanner {scanner_id:${scannerId}, session_id:${sessionId}}`)
      await releaseScanner(scannerId, sessionId)
      setIsReserved(false)
      setSelectedScannerKey(null)
      setScannedChecks([])
      setCheckNo(1)
      addLog('info', `Yanıt: releaseScanner scanner_id=${scannerId}`)
    } catch (releaseError) {
      const message = getErrorMessage(releaseError)
      setError(message)
      addLog('error', `Hata: releaseScanner ${message}`)
    } finally {
      setIsReleasing(false)
    }
  }

  async function handleScan(): Promise<void> {
    setError(null)

    if (!isReserved || activeScanner === null) {
      setError('Tarama için önce scanner rezervasyonu yapın.')
      return
    }

    if (activeBordroId === null) {
      setError('Önce bordro oluşturun veya seçin.')
      return
    }

    if (!Number.isInteger(checkNo) || checkNo < 1) {
      setError('Çek numarası en az 1 olmalı.')
      return
    }

    const scannerId = activeScanner.scanner_id
    const bordroId = activeBordroId
    setIsScanning(true)

    try {
      addLog(
        'info',
        `İstek: scanCheck {scanner_id:${scannerId}, session_id:${sessionId}, bordro_id:${bordroId}, check_no:${checkNo}}`,
      )
      const metadata = await scanCheck({
        scanner_id: scannerId,
        session_id: sessionId,
        bordro_id: bordroId,
        check_no: checkNo,
      })

      setScannedChecks((prev) => [...prev, metadata])
      addLog(
        'info',
        `Yanıt: scanCheck check_no=${metadata.check_no}, object_path=${metadata.object_path || '-'}`,
      )

      const nextCheckNo =
        Number.isInteger(metadata.check_no) && metadata.check_no > 0
          ? metadata.check_no + 1
          : checkNo + 1
      setCheckNo(nextCheckNo)
    } catch (scanError) {
      const message = getErrorMessage(scanError)
      setError(message)
      addLog('error', `Hata: scanCheck ${message}`)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              1. Scanner Seçimi ve Rezervasyon
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Session ID: <span className="font-mono text-slate-700 dark:text-slate-300">{sessionId}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isReserved ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300">
                Rezerve Edildi
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void handleListScanners()
              }}
              disabled={isListing || isReserved}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isListing ? 'Yükleniyor…' : 'Tarayıcıları Listele'}
            </button>
          </div>
        </div>

        {scanners.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Seç</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Scanner ID
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Bağlı PC Adresi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Scan gRPC Adresi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {scanners.map((scanner) => {
                  const scannerSelectionKey = getScannerSelectionKey(scanner)
                  const isSelected = selectedScannerKey === scannerSelectionKey

                  return (
                    <tr
                      key={scannerSelectionKey}
                      className={isSelected ? 'bg-amber-100 dark:bg-amber-500/15' : undefined}
                    >
                      <td className="px-3 py-2 align-top">
                        <input
                          type="radio"
                          name={radioGroupName}
                          value={scanner.scanner_id}
                          checked={isSelected}
                          disabled={isReserved}
                          onChange={() => {
                            setSelectedScannerKey(scannerSelectionKey)
                          }}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                        {scanner.scanner_id}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                        {scanner.pc_daemon_addr || '-'}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                        {scanner.scan_grpc_addr || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {hasListedScanners && scanners.length === 0 && !isListing ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Kullanılabilir scanner bulunamadı.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleReserve()
            }}
            disabled={isReserved || activeScanner === null || isReserving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {isReserving ? 'Rezerve Ediliyor…' : 'Rezerve Et'}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleRelease()
            }}
            disabled={!isReserved || isReleasing}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isReleasing ? 'Bırakılıyor…' : 'Bırak'}
          </button>
        </div>
      </section>

      <section
        className={`space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800 ${
          isReserved ? 'bg-white dark:bg-slate-900/70' : 'bg-slate-50 opacity-75 dark:bg-slate-900/30'
        }`}
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">2. Çek Tarama</h2>
          {activeBordroId ? (
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Aktif Bordro ID: <span className="font-mono text-xs">{activeBordroId}</span>
            </p>
          ) : (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
              Önce bordro oluşturun veya seçin.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Check No</span>
            <input
              type="number"
              min={1}
              value={checkNo}
              disabled={!isReserved || isScanning}
              onChange={(event) => {
                const parsedValue = event.target.valueAsNumber
                const nextValue = Number.isFinite(parsedValue) ? Math.max(1, Math.trunc(parsedValue)) : 0
                setCheckNo(nextValue)
              }}
              className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              void handleScan()
            }}
            disabled={scanDisabled || isScanning}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Tara
          </button>

          {isScanning ? <span className="text-sm text-slate-600 dark:text-slate-400">Taranıyor…</span> : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Tarama Sonuçları</h3>

        {scannedChecks.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Henüz çek taranmadı.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Check No
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Object Path
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    MICR
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    QR
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Front Path
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Back Path
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {scannedChecks.map((check) => (
                  <tr key={`${check.object_path}-${check.check_no.toString()}`}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{check.check_no}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {check.object_path || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{check.micr || '-'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{check.qr || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {check.front_path || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {check.back_path || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
