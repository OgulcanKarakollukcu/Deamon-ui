import { useCallback, useEffect, useMemo, useState } from 'react'

const STUCK_HINT_DELAY_MS = 2500
const SAMPLE_DURATION_MS = 1400
const SIDEWAYS_GAMMA_THRESHOLD = 45

type OrientationCheckState =
  | 'idle'
  | 'checking'
  | 'lock_likely'
  | 'rotate_more'

interface SensorSupport {
  supported: boolean
  requiresPermission: boolean
}

export interface OrientationLockAssistResult {
  canRunOrientationLockCheck: boolean
  requiresPermission: boolean
  showHint: boolean
  checkState: OrientationCheckState
  runOrientationLockCheck: () => Promise<void>
}

/**
 * Helps users when browser orientation lock blocks landscape detection.
 */
export function useOrientationLockAssist(active: boolean): OrientationLockAssistResult {
  const sensorSupport = useMemo(() => getSensorSupport(), [])
  const [showHint, setShowHint] = useState(false)
  const [checkState, setCheckState] = useState<OrientationCheckState>('idle')

  useEffect(() => {
    if (!active) {
      setShowHint(false)
      setCheckState('idle')
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShowHint(true)
    }, STUCK_HINT_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [active])

  const runOrientationLockCheck = useCallback(async (): Promise<void> => {
    if (!active || !sensorSupport.supported || checkState === 'checking') {
      return
    }

    setCheckState('checking')

    try {
      if (sensorSupport.requiresPermission) {
        const permissionRequester = getPermissionRequester()
        if (!permissionRequester) {
          setCheckState('idle')
          return
        }

        const permission = await permissionRequester()
        if (permission !== 'granted') {
          setCheckState('idle')
          return
        }
      }

      const sample = await collectOrientationSample()
      if (!sample) {
        setCheckState('idle')
        return
      }

      setCheckState(
        sample.maxAbsGamma >= SIDEWAYS_GAMMA_THRESHOLD
          ? 'lock_likely'
          : 'rotate_more',
      )
    } catch (error: unknown) {
      console.warn('Orientation lock check failed:', error)
      setCheckState('idle')
    }
  }, [active, checkState, sensorSupport])

  return {
    canRunOrientationLockCheck: active && sensorSupport.supported,
    requiresPermission: sensorSupport.requiresPermission,
    showHint,
    checkState,
    runOrientationLockCheck,
  }
}

function getSensorSupport(): SensorSupport {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
    return {
      supported: false,
      requiresPermission: false,
    }
  }

  return {
    supported: true,
    requiresPermission: Boolean(getPermissionRequester()),
  }
}

function getPermissionRequester(): (() => Promise<string>) | null {
  const requester = (
    window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>
    }
  ).requestPermission

  return typeof requester === 'function' ? requester.bind(window.DeviceOrientationEvent) : null
}

function collectOrientationSample(): Promise<{ maxAbsGamma: number; sampleCount: number } | null> {
  return new Promise((resolve) => {
    let sampleCount = 0
    let maxAbsGamma = 0
    let settled = false

    const finish = (
      result: { maxAbsGamma: number; sampleCount: number } | null,
    ): void => {
      if (settled) {
        return
      }

      settled = true
      window.removeEventListener('deviceorientation', handleOrientation)
      window.clearTimeout(timeoutId)
      resolve(result)
    }

    const handleOrientation = (event: DeviceOrientationEvent): void => {
      if (typeof event.gamma !== 'number') {
        return
      }

      sampleCount += 1
      maxAbsGamma = Math.max(maxAbsGamma, Math.abs(event.gamma))

      if (sampleCount >= 3 && maxAbsGamma >= SIDEWAYS_GAMMA_THRESHOLD) {
        finish({ maxAbsGamma, sampleCount })
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (!sampleCount) {
        finish(null)
        return
      }

      finish({ maxAbsGamma, sampleCount })
    }, SAMPLE_DURATION_MS)

    window.addEventListener('deviceorientation', handleOrientation)
  })
}
