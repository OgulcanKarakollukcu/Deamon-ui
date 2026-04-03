import { useCallback, useEffect, useRef, useState } from 'react'
import type { CameraErrorState, FlashModeOption } from '../types/scanner'

const FLASH_LEVEL_PRESETS = [
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
] as const

const FLASH_RANGE_KEYS = ['torchIntensity', 'brightness', 'exposureCompensation'] as const

type FlashRangeKey = (typeof FLASH_RANGE_KEYS)[number]

interface FlashRangeCapability {
  key: FlashRangeKey
  min: number
  max: number
  step: number | null
}

interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean
  fillLightMode?: string[]
  torchIntensity?: MediaSettingsRange
  brightness?: MediaSettingsRange
  exposureCompensation?: MediaSettingsRange
}

interface ExtendedTrackSettings extends MediaTrackSettings {
  torch?: boolean
  fillLightMode?: string
  torchIntensity?: number
  brightness?: number
  exposureCompensation?: number
}

export interface ScannerCameraState {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  setVideoRef: (node: HTMLVideoElement | null) => void
  devices: MediaDeviceInfo[]
  activeDeviceId: string | null
  switchCamera: (deviceId: string) => void
  restartCamera: () => Promise<void>
  error: CameraErrorState | null
  isReady: boolean
  torchSupported: boolean
  torchEnabled: boolean
  torchBusy: boolean
  flashMode: string
  flashModeOptions: FlashModeOption[]
  applyFlashMode: (mode: string) => Promise<void>
  toggleTorch: () => Promise<void>
}

/**
 * Provides camera stream, device switching and flash controls.
 */
