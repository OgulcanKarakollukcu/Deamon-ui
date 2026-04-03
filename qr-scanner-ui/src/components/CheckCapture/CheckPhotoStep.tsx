import { CameraCapture } from '../CameraCapture'

export interface CheckPhotoStepProps {
  onCapture: (dataUrl: string, qrValue?: string) => void
}

export function CheckPhotoStep({ onCapture }: CheckPhotoStepProps) {
  return (
    <CameraCapture
      onCapture={onCapture}
      instructionText="Çeki kameraya gösterin ve fotoğrafı çekin"
      qrRequired
    />
  )
}

export default CheckPhotoStep
