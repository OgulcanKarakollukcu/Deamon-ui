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
  | 'home-landing'
  | 'pre-start-info'
  | 'check-photo'
  | 'check-summary'
  | 'batch-photo'
  | 'session-summary'
