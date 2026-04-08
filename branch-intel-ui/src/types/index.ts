export type LogEntry = {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  msg: string
}

export type CustomerScanInviteStatus = 'pending' | 'claimed' | 'submitted' | 'expired'

export type CustomerScanInviteCreateRequest = {
  customer_national_id: string
  customer_email: string
}

export type CustomerScanInviteCreateResponse = {
  invite_id: string
  one_time_link: string
  expires_at: string
  email_dispatched: boolean
}

export type CustomerScanInviteSummary = {
  invite_id: string
  status: CustomerScanInviteStatus
  customer_national_id: string
  customer_email: string
  check_count: number
  created_at: string
  expires_at: string
  claimed_at: string | null
  submitted_at: string | null
}

export type CustomerSubmittedCheck = {
  sequence_no: number
  qr_value: string
  image_data_url: string
  captured_at: string
  metadata?: unknown | null
}

export type CustomerScanInviteDetail = {
  invite: CustomerScanInviteSummary
  session_metadata?: unknown | null
  checks: CustomerSubmittedCheck[]
}

export type Tab = 'customer-link' | 'intelligence'

export type EmployeeLoginRequest = {
  username: string
  password: string
}

export type EmployeeLoginResponse = {
  token: string
  username: string
  expires_at: string
}
