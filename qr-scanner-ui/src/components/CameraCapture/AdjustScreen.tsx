import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import type { CornerQuad } from '../../types/scanner'
import { orderCorners, scaleCorners } from '../../utils/scanner/geometry'

const HANDLE_HIT_RADIUS = 28
const HANDLE_DOT_RADIUS = 6
const HANDLE_RING_RADIUS = 15
const MAGNIFIER_SIZE = 116
const MAGNIFIER_ZOOM = 2.8

export interface AdjustScreenProps {
  imageSrc: string
  sourceWidth: number
  sourceHeight: number
  initialCorners: CornerQuad
  isProcessing: boolean
  onRetake: () => void
  onConfirm: (corners: CornerQuad) => void
}

interface DragState {
  index: number
  pointerId: number
}

interface DisplaySize {
  width: number
  height: number
}

interface DragPreview {
  index: number
  x: number
  y: number
}

export function AdjustScreen({
  imageSrc,
  sourceWidth,
  sourceHeight,
  initialCorners,
  isProcessing,
  onRetake,
  onConfirm,
}: AdjustScreenProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activePointerRef = useRef<DragState | null>(null)

  const [localCorners, setLocalCorners] = useState<CornerQuad>(initialCorners)
  const [displaySize, setDisplaySize] = useState<DisplaySize>({ width: 0, height: 0 })
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

  useEffect(() => {
    setLocalCorners(initialCorners)
    setDragPreview(null)
  }, [initialCorners])

  useEffect(() => {
    const imageElement = imageRef.current
    if (!imageElement) {
      return
    }

    const updateDisplaySize = (): void => {
      setDisplaySize({
        width: imageElement.clientWidth,
        height: imageElement.clientHeight,
      })
    }

    updateDisplaySize()

    const observer = new ResizeObserver(updateDisplaySize)
    observer.observe(imageElement)
    imageElement.addEventListener('load', updateDisplaySize)

    return () => {
      observer.disconnect()
      imageElement.removeEventListener('load', updateDisplaySize)
    }
  }, [imageSrc])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !displaySize.width || !displaySize.height) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(displaySize.width * dpr)
    canvas.height = Math.round(displaySize.height * dpr)
    canvas.style.width = `${displaySize.width}px`
    canvas.style.height = `${displaySize.height}px`

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawOverlay(context, {
      width: displaySize.width,
      height: displaySize.height,
      corners: localCorners,
      sourceWidth,
      sourceHeight,
      dragPreview,
      image: imageRef.current,
    })
  }, [displaySize, dragPreview, localCorners, sourceHeight, sourceWidth])

  const hitTest = useCallback(
    (displayX: number, displayY: number, scaledCorners: CornerQuad | null): number => {
      if (!scaledCorners) {
        return -1
      }

      for (let index = 0; index < scaledCorners.length; index += 1) {
        const dx = displayX - scaledCorners[index].x
        const dy = displayY - scaledCorners[index].y
        if (Math.hypot(dx, dy) < HANDLE_HIT_RADIUS) {
          return index
        }
      }

      return -1
    },
    [],
  )

  const getDisplayPoint = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return { x: 0, y: 0 }
    }

    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }, [])

  const toSourcePoint = useCallback(
    (point: { x: number; y: number }) => ({
      x: clamp(
        point.x * (sourceWidth / Math.max(1, displaySize.width)),
        0,
        sourceWidth,
      ),
      y: clamp(
        point.y * (sourceHeight / Math.max(1, displaySize.height)),
        0,
        sourceHeight,
      ),
    }),
    [displaySize.height, displaySize.width, sourceHeight, sourceWidth],
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      if (
        isProcessing ||
        !event.isPrimary ||
        !displaySize.width ||
        !displaySize.height
      ) {
        return
      }

      const displayPoint = getDisplayPoint(event)
      const scaledCorners = scaleCorners(
        localCorners,
        sourceWidth,
        sourceHeight,
        displaySize.width,
        displaySize.height,
      )

      const hitIndex = hitTest(displayPoint.x, displayPoint.y, scaledCorners)
      if (hitIndex < 0) {
        return
      }

      event.preventDefault()
      activePointerRef.current = {
        index: hitIndex,
        pointerId: event.pointerId,
      }

      safeSetPointerCapture(canvasRef.current, event.pointerId)
      setDragPreview({ index: hitIndex, x: displayPoint.x, y: displayPoint.y })
    },
    [
      displaySize.height,
      displaySize.width,
      getDisplayPoint,
      hitTest,
      isProcessing,
      localCorners,
      sourceHeight,
      sourceWidth,
    ],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      if (
        !event.isPrimary ||
        !activePointerRef.current ||
        activePointerRef.current.pointerId !== event.pointerId
      ) {
        return
      }

      event.preventDefault()
      const displayPoint = getDisplayPoint(event)
      const sourcePoint = toSourcePoint(displayPoint)

      setLocalCorners((previous) => {
        const next = [...previous] as CornerQuad
        next[activePointerRef.current?.index ?? 0] = sourcePoint
        return next
      })

      setDragPreview({
        index: activePointerRef.current.index,
        x: displayPoint.x,
        y: displayPoint.y,
      })
    },
    [getDisplayPoint, toSourcePoint],
  )

  const finishDrag = useCallback(
    (event?: PointerEvent<HTMLCanvasElement> | globalThis.PointerEvent): void => {
      if (
        !activePointerRef.current ||
        (event?.pointerId != null &&
          activePointerRef.current.pointerId !== event.pointerId)
      ) {
        return
      }

      safeReleasePointerCapture(canvasRef.current, activePointerRef.current.pointerId)
      activePointerRef.current = null
      setDragPreview(null)
    },
    [],
  )

  useEffect(() => {
    const handleWindowPointerUp = (event: globalThis.PointerEvent): void => {
      finishDrag(event)
    }

    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerUp)

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerUp)
    }
  }, [finishDrag])

  const handleConfirm = useCallback((): void => {
    if (isProcessing) {
      return
    }

    onConfirm(orderCorners(localCorners))
  }, [isProcessing, localCorners, onConfirm])

  const handleReset = useCallback((): void => {
    if (isProcessing) {
      return
    }

    setLocalCorners(initialCorners)
    setDragPreview(null)
  }, [initialCorners, isProcessing])

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <div className="border-b border-white/10 bg-black/80 px-4 pb-3 pt-safe">
        <p className="text-base font-semibold text-white">Köşeleri Düzenleyin</p>
        <p className="text-sm text-white/55">
          Tutamaçları çekin köşelerine taşıyın, sonra devam edin.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-950 px-4 py-4">
        <div className="relative">
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Yakalanan çek"
            className="block max-h-[calc(100vh-260px)] max-w-full select-none rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            draggable={false}
          />

          <canvas
            ref={canvasRef}
            className="corner-overlay absolute inset-0"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onPointerLeave={finishDrag}
          />

          {isProcessing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/60">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-emerald-500" />
              <p className="text-sm text-white/70">İşleniyor...</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/80 px-4 py-3">
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            className="min-h-[48px] rounded-xl border border-white/12 bg-white/10 font-semibold text-white transition-transform active:scale-95 disabled:opacity-40"
            onClick={onRetake}
            disabled={isProcessing}
          >
            Tekrar Çek
          </button>

          <button
            type="button"
            className="min-h-[48px] rounded-xl border border-white/12 bg-white/8 font-semibold text-white/80 transition-transform active:scale-95 disabled:opacity-40"
            onClick={handleReset}
            disabled={isProcessing}
          >
            Sıfırla
          </button>

          <button
            type="button"
            className="min-h-[48px] rounded-xl bg-emerald-600 font-semibold text-white transition-transform active:scale-95 disabled:opacity-40"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            Devam Et
          </button>
        </div>
      </div>
    </div>
  )
}

