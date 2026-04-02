export interface CapturedCheck {
  id: string
  photoDataUrl: string
  qrValue: string
}

export interface CheckSession {
  checks: CapturedCheck[]
  batchPhotoDataUrl: string | null
}

export type CheckCaptureStep =
  | 'check-photo'
  | 'qr-scan'
  | 'check-summary'
  | 'batch-photo'
  | 'session-summary'
