export type PcDaemon = {
  pc_daemon_id: string
  pc_daemon_addr: string
  scan_grpc_addr: string
  scanner_ids: string[]
  status: 'available' | 'reserved' | 'unavailable'
  last_heartbeat: string
}

export type BranchDaemon = {
  branch_daemon_id: string
  branch_daemon_addr: string
  status: 'online' | 'offline'
  active_pc_daemon_count: number
  active_scanner_count: number
  last_checked: string
}

export type Scanner = {
  scanner_id: string
  pc_daemon_id: string
  pc_daemon_addr: string
  scan_grpc_addr: string
  pc_daemon_status: 'available' | 'reserved' | 'unavailable'
  last_heartbeat_unix: number
  last_heartbeat?: string
}

export type BordroEntry = {
  bordro_id: string
  check_count: number
  created_at: string
}

export type BordroCheckType = 'BL' | 'BV' | 'NM' | 'VR'

export type BordroCurrency = 'TRY' | 'USD' | 'EUR'

export type CreateBordroRequest = {
  check_count: number
  check_type: BordroCheckType
  bordro_amount: string
  account_no: string
  customer_name: string
  account_branch: string
  currency: BordroCurrency
}

export type SessionBordroEntry = BordroEntry & {
  check_type: BordroCheckType
  bordro_amount: string
  account_no: string
  customer_name: string
  account_branch: string
  currency: BordroCurrency
}

export type CheckMetadata = {
  object_path: string
  scanner_id: string
  session_id: string
  bordro_id: string
  check_no: number
  micr: string
  qr: string
  front_path: string
  back_path: string
}

export type LogEntry = {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  msg: string
}

export type Tab = 'dashboard' | 'bordro' | 'logs'
