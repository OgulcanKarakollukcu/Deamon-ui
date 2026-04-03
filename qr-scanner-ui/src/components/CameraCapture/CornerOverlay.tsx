import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from 'react'
import type { CornerQuad } from '../../types/scanner'
import {
  computeCoverTransform,
  createGuideCorners,
  scaleCornersToCover,
} from '../../utils/scanner/geometry'

const DETECTION_WIDTH = 640

const COLOR_DETECTING = 'rgba(59, 130, 246, 0.35)'
const COLOR_STABLE = 'rgba(34, 197, 94, 0.40)'
const COLOR_BORDER_DETECTING = 'rgba(59, 130, 246, 0.9)'
const COLOR_BORDER_STABLE = 'rgba(34, 197, 94, 1.0)'

const CORNER_HIT_RADIUS = 28
const CORNER_DOT_RADIUS = 5
const CORNER_RING_RADIUS = 14

export interface CornerOverlayProps {
  corners: CornerQuad | null
  isStable: boolean
  detectionWidth?: number
  detectionHeight: number
  displayWidth: number
  displayHeight: number
  interactive?: boolean
  onCornersChange?: (corners: CornerQuad) => void
}

interface DragState {
  index: number
}

export const CornerOverlay = memo(function CornerOverlay({
  corners,
  isStable,
  detectionWidth = DETECTION_WIDTH,
  detectionHeight,
  displayWidth,
  displayHeight,
  interactive = true,
  onCornersChange,
}: CornerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [localCorners, setLocalCorners] = useState<CornerQuad | null>(null)

  useEffect(() => {
    if (dragRef.current) {
      return
    }

    if (corners) {
      setLocalCorners(corners)
      return
    }

    setLocalCorners(createGuideCorners(detectionWidth, detectionHeight))
  }, [corners, detectionHeight, detectionWidth])

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

    const dpr = window.devicePixelRatio || 1
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, displayWidth, displayHeight)

    const scaledCorners = localCorners
      ? scaleCornersToCover(
          localCorners,
          detectionWidth,
          detectionHeight,
          displayWidth,
          displayHeight,
        )
      : null

    const guideCorners = createGuideCorners(detectionWidth, detectionHeight)
    const scaledGuide = scaleCornersToCover(
      guideCorners,
      detectionWidth,
      detectionHeight,
      displayWidth,
      displayHeight,
    )

    if (scaledCorners) {
      drawCorners(context, scaledCorners, isStable)
      return
    }

    if (scaledGuide) {
      drawGuide(context, scaledGuide)
      return
    }

    drawFallbackGuide(context, displayWidth, displayHeight)
  }, [
    detectionHeight,
    detectionWidth,
    displayHeight,
    displayWidth,
    isStable,
    localCorners,
  ])

  const hitTest = useCallback(
    (x: number, y: number, scaledCorners: CornerQuad | null): number => {
      if (!scaledCorners) {
        return -1
      }

      for (let index = 0; index < scaledCorners.length; index += 1) {
        const dx = x - scaledCorners[index].x
        const dy = y - scaledCorners[index].y
        if (Math.hypot(dx, dy) < CORNER_HIT_RADIUS) {
          return index
        }
      }

      return -1
    },
    [],
  )

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLCanvasElement>): void => {
      if (!interactive || !localCorners) {
        return
      }

      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const touch = event.touches[0]
      if (!touch) {
        return
      }

      const touchX = touch.clientX - rect.left
      const touchY = touch.clientY - rect.top

      const scaledCorners = scaleCornersToCover(
        localCorners,
        detectionWidth,
        detectionHeight,
        rect.width,
        rect.height,
      )

      const index = hitTest(touchX, touchY, scaledCorners)
      if (index >= 0) {
        event.preventDefault()
        dragRef.current = { index }
      }
    },
    [detectionHeight, detectionWidth, hitTest, interactive, localCorners],
  )

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLCanvasElement>): void => {
      if (!interactive || !dragRef.current || !localCorners) {
        return
      }

      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      event.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const touch = event.touches[0]
      if (!touch) {
        return
      }

      const touchX = touch.clientX - rect.left
      const touchY = touch.clientY - rect.top

      const transform = computeCoverTransform(
        detectionWidth,
        detectionHeight,
        rect.width,
        rect.height,
      )

      if (!transform) {
        return
      }

      const detectionX = clamp(
        (touchX - transform.offsetX) / transform.scale,
        0,
        detectionWidth,
      )
      const detectionY = clamp(
        (touchY - transform.offsetY) / transform.scale,
        0,
        detectionHeight,
      )

      const next = [...localCorners] as CornerQuad
      next[dragRef.current.index] = { x: detectionX, y: detectionY }
      setLocalCorners(next)
    },
    [detectionHeight, detectionWidth, interactive, localCorners],
  )

  const handleTouchEnd = useCallback((): void => {
    if (!interactive) {
      return
    }

    if (dragRef.current && onCornersChange && localCorners) {
      onCornersChange(localCorners)
    }

    dragRef.current = null
  }, [interactive, localCorners, onCornersChange])

  return (
    <canvas
      ref={canvasRef}
      className={`corner-overlay ${
        interactive ? 'corner-overlay-interactive' : 'corner-overlay-passive'
      }`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    />
  )
})

