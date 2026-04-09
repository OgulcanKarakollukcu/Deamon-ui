import { memo, useEffect, useRef } from 'react'
import type { CornerQuad } from '../../types/scanner'
import { createGuideCorners, scaleCornersToCover } from '../../utils/scanner/geometry'

const DETECTION_WIDTH = 640

type GuideFrameTone = 'idle' | 'detecting' | 'ready' | 'warning'

export interface GuideFrameOverlayProps {
  detectionWidth?: number
  detectionHeight: number
  displayWidth: number
  displayHeight: number
  tone: GuideFrameTone
}

export const GuideFrameOverlay = memo(function GuideFrameOverlay({
  detectionWidth = DETECTION_WIDTH,
  detectionHeight,
  displayWidth,
  displayHeight,
  tone,
}: GuideFrameOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !displayWidth || !displayHeight) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(displayWidth * dpr)
    canvas.height = Math.round(displayHeight * dpr)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
  }, [displayHeight, displayWidth])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !displayWidth || !displayHeight) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const scaledGuide = scaleCornersToCover(
      createGuideCorners(detectionWidth, detectionHeight, {
        displayWidth,
        displayHeight,
        targetDisplayWidth: displayWidth,
        targetDisplayHeight: displayWidth * 0.7,
      }),
      detectionWidth,
      detectionHeight,
      displayWidth,
      displayHeight,
    )

    if (!scaledGuide) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, displayWidth, displayHeight)

    drawGuideMask(context, displayWidth, displayHeight, scaledGuide)
    drawGuideFrame(context, scaledGuide, tone)
  }, [detectionHeight, detectionWidth, displayHeight, displayWidth, tone])

  return <canvas ref={canvasRef} className="corner-overlay corner-overlay-passive" />
})

function drawGuideMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  guideCorners: CornerQuad,
): void {
  context.save()
  context.fillStyle = 'rgba(3, 7, 18, 0.34)'
  context.beginPath()
  context.rect(0, 0, width, height)
  context.moveTo(guideCorners[0].x, guideCorners[0].y)
  guideCorners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.fill('evenodd')
  context.restore()
}

function drawGuideFrame(
  context: CanvasRenderingContext2D,
  guideCorners: CornerQuad,
  tone: GuideFrameTone,
): void {
  const palette = resolvePalette(tone)
  const [topLeft, topRight, bottomRight, bottomLeft] = guideCorners
  const cornerLength = 28

  context.beginPath()
  context.moveTo(topLeft.x, topLeft.y)
  context.lineTo(topRight.x, topRight.y)
  context.lineTo(bottomRight.x, bottomRight.y)
  context.lineTo(bottomLeft.x, bottomLeft.y)
  context.closePath()
  context.fillStyle = palette.fill
  context.fill()

  context.strokeStyle = palette.border
  context.lineWidth = 2.5
  context.setLineDash([10, 8])
  context.stroke()
  context.setLineDash([])

  context.strokeStyle = palette.accent
  context.lineWidth = 4

  drawCornerAccent(context, topLeft, [1, 0], [0, 1], cornerLength)
  drawCornerAccent(context, topRight, [-1, 0], [0, 1], cornerLength)
  drawCornerAccent(context, bottomRight, [-1, 0], [0, -1], cornerLength)
  drawCornerAccent(context, bottomLeft, [1, 0], [0, -1], cornerLength)
}

function drawCornerAccent(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  horizontal: [number, number],
  vertical: [number, number],
  length: number,
): void {
  context.beginPath()
  context.moveTo(point.x + horizontal[0] * length, point.y + horizontal[1] * length)
  context.lineTo(point.x, point.y)
  context.lineTo(point.x + vertical[0] * length, point.y + vertical[1] * length)
  context.stroke()
}

function resolvePalette(tone: GuideFrameTone): {
  border: string
  accent: string
  fill: string
} {
  switch (tone) {
    case 'ready':
      return {
        border: 'rgba(74, 222, 128, 0.98)',
        accent: 'rgba(134, 239, 172, 1)',
        fill: 'rgba(34, 197, 94, 0.12)',
      }
    case 'warning':
      return {
        border: 'rgba(251, 191, 36, 0.95)',
        accent: 'rgba(253, 224, 71, 1)',
        fill: 'rgba(245, 158, 11, 0.1)',
      }
    case 'detecting':
      return {
        border: 'rgba(96, 165, 250, 0.95)',
        accent: 'rgba(191, 219, 254, 1)',
        fill: 'rgba(59, 130, 246, 0.09)',
      }
    case 'idle':
    default:
      return {
        border: 'rgba(255, 255, 255, 0.72)',
        accent: 'rgba(255, 255, 255, 0.92)',
        fill: 'rgba(255, 255, 255, 0.04)',
      }
  }
}

export default GuideFrameOverlay
