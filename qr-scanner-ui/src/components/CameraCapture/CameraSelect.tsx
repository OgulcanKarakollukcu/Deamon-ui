import { useCallback, type ChangeEvent } from 'react'
import type { FlashModeOption } from '../../types/scanner'

export interface CameraSelectProps {
  devices: MediaDeviceInfo[]
  activeDeviceId: string | null
  onSwitch: (deviceId: string) => void
  torchSupported: boolean
  torchEnabled: boolean
  torchBusy: boolean
  flashMode: string
  flashModeOptions: FlashModeOption[]
  onApplyFlashMode: (mode: string) => void
  onToggleTorch: () => void
}

export function CameraSelect({
  devices,
  activeDeviceId,
  onSwitch,
  torchSupported,
  torchEnabled,
  torchBusy,
  flashMode,
  flashModeOptions,
  onApplyFlashMode,
  onToggleTorch,
}: CameraSelectProps) {
  const handleFlip = useCallback((): void => {
    if (devices.length < 2) {
      return
    }

    const currentIndex = devices.findIndex(
      (device) => device.deviceId === activeDeviceId,
    )
    const nextIndex = (currentIndex + 1) % devices.length
    onSwitch(devices[nextIndex].deviceId)
  }, [activeDeviceId, devices, onSwitch])

  const handleSelect = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      onSwitch(event.target.value)
    },
    [onSwitch],
  )

  const showCameraSwitcher = devices.length > 1
  const showTorch = torchSupported
  const showFlashLevels = showTorch && flashModeOptions.length > 2

  if (!showCameraSwitcher && !showTorch) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      {showTorch && !showFlashLevels ? (
        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded-full border text-white transition-transform ${
            torchEnabled
              ? 'border-amber-300/90 bg-amber-400/90 text-black'
              : 'glass border-white/15 bg-black/60'
          } ${torchBusy ? 'opacity-60' : 'active:scale-90'}`}
          onClick={onToggleTorch}
          disabled={torchBusy}
          aria-label={torchEnabled ? 'Flaşı kapat' : 'Flaşı aç'}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M13 2L6 13h4l-1 9 7-11h-4l1-9z" />
          </svg>
        </button>
      ) : null}

      {showFlashLevels ? (
        <div className="glass flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-1.5 py-1">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/80"
            aria-hidden="true"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L6 13h4l-1 9 7-11h-4l1-9z" />
            </svg>
          </span>

          {flashModeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`min-h-[34px] min-w-[42px] rounded-full px-2 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                flashMode === option.id
                  ? 'bg-amber-400/90 text-black'
                  : 'bg-white/8 text-white/65 hover:bg-white/14'
              }`}
              onClick={() => {
                onApplyFlashMode(option.id)
              }}
              disabled={torchBusy}
              aria-label={`Flaş ${option.label}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {showCameraSwitcher && devices.length === 2 ? (
        <button
          type="button"
          className="glass flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white transition-transform active:scale-90"
          onClick={handleFlip}
          aria-label="Kamera değiştir"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 7h-9" />
            <path d="M14 17H5" />
            <polyline points="17 4 20 7 17 10" />
            <polyline points="7 14 4 17 7 20" />
          </svg>
        </button>
      ) : null}

      {showCameraSwitcher && devices.length > 2 ? (
        <div className="glass overflow-hidden rounded-xl border border-white/15 bg-black/60">
          <select
            className="min-h-[44px] min-w-[140px] cursor-pointer appearance-none bg-transparent px-3 py-2 text-sm text-white outline-none"
            value={activeDeviceId ?? ''}
            onChange={handleSelect}
            aria-label="Kamera seç"
          >
            {devices.map((device, index) => (
              <option
                key={device.deviceId}
                value={device.deviceId}
                className="bg-gray-900"
              >
                {device.label || `Kamera ${index + 1}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  )
}

export default CameraSelect
