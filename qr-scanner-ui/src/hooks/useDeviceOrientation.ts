import { useEffect, useState } from 'react'

export interface OrientationState {
  angle: number | null
  type: string | null
  viewportWidth: number
  viewportHeight: number
  isLandscape: boolean
}

/**
 * Tracks device orientation state with multiple browser fallbacks.
 */
export function useDeviceOrientation(): OrientationState {
  const [orientationState, setOrientationState] = useState<OrientationState>(() =>
    readOrientation(),
  )

  useEffect(() => {
    const updateOrientation = (): void => {
      setOrientationState((current) => {
        const next = readOrientation()
        if (
          current.angle === next.angle &&
          current.type === next.type &&
          current.isLandscape === next.isLandscape &&
          current.viewportWidth === next.viewportWidth &&
          current.viewportHeight === next.viewportHeight
        ) {
          return current
        }

        return next
      })
    }

    updateOrientation()

    const orientationMedia = window.matchMedia?.('(orientation: landscape)')
    const intervalId = window.setInterval(updateOrientation, 250)

    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)
    window.visualViewport?.addEventListener('resize', updateOrientation)
    window.screen?.orientation?.addEventListener('change', updateOrientation)
    orientationMedia?.addEventListener('change', updateOrientation)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', updateOrientation)
      window.visualViewport?.removeEventListener('resize', updateOrientation)
      window.screen?.orientation?.removeEventListener('change', updateOrientation)
      orientationMedia?.removeEventListener('change', updateOrientation)
    }
  }, [])

  return orientationState
}

function readOrientation(): OrientationState {
  if (typeof window === 'undefined') {
    return {
      angle: null,
      type: null,
      viewportWidth: 0,
      viewportHeight: 0,
      isLandscape: false,
    }
  }

  const viewportWidth =
    window.visualViewport?.width ??
    window.innerWidth ??
    document.documentElement?.clientWidth ??
    0

  const viewportHeight =
    window.visualViewport?.height ??
    window.innerHeight ??
    document.documentElement?.clientHeight ??
    0

  const angle = readOrientationAngle()
  const type = window.screen?.orientation?.type ?? null
  const mediaLandscape = Boolean(window.matchMedia?.('(orientation: landscape)')?.matches)
  const typeLandscape = typeof type === 'string' && type.startsWith('landscape')
  const angleLandscape = angle === 90 || angle === 270
  const viewportLandscape = viewportWidth > viewportHeight

  return {
    angle,
    type,
    viewportWidth,
    viewportHeight,
    isLandscape: mediaLandscape || typeLandscape || angleLandscape || viewportLandscape,
  }
}

function readOrientationAngle(): number | null {
  const modernAngle = window.screen?.orientation?.angle
  if (typeof modernAngle === 'number') {
    return normalizeAngle(modernAngle)
  }

  const legacyWindow = window as Window & { orientation?: unknown }
  if (typeof legacyWindow.orientation === 'number') {
    return normalizeAngle(legacyWindow.orientation)
  }

  return null
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360
}
