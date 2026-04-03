import { CameraCapture } from '../CameraCapture'

export interface BatchPhotoStepProps {
  checkCount: number
  onCapture: (dataUrl: string) => void
}

export function BatchPhotoStep({ checkCount, onCapture }: BatchPhotoStepProps) {
  return (
    <CameraCapture
      onCapture={onCapture}
      instructionText={`${checkCount} çeki yan yana sıralayın ve fotoğrafı çekin`}
      showOverlay={false}
      qrRequired={false}
    />
  )
}

export default BatchPhotoStep
