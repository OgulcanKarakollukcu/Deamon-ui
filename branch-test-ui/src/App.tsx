import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BordroScanTab from './components/BordroScanTab'
import BordroTab from './components/BordroTab'
import DashboardTab from './components/DashboardTab'
import LogsTab from './components/LogsTab'
import { TabLayout } from './components/TabLayout'
import { LogContext } from './context/LogContext'
import { chequeHealth } from './services'
import type { LogEntry, Tab } from './types'

const THEME_STORAGE_KEY = 'branch-ui-theme'
type ThemeMode = 'dark' | 'light'

function getInitialThemeMode(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [activeBordroId, setActiveBordroId] = useState<string | null>(null)
  const [activePcDaemonCount, setActivePcDaemonCount] = useState<number>(0)
  const [activeBranchDaemonCount, setActiveBranchDaemonCount] = useState<number>(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [daemonOnline, setDaemonOnline] = useState<boolean>(false)
  const [checkingDaemon, setChequeingDaemon] = useState<boolean>(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode())
  const nextLogIdRef = useRef<number>(1)
  const isDarkMode = themeMode === 'dark'

  const addLog = useCallback((level: LogEntry['level'], msg: string) => {
    const entry: LogEntry = {
      id: nextLogIdRef.current,
      ts: new Date().toISOString(),
      level,
      msg,
    }

    nextLogIdRef.current += 1
    setLogs((prev) => [entry, ...prev].slice(0, 200))
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const logContextValue = useMemo(
    () => ({
      logs,
      addLog,
      clearLogs,
    }),
    [addLog, clearLogs, logs],
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [isDarkMode, themeMode])

  useEffect(() => {
    let isMounted = true
    let isChequeing = false

    const runHealthCheque = async () => {
      if (isChequeing) {
        return
      }

      isChequeing = true

      if (isMounted) {
        setChequeingDaemon(true)
      }

      try {
        const online = await chequeHealth()

        if (isMounted) {
          setDaemonOnline(online)
        }
      } finally {
        isChequeing = false
        if (isMounted) {
          setChequeingDaemon(false)
        }
      }
    }

    void runHealthCheque()

    const intervalId = window.setInterval(() => {
      void runHealthCheque()
    }, 5000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <LogContext.Provider value={logContextValue}>
      <TabLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePcDaemonCount={activePcDaemonCount}
        activeBranchDaemonCount={activeBranchDaemonCount}
        isDarkMode={isDarkMode}
        onThemeToggle={() => {
          setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }}
        contentDisabled={!daemonOnline}
        contentOverlay={
          daemonOnline ? null : (
            <div className="flex h-full items-start justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-200/90 px-4 py-2 text-sm font-medium text-amber-950 shadow-md dark:border-amber-300/20 dark:bg-amber-500/20 dark:text-amber-100">
                <span
                  className={`h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent ${
                    checkingDaemon ? 'animate-spin' : 'animate-pulse'
                  }`}
                  aria-hidden="true"
                />
                <span>Branch Daemon&apos;a bağlanılamıyor — yeniden deneniyor…</span>
              </div>
            </div>
          )
        }
        dashboardContent={
          <DashboardTab
            onActivePcDaemonCountChange={setActivePcDaemonCount}
            onActiveBranchDaemonCountChange={setActiveBranchDaemonCount}
          />
        }
        bordroContent={
          <BordroTab
            activeBordroId={activeBordroId}
            onActiveBordroChange={setActiveBordroId}
          />
        }
        bordroScanContent={<BordroScanTab activeBordroId={activeBordroId} />}
        logsContent={<LogsTab />}
      />
    </LogContext.Provider>
  )
}

export default App
