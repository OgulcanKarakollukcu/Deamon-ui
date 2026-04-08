import { createContext, useContext } from 'react'
import type { LogEntry } from '../types'

type LogLevel = LogEntry['level']

type LogContextValue = {
  logs: LogEntry[]
  addLog: (level: LogLevel, msg: string) => void
  clearLogs: () => void
}

const LogContext = createContext<LogContextValue | undefined>(undefined)

function useLogContext(): LogContextValue {
  const value = useContext(LogContext)
  if (value === undefined) {
    throw new Error('useLogContext must be used within a LogContext.Provider')
  }

  return value
}

export { LogContext, useLogContext }
export type { LogContextValue, LogLevel }
