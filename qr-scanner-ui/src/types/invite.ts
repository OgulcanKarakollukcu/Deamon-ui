export interface ClaimInviteResponse {
  invite_id: string
  session_token: string
  customer_national_id: string
  customer_email: string
  expires_at: string
}

export interface SubmitInviteCheckPayload {
  sequence_no: number
  qr_value: string
  image_data_url: string
  captured_at: string
  metadata?: Record<string, unknown>
}

export interface SubmitInviteSessionPayload {
  checks: SubmitInviteCheckPayload[]
  completed_at: string
  session_metadata?: Record<string, unknown>
}

export interface SubmitInviteSessionResponse {
  invite_id: string
  submitted_at: string
  check_count: number
}
