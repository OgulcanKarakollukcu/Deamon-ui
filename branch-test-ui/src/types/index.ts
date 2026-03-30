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
  cheque_count: number
  created_at: string
}

export type BordroChequeType = 'BL' | 'BV' | 'NM' | 'VR'

export type BordroCurrency = 'TRY' | 'USD' | 'EUR'

export type CreateBordroRequest = {
  cheque_count: number
  cheque_type: BordroChequeType
  bordro_amount: string
  account_no: string
  customer_name: string
  account_branch: string
  currency: BordroCurrency
}

export type SessionBordroEntry = BordroEntry & {
  cheque_type: BordroChequeType
  bordro_amount: string
  account_no: string
  customer_name: string
  account_branch: string
  currency: BordroCurrency
}

export type ScanColorMode = 'UNSPECIFIED' | 'COLOR' | 'GRAYSCALE' | 'BLACK_AND_WHITE'
export type ScanPageSize = 'UNSPECIFIED' | 'CHEQUE' | 'A4'
export type DocumentType = 'UNSPECIFIED' | 'GENERIC'

export type BordroScanMetadata = {
  bordro_id: string
  object_path: string
  page_count: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
  effective_duplex: boolean
  effective_dpi: number
  effective_color_mode: ScanColorMode
  duplex_verified: boolean
  dpi_verified: boolean
  color_mode_verified: boolean
}

export type ChequeMetadata = {
  object_path: string
  scanner_id: string
  session_id: string
  bordro_id: string
  cheque_no: number
  micr_data: string
  qr_data: string
  front_image_path: string
  back_image_path: string
  front_image_content_type: string
  back_image_content_type: string
  // Backward-compatible aliases used by existing UI blocks.
  micr: string
  qr: string
  page_count: number
  micr_qr_match: boolean
  // Requested scan options.
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
  // Effective options applied by backend after scan.
  effective_duplex: boolean
  effective_dpi: number
  effective_color_mode: ScanColorMode
  // True when backend could verify effective option.
  duplex_verified: boolean
  dpi_verified: boolean
  color_mode_verified: boolean
  // Backward-compatible aliases used by existing storage helpers.
  front_path: string
  back_path: string
}

export type ScanBordroProgress = {
  cheque: ChequeMetadata
  completed_count: number
  total_count: number
}

export type DocumentPageMetadata = {
  sheet_index: number
  front_image_path: string
  front_image_content_type: string
  back_image_path: string | null
  back_image_content_type: string | null
}

export type DocumentScanMetadata = {
  document_id: string
  document_type: DocumentType
  object_path: string
  sheet_count: number
  page_count: number
  pages: DocumentPageMetadata[]
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
  effective_duplex: boolean
  effective_dpi: number
  effective_color_mode: ScanColorMode
  duplex_verified: boolean
  dpi_verified: boolean
  color_mode_verified: boolean
}

export type LogEntry = {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  msg: string
}

export type Tab = 'dashboard' | 'bordro' | 'bordroScan' | 'document-scan' | 'logs'
