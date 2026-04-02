import { CameraCapture } from '../CameraCapture'

export interface CheckPhotoStepProps {
  onCapture: (dataUrl: string) => void
}

export function CheckPhotoStep({ onCapture }: CheckPhotoStepProps) {
  return (
    <CameraCapture
      onCapture={onCapture}
      instructionText="Çeki kameraya gösterin ve fotoğrafı çekin"
    />
  )
}

export default CheckPhotoStep