interface DrawOverlayParams {
  width: number
  height: number
  corners: CornerQuad
  sourceWidth: number
  sourceHeight: number
  dragPreview: DragPreview | null
  image: HTMLImageElement | null
}

function drawOverlay(context: CanvasRenderingContext2D, params: DrawOverlayParams): void {
  const { width, height, corners, sourceWidth, sourceHeight, dragPreview, image } = params

  context.clearRect(0, 0, width, height)

  const scaledCorners = scaleCorners(
    corners,
    sourceWidth,
    sourceHeight,
    width,
    height,
  )

  context.fillStyle = 'rgba(0, 0, 0, 0.4)'
  context.fillRect(0, 0, width, height)

  context.save()
  context.beginPath()
  context.moveTo(scaledCorners[0].x, scaledCorners[0].y)
  scaledCorners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.clip()
  context.clearRect(0, 0, width, height)
  context.restore()

  context.beginPath()
  context.moveTo(scaledCorners[0].x, scaledCorners[0].y)
  scaledCorners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.strokeStyle = 'rgba(16, 185, 129, 0.95)'
  context.lineWidth = 2.5
  context.stroke()

  scaledCorners.forEach((point) => {
    context.beginPath()
    context.arc(point.x, point.y, HANDLE_RING_RADIUS, 0, Math.PI * 2)
    context.fillStyle = 'rgba(0, 0, 0, 0.55)'
    context.fill()
    context.strokeStyle = 'rgba(16, 185, 129, 0.95)'
    context.lineWidth = 2
    context.stroke()

    context.beginPath()
    context.arc(point.x, point.y, HANDLE_DOT_RADIUS, 0, Math.PI * 2)
    context.fillStyle = 'rgba(16, 185, 129, 1)'
    context.fill()
  })

  if (dragPreview && image) {
    drawMagnifier(context, dragPreview, image, width)
  }
}

