import { useCallback, useEffect, useState } from 'react'
import { useLogContext } from '../context/LogContext'
import {
  cleanupReservations,
  getBranchDaemonBaseUrl,
  getSupportSnapshot,
  listScanners,
  resetScanner,
} from '../services/branchClient'
import type {
  BranchDaemon,
  PcDaemon,
  ReservationInfo,
  Scanner,
  SupportSnapshot,
} from '../types'

const UNKNOWN_HEARTBEAT = '-'
const BRANCH_DAEMON_ID_FALLBACK = 'branch-daemon'

function normalizeStatus(scanner: Scanner): PcDaemon['status'] {
  if (scanner.pc_daemon_status === 'available') {
    return 'available'
  }
  if (scanner.pc_daemon_status === 'reserved') {
    return 'reserved'
  }
  return 'unavailable'
}

function normalizeHeartbeat(scanner: Scanner): string {
  const heartbeat = scanner.last_heartbeat
  if (!heartbeat) {
    return UNKNOWN_HEARTBEAT
  }

  const trimmed = heartbeat.trim()
  return trimmed.length > 0 ? trimmed : UNKNOWN_HEARTBEAT
}

function shortenId(value: string): string {
  if (value.length <= 14) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('tr-TR')
}

function formatUnixTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }

  return new Date(value * 1000).toLocaleString('tr-TR')
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }

  if (value >= 3600 && value % 3600 === 0) {
    return `${(value / 3600).toString()} sa`
  }

  if (value >= 60 && value % 60 === 0) {
    return `${(value / 60).toString()} dk`
  }

  return `${value.toString()} sn`
}

function normalizeBranchDaemonId(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl)
    return parsed.host || BRANCH_DAEMON_ID_FALLBACK
  } catch {
    const trimmed = baseUrl.trim()
    return trimmed.length > 0 ? trimmed : BRANCH_DAEMON_ID_FALLBACK
  }
}

