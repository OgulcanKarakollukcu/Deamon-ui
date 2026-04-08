import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CustomerInviteTab from './components/CustomerInviteTab'
import IntelligenceTab from './components/IntelligenceTab'
import LoginPage from './components/LoginPage'
import { TabLayout } from './components/TabLayout'
import { LogContext } from './context/LogContext'
import {
  clearAuthSession,
  getAuthUsername,
  hasValidStoredSession,
} from './services/authStorage'
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
  const [activeTab, setActiveTab] = useState<Tab>('customer-link')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasValidStoredSession())
  const [username, setUsername] = useState<string>(() => getAuthUsername() ?? '')
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

  const handleLogout = useCallback(() => {
    clearAuthSession()
    setIsAuthenticated(false)
    setUsername('')
  }, [])

  const handleLoginSuccess = useCallback((nextUsername: string) => {
    setUsername(nextUsername)
    setIsAuthenticated(true)
  }, [])

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <LogContext.Provider value={logContextValue}>
      <TabLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDarkMode={isDarkMode}
        username={username}
        onLogout={handleLogout}
        onThemeToggle={() => {
          setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }}
        customerLinkContent={<CustomerInviteTab />}
        intelligenceContent={<IntelligenceTab />}
      />
    </LogContext.Provider>
  )
}

export default App