function drawMagnifier(
  context: CanvasRenderingContext2D,
  dragPreview: DragPreview,
  image: HTMLImageElement,
  width: number,
): void {
  const margin = 18
  const hasRoomAbove = dragPreview.y - MAGNIFIER_SIZE - margin > 0
  const centerY = hasRoomAbove
    ? dragPreview.y - MAGNIFIER_SIZE * 0.75
    : dragPreview.y + MAGNIFIER_SIZE * 0.75

  const centerX = clamp(
    dragPreview.x,
    MAGNIFIER_SIZE / 2 + margin,
    width - MAGNIFIER_SIZE / 2 - margin,
  )

  const radius = MAGNIFIER_SIZE / 2
  const cropRadius = radius / MAGNIFIER_ZOOM

  const scaleX = image.naturalWidth / Math.max(1, image.clientWidth)
  const scaleY = image.naturalHeight / Math.max(1, image.clientHeight)

  const sourceX = clamp(
    dragPreview.x * scaleX,
    cropRadius,
    image.naturalWidth - cropRadius,
  )
  const sourceY = clamp(
    dragPreview.y * scaleY,
    cropRadius,
    image.naturalHeight - cropRadius,
  )

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.clip()
  context.drawImage(
    image,
    sourceX - cropRadius,
    sourceY - cropRadius,
    cropRadius * 2,
    cropRadius * 2,
    centerX - radius,
    centerY - radius,
    MAGNIFIER_SIZE,
    MAGNIFIER_SIZE,
  )
  context.restore()

  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.lineWidth = 3
  context.strokeStyle = 'rgba(255,255,255,0.95)'
  context.stroke()

  context.beginPath()
  context.arc(centerX, centerY, HANDLE_DOT_RADIUS, 0, Math.PI * 2)
  context.fillStyle = 'rgba(16, 185, 129, 1)'
  context.fill()

  context.beginPath()
  context.moveTo(dragPreview.x, dragPreview.y)
  context.lineTo(centerX, centerY)
  context.setLineDash([5, 4])
  context.strokeStyle = 'rgba(255,255,255,0.75)'
  context.lineWidth = 1.5
  context.stroke()
  context.setLineDash([])
}

function safeSetPointerCapture(
  element: HTMLCanvasElement | null,
  pointerId: number,
): void {
  if (!element) {
    return
  }

  try {
    element.setPointerCapture(pointerId)
  } catch {
    // ignore
  }
}

function safeReleasePointerCapture(
  element: HTMLCanvasElement | null,
  pointerId: number,
): void {
  if (!element) {
    return
  }

  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId)
    }
  } catch {
    // ignore
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default AdjustScreen