function mapScannersToPcDaemons(scanners: Scanner[]): PcDaemon[] {
  const grouped = new Map<string, PcDaemon>()

  for (const scanner of scanners) {
    const status = normalizeStatus(scanner)
    const heartbeat = normalizeHeartbeat(scanner)
    const existingPc = grouped.get(scanner.pc_daemon_id)

    if (!existingPc) {
      grouped.set(scanner.pc_daemon_id, {
        pc_daemon_id: scanner.pc_daemon_id,
        pc_daemon_addr: scanner.pc_daemon_addr,
        scan_grpc_addr: scanner.scan_grpc_addr,
        scanner_ids: [scanner.scanner_id],
        status,
        last_heartbeat: heartbeat,
      })
      continue
    }

    if (!existingPc.scanner_ids.includes(scanner.scanner_id)) {
      existingPc.scanner_ids.push(scanner.scanner_id)
    }

    if (status === 'reserved') {
      existingPc.status = 'reserved'
    } else if (status === 'available' && existingPc.status !== 'reserved') {
      existingPc.status = 'available'
    }

    if (existingPc.last_heartbeat === UNKNOWN_HEARTBEAT && heartbeat !== UNKNOWN_HEARTBEAT) {
      existingPc.last_heartbeat = heartbeat
    }
  }

  return Array.from(grouped.values())
    .map((pc) => ({
      ...pc,
      scanner_ids: [...pc.scanner_ids].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.pc_daemon_id.localeCompare(right.pc_daemon_id))
}

function mapScannersToBranchDaemons(scanners: Scanner[]): BranchDaemon[] {
  const baseUrl = getBranchDaemonBaseUrl()
  const uniquePcIds = new Set<string>()

  for (const scanner of scanners) {
    const pcId = scanner.pc_daemon_id.trim()
    if (pcId.length > 0 && pcId !== '-') {
      uniquePcIds.add(pcId)
    }
  }

  return [
    {
      branch_daemon_id: normalizeBranchDaemonId(baseUrl),
      branch_daemon_addr: baseUrl,
      status: 'online',
      active_pc_daemon_count: uniquePcIds.size,
      active_scanner_count: scanners.length,
      last_checked: new Date().toISOString(),
    },
  ]
}

function getStatusBadgeClass(status: PcDaemon['status']): string {
  if (status === 'available') {
    return 'border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (status === 'reserved') {
    return 'border border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-600/50 dark:bg-cyan-500/10 dark:text-cyan-300'
  }

  return 'border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
}

function getBranchStatusBadgeClass(status: BranchDaemon['status']): string {
  if (status === 'online') {
    return 'border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300'
}

function getReservationBadgeClass(isExpired: boolean): string {
  if (isExpired) {
    return 'border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300'
  }

  return 'border border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-600/50 dark:bg-cyan-500/10 dark:text-cyan-300'
}

type DashboardTabProps = {
  onActivePcDaemonCountChange: (count: number) => void
  onActiveBranchDaemonCountChange: (count: number) => void
}

export default function DashboardTab({
  onActivePcDaemonCountChange,
  onActiveBranchDaemonCountChange,
}: DashboardTabProps) {
  const { addLog } = useLogContext()
  const [pcs, setPcs] = useState<PcDaemon[]>([])
  const [branchDaemons, setBranchDaemons] = useState<BranchDaemon[]>([])
  const [supportSnapshot, setSupportSnapshot] = useState<SupportSnapshot | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [supportError, setSupportError] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)

  const loadDaemons = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSupportError(null)

    try {
      addLog('info', 'Istek: listScanners {}')
      const scanners = await listScanners()
      const mappedPcs = mapScannersToPcDaemons(scanners)
      const mappedBranchDaemons = mapScannersToBranchDaemons(scanners)

      setPcs(mappedPcs)
      setBranchDaemons(mappedBranchDaemons)
      onActivePcDaemonCountChange(mappedPcs.length)
      onActiveBranchDaemonCountChange(mappedBranchDaemons.length)

      addLog(
        'info',
        `Yanit: listScanners scanners=${scanners.length}, pcs=${mappedPcs.length}, bds=${mappedBranchDaemons.length}`,
      )

      try {
        addLog('info', 'Istek: getSupportSnapshot {}')
        const snapshot = await getSupportSnapshot()
        setSupportSnapshot(snapshot)
        addLog(
          'info',
          `Yanit: getSupportSnapshot reservations=${snapshot.reservations.length}, scanners=${snapshot.scanners.length}`,
        )
      } catch (snapshotError) {
        const snapshotMessage =
          snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
        setSupportSnapshot(null)
        setSupportError(snapshotMessage)
        addLog('warn', `Hata: getSupportSnapshot ${snapshotMessage}`)
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      setPcs([])
      setBranchDaemons([])
      setSupportSnapshot(null)
      onActivePcDaemonCountChange(0)
      onActiveBranchDaemonCountChange(0)
      addLog('error', `Hata: listScanners ${message}`)
    } finally {
      setLoading(false)
    }
  }, [addLog, onActiveBranchDaemonCountChange, onActivePcDaemonCountChange])

  const handleCleanupReservations = useCallback(
    async (releaseAll: boolean) => {
      const actionName = releaseAll ? 'cleanupReservations(all)' : 'cleanupReservations(expired)'
      setActionKey(actionName)

      try {
        addLog('info', `Istek: ${actionName}`)
        const response = await cleanupReservations(releaseAll)
        addLog(
          'info',
          `Yanit: ${actionName} released_count=${response.released_count.toString()}`,
        )
        await loadDaemons()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError)
        addLog('error', `Hata: ${actionName} ${message}`)
      } finally {
        setActionKey(null)
      }
    },
    [addLog, loadDaemons],
  )

  const handleResetReservation = useCallback(
    async (reservation: ReservationInfo, force: boolean) => {
      const actionName = force ? 'resetScanner(force)' : 'resetScanner'
      const actionId = `${actionName}:${reservation.scanner_id}`
      setActionKey(actionId)

      try {
        addLog(
          'info',
          `Istek: ${actionName} scanner=${reservation.scanner_id} session=${reservation.session_id}`,
        )
        const response = await resetScanner({
          scanner_id: reservation.scanner_id,
          session_id: reservation.session_id,
          force,
        })
        addLog(
          'info',
          `Yanit: ${actionName} reset=${response.reset ? 'true' : 'false'} released_session=${response.released_session_id || '-'}`,
        )
        await loadDaemons()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError)
        addLog(
          'error',
          `Hata: ${actionName} scanner=${reservation.scanner_id} ${message}`,
        )
      } finally {
        setActionKey(null)
      }
    },
    [addLog, loadDaemons],
  )

  useEffect(() => {
    void loadDaemons()

    const intervalId = window.setInterval(() => {
      void loadDaemons()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadDaemons])

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Management Snapshot
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCleanupReservations(false)
              }}
              disabled={loading || actionKey !== null}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-600/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              Expired Cleanup
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCleanupReservations(true)
              }}
              disabled={loading || actionKey !== null}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-600/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
            >
              Tum Rezervasyonlari Birak
            </button>
          </div>
        </div>

        {supportError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-600/40 dark:bg-amber-500/10 dark:text-amber-300">
            Support snapshot alinamadi: {supportError}
          </p>
        ) : null}

        {supportSnapshot ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Node Role
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {supportSnapshot.diagnostics.node_role || '-'}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Online PC
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {supportSnapshot.diagnostics.online_pc_daemon_count.toString()}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Scanner
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {supportSnapshot.diagnostics.scanner_count.toString()}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Aktif Rezervasyon
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {supportSnapshot.diagnostics.active_reservation_count.toString()}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Expired Sayisi
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {supportSnapshot.diagnostics.expired_reservation_count.toString()}
                </p>
              </article>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reservation Timeout
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatSeconds(supportSnapshot.diagnostics.reservation_timeout_secs)}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Heartbeat Timeout
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatSeconds(supportSnapshot.diagnostics.heartbeat_timeout_secs)}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Snapshot Zamani
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatUnixTime(supportSnapshot.diagnostics.generated_at_unix)}
                </p>
              </article>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Rezervasyonlar
              </h3>
              {supportSnapshot.reservations.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Aktif rezervasyon yok.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Scanner
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Session
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Son Aktivite
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Expires
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Durum
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Aksiyon
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                      {supportSnapshot.reservations.map((reservation) => {
                        const resetActionId = `resetScanner:${reservation.scanner_id}`
                        const forceActionId = `resetScanner(force):${reservation.scanner_id}`

                        return (
                          <tr key={`${reservation.scanner_id}:${reservation.session_id}`}>
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                              {reservation.scanner_id}
                            </td>
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                              {reservation.session_id}
                            </td>
                            <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                              {formatUnixTime(reservation.last_activity_unix)}
                            </td>
                            <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                              {formatUnixTime(reservation.expires_at_unix)}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getReservationBadgeClass(reservation.is_expired)}`}
                              >
                                {reservation.is_expired ? 'expired' : 'active'}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleResetReservation(reservation, false)
                                  }}
                                  disabled={loading || actionKey !== null}
                                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  {actionKey === resetActionId ? 'Resetleniyor...' : 'Reset'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleResetReservation(reservation, true)
                                  }}
                                  disabled={loading || actionKey !== null}
                                  className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-600/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                                >
                                  {actionKey === forceActionId ? 'Force Reset...' : 'Force Reset'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Management snapshot henuz alinmadi.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Aktif PC Daemon&apos;lar
          </h2>
          <button
            type="button"
            onClick={() => {
              void loadDaemons()
            }}
            disabled={loading}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Yenile
          </button>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-slate-600 dark:text-slate-400">Yukleniyor...</p> : null}

        {!loading && pcs.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Bagli PC daemon bulunamadi</p>
        ) : null}

        {pcs.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    PC Daemon ID
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    PC Adresi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Scan gRPC Adresi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Scanner&apos;lar
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Durum
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Son Heartbeat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {pcs.map((pc) => (
                  <tr key={pc.pc_daemon_id}>
                    <td className="px-3 py-2 align-top">
                      <span
                        title={pc.pc_daemon_id}
                        className="font-mono text-xs text-slate-700 dark:text-slate-300"
                      >
                        {shortenId(pc.pc_daemon_id)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {pc.pc_daemon_addr || '-'}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {pc.scan_grpc_addr || '-'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {pc.scanner_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {pc.scanner_ids.map((scannerId) => (
                            <span
                              key={scannerId}
                              className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {scannerId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(pc.status)}`}
                      >
                        {pc.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {pc.last_heartbeat || UNKNOWN_HEARTBEAT}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Aktif Branch Daemon&apos;lar
        </h2>

        {!loading && branchDaemons.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Bagli Branch daemon bulunamadi</p>
        ) : null}

        {branchDaemons.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Branch Daemon ID
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Branch Adresi
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Aktif PC Daemon
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Aktif Scanner
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Durum
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Son Kontrol
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {branchDaemons.map((branchDaemon) => (
                  <tr key={branchDaemon.branch_daemon_id}>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {branchDaemon.branch_daemon_id}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {branchDaemon.branch_daemon_addr}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                      {branchDaemon.active_pc_daemon_count}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                      {branchDaemon.active_scanner_count}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getBranchStatusBadgeClass(branchDaemon.status)}`}
                      >
                        {branchDaemon.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                      {formatTime(branchDaemon.last_checked)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
