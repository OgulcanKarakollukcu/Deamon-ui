export interface CornerPoint {
  x: number
  y: number
}

export type CornerQuad = [CornerPoint, CornerPoint, CornerPoint, CornerPoint]

export interface GuideRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CameraErrorState {
  code: 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'IN_USE' | 'UNKNOWN'
  message: string
}

export interface FlashModeOption {
  id: string
  label: string
  value: number | null
}

export interface CaptureDraft {
  sourceCanvas: HTMLCanvasElement
  previewDataURL: string
  width: number
  height: number
  corners: CornerQuad
}

export type EnhancementMode = 'color' | 'bw' | 'enhanced'

export interface ProcessedCapture {
  dataURL: string
  originalDataURL: string
  blob: Blob
  originalBlob: Blob
  width: number
  height: number
}
