import { useEffect, useState, type RefObject } from 'react'

function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Kamera izni reddedildi. Lütfen tarayıcı izinlerinden kameraya erişimi açın.'
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Kullanılabilir bir kamera bulunamadı.'
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.'
    }

    if (error.name === 'OverconstrainedError') {
      return 'Uygun kamera ayarı bulunamadı.'
    }
  }

  return 'Kamera başlatılamadı. Lütfen tekrar deneyin.'
}

export function useCamera(videoRef: RefObject<HTMLVideoElement>) {
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let isMounted = true
    let mediaStream: MediaStream | null = null

    const stopCamera = (): void => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => {
          track.stop()
        })
        mediaStream = null
      }

      const videoElement = videoRef.current
      if (videoElement) {
        videoElement.srcObject = null
      }
    }

    const startCamera = async (): Promise<void> => {
      if (!window.isSecureContext) {
        if (isMounted) {
          setReady(false)
          setError(
            'iOS Safari kamera için HTTPS ister. Uygulamayı https:// üzerinden açın.',
          )
        }
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        if (isMounted) {
          setReady(false)
          setError(
            'Tarayıcınız kamera API desteği sunmuyor veya sayfa güvenli bağlantıda değil.',
          )
        }
        return
      }

      try {
        setError(null)
        setReady(false)

        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })

        if (!isMounted) {
          stopCamera()
          return
        }

        const videoElement = videoRef.current
        if (!videoElement) {
          stopCamera()
          setError('Kamera görüntüsü video öğesine bağlanamadı.')
          return
        }

        videoElement.srcObject = mediaStream
        await videoElement.play()

        if (!isMounted) {
          stopCamera()
          return
        }

        setReady(true)
      } catch (cameraError: unknown) {
        stopCamera()
        if (isMounted) {
          setReady(false)
          setError(getCameraErrorMessage(cameraError))
        }
      }
    }

    void startCamera()

    return () => {
      isMounted = false
      stopCamera()
    }
  }, [videoRef])

  return { ready, error }
}