export function useScannerCamera(): ScannerCameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const flashRangeRef = useRef<FlashRangeCapability | null>(null)
  const flashRestoreValueRef = useRef<number | null>(null)
  const switchDebounceRef = useRef<number | null>(null)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<CameraErrorState | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [torchBusy, setTorchBusy] = useState(false)
  const [flashMode, setFlashMode] = useState('off')
  const [flashModeOptions, setFlashModeOptions] = useState<FlashModeOption[]>([])

  const enumerateDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput')
      setDevices(videoDevices)
      return videoDevices
    } catch {
      return []
    }
  }, [])

  const syncTorchState = useCallback((stream: MediaStream): void => {
    const track = stream.getVideoTracks()[0]
    if (!track) {
      setTorchSupported(false)
      setTorchEnabled(false)
      setFlashMode('off')
      setFlashModeOptions([])
      return
    }

    const capabilities =
      typeof track.getCapabilities === 'function'
        ? (track.getCapabilities() as ExtendedTrackCapabilities)
        : {}

    const settings = track.getSettings() as ExtendedTrackSettings

    const supportsTorch =
      capabilities.torch === true ||
      (Array.isArray(capabilities.fillLightMode) &&
        capabilities.fillLightMode.includes('flash'))

    const flashRange = getFlashRangeCapability(capabilities)
    const currentRangeSetting = flashRange ? settings[flashRange.key] : null
    const restoreValue = flashRange
      ? typeof currentRangeSetting === 'number'
        ? currentRangeSetting
        : getRangeMidpoint(flashRange)
      : null

    const nextOptions: FlashModeOption[] = supportsTorch
      ? flashRange
        ? FLASH_LEVEL_PRESETS.map((preset, index) => ({
            id: preset.id,
            label: preset.label,
            value:
              index === 0 ? restoreValue : getRangeValueForLevel(flashRange, index - 1),
          }))
        : [
            { id: 'off', label: 'Off', value: null },
            { id: 'on', label: 'On', value: null },
          ]
      : []

    const nextTorchEnabled =
      Boolean(settings.torch) ||
      settings.fillLightMode === 'flash' ||
      settings.fillLightMode === 'torch'

    setTorchSupported(supportsTorch)
    setTorchEnabled(nextTorchEnabled)
    setFlashModeOptions(nextOptions)

    flashRangeRef.current = flashRange
    flashRestoreValueRef.current = restoreValue

    if (!supportsTorch || !nextTorchEnabled) {
      setFlashMode('off')
      return
    }

    if (!flashRange || nextOptions.length <= 2) {
      setFlashMode('on')
      return
    }

    const currentValueRaw = settings[flashRange.key]
    const currentValue =
      typeof currentValueRaw === 'number' ? currentValueRaw : restoreValue

    setFlashMode(resolveFlashModeFromValue(nextOptions, currentValue))
  }, [])

  const finalizeVideoSetup = useCallback(
    (stream: MediaStream): void => {
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings() ?? {}

      if (typeof settings.deviceId === 'string') {
        setActiveDeviceId(settings.deviceId)
      }

      setIsReady(true)
      void enumerateDevices()
      syncTorchState(stream)
    },
    [enumerateDevices, syncTorchState],
  )

  const attachStreamToVideo = useCallback(
    (videoElement: HTMLVideoElement | null, stream: MediaStream): void => {
      if (!videoElement) {
        return
      }

      const handleLoadedMetadata = (): void => {
        videoElement.onloadedmetadata = null
        void videoElement.play().catch(() => undefined)
        finalizeVideoSetup(stream)
      }

      if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream
      }

      if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
        handleLoadedMetadata()
        return
      }

      videoElement.onloadedmetadata = handleLoadedMetadata
    },
    [finalizeVideoSetup],
  )

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null): void => {
      videoRef.current = node

      if (node && streamRef.current) {
        attachStreamToVideo(node, streamRef.current)
      }
    },
    [attachStreamToVideo],
  )

  const stopStream = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.onloadedmetadata = null
    }
  }, [])

  const startCamera = useCallback(
    async (deviceId: string | null = null): Promise<void> => {
      stopStream()

      setIsReady(false)
      setTorchSupported(false)
      setTorchEnabled(false)
      setFlashMode('off')
      setFlashModeOptions([])
      setError(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          code: 'UNSUPPORTED',
          message:
            'Tarayıcı kamera erişimini desteklemiyor. Lütfen güncel Chrome veya Safari kullanın.',
        })
        return
      }

      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })

        streamRef.current = stream
        attachStreamToVideo(videoRef.current, stream)
      } catch (cameraError: unknown) {
        if (cameraError instanceof DOMException) {
          if (
            cameraError.name === 'NotAllowedError' ||
            cameraError.name === 'PermissionDeniedError'
          ) {
            setError({
              code: 'PERMISSION_DENIED',
              message:
                'Kamera izni verilmedi. Tarayıcı ayarlarından kamera iznini etkinleştirin.',
            })
            return
          }

          if (
            cameraError.name === 'NotFoundError' ||
            cameraError.name === 'DevicesNotFoundError'
          ) {
            setError({
              code: 'NOT_FOUND',
              message: 'Kullanılabilir kamera bulunamadı.',
            })
            return
          }

          if (
            cameraError.name === 'NotReadableError' ||
            cameraError.name === 'TrackStartError'
          ) {
            setError({
              code: 'IN_USE',
              message: 'Kamera başka bir uygulama tarafından kullanılıyor.',
            })
            return
          }

          setError({
            code: 'UNKNOWN',
            message: `Kamera hatası: ${cameraError.message}`,
          })
          return
        }

        setError({
          code: 'UNKNOWN',
          message: 'Kamera başlatılamadı.',
        })
      }
    },
    [attachStreamToVideo, stopStream],
  )

  const applyFlashMode = useCallback(
    async (nextMode: string): Promise<void> => {
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track?.applyConstraints) {
        return
      }

      const capabilities =
        typeof track.getCapabilities === 'function'
          ? (track.getCapabilities() as ExtendedTrackCapabilities)
          : {}

      const supportsTorch =
        capabilities.torch === true ||
        (Array.isArray(capabilities.fillLightMode) &&
          capabilities.fillLightMode.includes('flash'))

      if (!supportsTorch) {
        return
      }

      setTorchBusy(true)

      try {
        const advanced: MediaTrackConstraintSet[] = []
        const torchOn = nextMode !== 'off'

        if (capabilities.torch === true) {
          advanced.push({ torch: torchOn } as MediaTrackConstraintSet)
        } else if (
          Array.isArray(capabilities.fillLightMode) &&
          capabilities.fillLightMode.includes('flash')
        ) {
          advanced.push({ fillLightMode: torchOn ? 'flash' : 'off' } as MediaTrackConstraintSet)
        }

        const flashRange =
          flashRangeRef.current || getFlashRangeCapability(capabilities)

        const selectedOption = flashModeOptions.find((option) => option.id === nextMode)
        if (flashRange && selectedOption) {
          const nextValue =
            nextMode === 'off' ? flashRestoreValueRef.current : selectedOption.value

          if (typeof nextValue === 'number') {
            advanced.push({
              [flashRange.key]: nextValue,
            } as MediaTrackConstraintSet)
          }
        }

        if (!advanced.length) {
          return
        }

        await track.applyConstraints({ advanced })
        if (streamRef.current) {
          syncTorchState(streamRef.current)
        }
      } catch (flashError: unknown) {
        console.warn('Torch toggle failed:', flashError)
        if (streamRef.current) {
          syncTorchState(streamRef.current)
        }
      } finally {
        setTorchBusy(false)
      }
    },
    [flashModeOptions, syncTorchState],
  )

  const toggleTorch = useCallback(async (): Promise<void> => {
    const fallbackOnMode = flashModeOptions.some((option) => option.id === 'medium')
      ? 'medium'
      : flashModeOptions.some((option) => option.id === 'on')
        ? 'on'
        : 'high'

    await applyFlashMode(flashMode === 'off' ? fallbackOnMode : 'off')
  }, [applyFlashMode, flashMode, flashModeOptions])

  const restartCamera = useCallback(async (): Promise<void> => {
    await startCamera(activeDeviceId)
  }, [activeDeviceId, startCamera])

  useEffect(() => {
    void startCamera(null)

    return () => {
      stopStream()
      if (switchDebounceRef.current !== null) {
        window.clearTimeout(switchDebounceRef.current)
      }
    }
  }, [startCamera, stopStream])

  const switchCamera = useCallback(
    (deviceId: string): void => {
      if (switchDebounceRef.current !== null) {
        window.clearTimeout(switchDebounceRef.current)
      }

      switchDebounceRef.current = window.setTimeout(() => {
        void startCamera(deviceId).then(() => {
          setActiveDeviceId(deviceId)
        })
      }, 200)
    },
    [startCamera],
  )

  return {
    videoRef,
    setVideoRef,
    devices,
    activeDeviceId,
    switchCamera,
    restartCamera,
    error,
    isReady,
    torchSupported,
    torchEnabled,
    torchBusy,
    flashMode,
    flashModeOptions,
    applyFlashMode,
    toggleTorch,
  }
}

