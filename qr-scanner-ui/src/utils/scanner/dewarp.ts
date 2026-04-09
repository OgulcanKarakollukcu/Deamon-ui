import type { CornerQuad } from '../../types/scanner'
import { applyHomography, computeHomography } from './geometry'

export function dewarpCanvasBilinear(
  sourceCanvas: HTMLCanvasElement,
  orderedCorners: CornerQuad,
  destinationWidth: number,
  destinationHeight: number,
): HTMLCanvasElement {
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) {
    throw new Error('Failed to read source canvas')
  }

  const sourceImageData = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  )

  const destinationCanvas = document.createElement('canvas')
  destinationCanvas.width = destinationWidth
  destinationCanvas.height = destinationHeight

  const destinationContext = destinationCanvas.getContext('2d')
  if (!destinationContext) {
    throw new Error('Failed to create destination canvas context')
  }

  const destinationImageData = destinationContext.createImageData(
    destinationWidth,
    destinationHeight,
  )

  const destinationPoints: CornerQuad = [
    { x: 0, y: 0 },
    { x: destinationWidth, y: 0 },
    { x: destinationWidth, y: destinationHeight },
    { x: 0, y: destinationHeight },
  ]

  const homography = computeHomography(destinationPoints, orderedCorners)
  if (!homography) {
    destinationContext.drawImage(sourceCanvas, 0, 0, destinationWidth, destinationHeight)
    return destinationCanvas
  }

  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height
  const sourceData = sourceImageData.data
  const destinationData = destinationImageData.data

  for (let dy = 0; dy < destinationHeight; dy += 1) {
    for (let dx = 0; dx < destinationWidth; dx += 1) {
      const sourcePoint = applyHomography(homography, dx, dy)
      const sourceX = sourcePoint.x
      const sourceY = sourcePoint.y

      if (
        sourceX >= 0 &&
        sourceX < sourceWidth - 1 &&
        sourceY >= 0 &&
        sourceY < sourceHeight - 1
      ) {
        const destinationIndex = (dy * destinationWidth + dx) * 4

        const x0 = Math.floor(sourceX)
        const y0 = Math.floor(sourceY)
        const x1 = x0 + 1
        const y1 = y0 + 1
        const fx = sourceX - x0
        const fy = sourceY - y0

        const idx00 = (y0 * sourceWidth + x0) * 4
        const idx10 = (y0 * sourceWidth + x1) * 4
        const idx01 = (y1 * sourceWidth + x0) * 4
        const idx11 = (y1 * sourceWidth + x1) * 4

        for (let channel = 0; channel < 3; channel += 1) {
          const p00 = sourceData[idx00 + channel]
          const p10 = sourceData[idx10 + channel]
          const p01 = sourceData[idx01 + channel]
          const p11 = sourceData[idx11 + channel]

          const top = p00 * (1 - fx) + p10 * fx
          const bottom = p01 * (1 - fx) + p11 * fx
          destinationData[destinationIndex + channel] = top * (1 - fy) + bottom * fy
        }
        destinationData[destinationIndex + 3] = 255
      }
    }
  }

  destinationContext.putImageData(destinationImageData, 0, 0)
  return destinationCanvas
}

