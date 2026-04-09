import { CameraCapture } from '../CameraCapture'

export interface CheckPhotoStepProps {
  onCapture: (dataUrl: string, qrValue?: string) => void
  onCaptureMultiple: (items: Array<{ dataUrl: string; qrValue: string }>) => void
}

export function CheckPhotoStep({ onCapture, onCaptureMultiple }: CheckPhotoStepProps) {
  return (
    <CameraCapture
      onCapture={onCapture}
      onCaptureMultiple={onCaptureMultiple}
      instructionText="Çeki kameraya gösterin ve fotoğrafı çekin"
      qrRequired
    />
  )
}

export default CheckPhotoStep