function getFlashRangeCapability(
  capabilities: ExtendedTrackCapabilities,
): FlashRangeCapability | null {
  for (const key of FLASH_RANGE_KEYS) {
    const capability = capabilities[key]
    if (
      capability &&
      typeof capability.min === 'number' &&
      typeof capability.max === 'number' &&
      capability.max > capability.min
    ) {
      return {
        key,
        min: capability.min,
        max: capability.max,
        step:
          typeof capability.step === 'number' && capability.step > 0
            ? capability.step
            : null,
      }
    }
  }

  return null
}

function getRangeMidpoint(range: FlashRangeCapability): number {
  return snapToRangeStep(range, (range.min + range.max) / 2)
}

function getRangeValueForLevel(range: FlashRangeCapability, index: number): number {
  const positions = [0.35, 0.65, 1]
  const levelRatio = positions[index] ?? 1
  return snapToRangeStep(range, range.min + (range.max - range.min) * levelRatio)
}

function snapToRangeStep(range: FlashRangeCapability, value: number): number {
  const clamped = Math.max(range.min, Math.min(range.max, value))
  if (!range.step) {
    return clamped
  }

  const steps = Math.round((clamped - range.min) / range.step)
  return range.min + steps * range.step
}

function resolveFlashModeFromValue(
  options: FlashModeOption[],
  currentValue: number | null,
): string {
  const activeOptions = options.filter((option) => option.id !== 'off')
  if (!activeOptions.length || typeof currentValue !== 'number') {
    return 'medium'
  }

  return activeOptions.reduce((bestId, option) => {
    const bestOption = activeOptions.find((item) => item.id === bestId)
    if (!bestOption) {
      return option.id
    }

    return Math.abs((option.value ?? 0) - currentValue) <
      Math.abs((bestOption.value ?? 0) - currentValue)
      ? option.id
      : bestId
  }, activeOptions[0].id)
}