function drawCorners(
  context: CanvasRenderingContext2D,
  scaledCorners: CornerQuad,
  isStable: boolean,
): void {
  const fillColor = isStable ? COLOR_STABLE : COLOR_DETECTING
  const borderColor = isStable ? COLOR_BORDER_STABLE : COLOR_BORDER_DETECTING

  context.beginPath()
  context.moveTo(scaledCorners[0].x, scaledCorners[0].y)
  scaledCorners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.fillStyle = fillColor
  context.fill()
  context.strokeStyle = borderColor
  context.lineWidth = 2.5
  context.stroke()

  scaledCorners.forEach((point) => {
    context.beginPath()
    context.arc(point.x, point.y, CORNER_RING_RADIUS, 0, Math.PI * 2)
    context.fillStyle = 'rgba(0,0,0,0.4)'
    context.fill()
    context.strokeStyle = borderColor
    context.lineWidth = 2
    context.stroke()

    context.beginPath()
    context.arc(point.x, point.y, CORNER_DOT_RADIUS, 0, Math.PI * 2)
    context.fillStyle = borderColor
    context.fill()
  })
}

function drawGuide(context: CanvasRenderingContext2D, guideCorners: CornerQuad): void {
  context.beginPath()
  context.moveTo(guideCorners[0].x, guideCorners[0].y)
  guideCorners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.fillStyle = 'rgba(255,255,255,0.08)'
  context.fill()
  context.strokeStyle = 'rgba(255,255,255,0.42)'
  context.lineWidth = 2
  context.setLineDash([7, 5])
  context.stroke()
  context.setLineDash([])

  guideCorners.forEach((point) => {
    context.beginPath()
    context.arc(point.x, point.y, CORNER_RING_RADIUS, 0, Math.PI * 2)
    context.fillStyle = 'rgba(255,255,255,0.08)'
    context.fill()
    context.strokeStyle = 'rgba(255,255,255,0.42)'
    context.lineWidth = 2
    context.stroke()
  })
}

function drawFallbackGuide(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const guideWidth = width * 0.76
  const guideHeight = height * 0.54
  const x0 = (width - guideWidth) / 2
  const y0 = (height - guideHeight) / 2
  const cornerLength = 28

  context.strokeStyle = 'rgba(255,255,255,0.25)'
  context.lineWidth = 1.5
  context.setLineDash([6, 5])
  context.strokeRect(x0, y0, guideWidth, guideHeight)
  context.setLineDash([])

  context.strokeStyle = 'rgba(255,255,255,0.55)'
  context.lineWidth = 3

  const corners = [
    [x0, y0],
    [x0 + guideWidth, y0],
    [x0 + guideWidth, y0 + guideHeight],
    [x0, y0 + guideHeight],
  ]

  const directions = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]

  corners.forEach(([cornerX, cornerY], index) => {
    const [dirX, dirY] = directions[index]
    context.beginPath()
    context.moveTo(cornerX + dirX * cornerLength, cornerY)
    context.lineTo(cornerX, cornerY)
    context.lineTo(cornerX, cornerY + dirY * cornerLength)
    context.stroke()
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default CornerOverlay
