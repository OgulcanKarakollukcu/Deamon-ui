import { useLogContext } from '../context/LogContext'
import type { LogEntry } from '../types'

function getLevelClass(level: LogEntry['level']): string {
  if (level === 'info') {
    return 'border border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (level === 'warn') {
    return 'border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (level === 'error') {
    return 'border border-red-200 bg-red-100 text-red-700 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300'
  }

  return 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export default function LogsTab() {
  const { logs, clearLogs } = useLogContext()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Servis Logları</h2>
        <button
          type="button"
          onClick={clearLogs}
          disabled={logs.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Temizle
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Henüz log kaydı yok.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <article
              key={log.id}
              className="flex flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/70"
            >
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{log.ts}</span>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium uppercase ${getLevelClass(log.level)}`}
              >
                {log.level}
              </span>
              <p className="min-w-0 flex-1 break-words text-slate-800 dark:text-slate-200">{log.msg}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
