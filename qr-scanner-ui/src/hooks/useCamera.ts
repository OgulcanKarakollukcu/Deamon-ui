import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

// Standart MediaTrackCapabilities tipine torch ve zoom alanlarını ekliyoruz.
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean
  zoom?: MediaSettingsRange
}

// Track ayarlarından torch/zoom değerini okuyabilmek için genişletilmiş tip.
interface ExtendedMediaTrackSettings extends MediaTrackSettings {
  torch?: boolean
  zoom?: number
}

// applyConstraints çağrısında torch/zoom gönderebilmek için genişletilmiş tip.
interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean
  zoom?: number
}

// Kameraya ait kontrol durumlarını ve dışarı açılan fonksiyonları tanımlıyoruz.
interface CameraControlState {
  torchSupported: boolean
  torchEnabled: boolean
  setTorchEnabled: (enabled: boolean) => Promise<void>
  zoomSupported: boolean
  zoom: number
  minZoom: number
  maxZoom: number
  zoomStep: number
  setZoom: (value: number) => Promise<void>
}

// Hook dışarıya hazır olma, hata ve kontrol nesnesini döndürür.
interface UseCameraResult {
  ready: boolean
  error: string | null
  controls: CameraControlState
}

// Tarayıcıdan gelen kamera hatalarını kullanıcıya anlamlı Türkçe metinlere çevirir.
function getCameraErrorMessage(error: unknown): string {
  // DOMException ise hata türüne göre daha spesifik mesaj üretiyoruz.
  if (error instanceof DOMException) {
    // Kullanıcı kamera iznini vermediyse.
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Kamera izni reddedildi. Lütfen tarayıcı izinlerinden kameraya erişimi açın.'
    }

    // Cihazda erişilebilir bir kamera bulunamadıysa.
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Kullanılabilir bir kamera bulunamadı.'
    }

    // Kamera başka bir süreç tarafından kilitlendiyse.
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.'
    }

    // İstenen kamera kısıtları cihazda sağlanamıyorsa.
    if (error.name === 'OverconstrainedError') {
      return 'Uygun kamera ayarı bulunamadı.'
    }
  }

  // Eşleşmeyen tüm durumlar için genel mesaj.
  return 'Kamera başlatılamadı. Lütfen tekrar deneyin.'
}

export function useCamera(videoRef: RefObject<HTMLVideoElement>): UseCameraResult {
  // Kamera başlatma sürecindeki hata bilgisini tutar.
  const [error, setError] = useState<string | null>(null)
  // Kameranın başarıyla bağlanıp oynatılabildiğini belirtir.
  const [ready, setReady] = useState(false)
  // Cihazın flaş (torch) desteği verip vermediğini belirtir.
  const [torchSupported, setTorchSupported] = useState(false)
  // Flaşın açık/kapalı durumunu tutar.
  const [torchEnabled, setTorchEnabled] = useState(false)
  // Cihazın zoom ayarını destekleyip desteklemediğini belirtir.
  const [zoomSupported, setZoomSupported] = useState(false)
  // Anlık zoom değerini tutar.
  const [zoom, setZoom] = useState(1)
  // Cihazın izin verdiği minimum zoom değeri.
  const [minZoom, setMinZoom] = useState(1)
  // Cihazın izin verdiği maksimum zoom değeri.
  const [maxZoom, setMaxZoom] = useState(1)
  // Zoom slider/adım hesaplarında kullanılacak artış değeri.
  const [zoomStep, setZoomStep] = useState(0.1)
  // Aktif video track referansını daha sonra torch/zoom uygulamak için saklıyoruz.
  const trackRef = useRef<MediaStreamTrack | null>(null)

  // Verilen constraint'i aktif track'e uygular; başarılıysa true döner.
  const applyTrackConstraints = useCallback(
    async (constraint: ExtendedMediaTrackConstraintSet): Promise<boolean> => {
      // Track henüz hazır değilse constraint uygulanamaz.
      const track = trackRef.current
      if (!track) {
        return false
      }

      try {
        // Torch/zoom gibi gelişmiş ayarları tek bir advanced nesnesiyle uyguluyoruz.
        await track.applyConstraints({
          advanced: [constraint as MediaTrackConstraintSet],
        })
        // Uygulama başarılıysa çağırana başarı bilgisi dönüyoruz.
        return true
      } catch {
        // Cihaz desteklemeyen bir constraint alırsa sessizce false dönüp UI'ı koruyoruz.
        return false
      }
    },
    [],
  )

  // Torch durumunu değiştiren dış fonksiyon.
  const setTorch = useCallback(
    async (enabled: boolean): Promise<void> => {
      // Cihaz torch desteklemiyorsa hiçbir işlem yapmıyoruz.
      if (!torchSupported) {
        return
      }

      // Track'e yeni torch ayarını uyguluyoruz.
      const updated = await applyTrackConstraints({ torch: enabled })
      // Track güncellenirse local state'i senkronluyoruz.
      if (updated) {
        setTorchEnabled(enabled)
      }
    },
    [applyTrackConstraints, torchSupported],
  )

  // Zoom değerini güncelleyen dış fonksiyon.
  const setZoomValue = useCallback(
    async (value: number): Promise<void> => {
      // Cihaz zoom desteklemiyorsa çağrıyı no-op olarak bırakıyoruz.
      if (!zoomSupported) {
        return
      }

      // Gelen değeri cihazın min/max aralığına sıkıştırıyoruz.
      const clamped = Math.min(maxZoom, Math.max(minZoom, value))
      // Sıkıştırılmış değeri track constraint olarak uyguluyoruz.
      const updated = await applyTrackConstraints({ zoom: clamped })
      // Uygulama başarılıysa state'i güncel zoom ile eşitliyoruz.
      if (updated) {
        setZoom(clamped)
      }
    },
    [applyTrackConstraints, maxZoom, minZoom, zoomSupported],
  )

  // Hook mount olduğunda kamerayı başlatır; unmount olduğunda temizler.
  useEffect(() => {
    // Asenkron işlemler tamamlandığında bileşen hâlâ mounted mı kontrol eder.
    let isMounted = true
    // getUserMedia ile açılan stream'i cleanup için saklıyoruz.
    let mediaStream: MediaStream | null = null

    // Kamera kontrollerine ait tüm state'i varsayılanlarına döndürür.
    const resetControls = (): void => {
      setTorchSupported(false)
      setTorchEnabled(false)
      setZoomSupported(false)
      setZoom(1)
      setMinZoom(1)
      setMaxZoom(1)
      setZoomStep(0.1)
      trackRef.current = null
    }

    // Aktif stream/track/video bağlantılarını güvenli biçimde kapatır.
    const stopCamera = (): void => {
      // Açık bir media stream varsa tüm track'leri durduruyoruz.
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => {
          track.stop()
        })
        mediaStream = null
      }

      // Video elementinin stream referansını temizliyoruz.
      const videoElement = videoRef.current
      if (videoElement) {
        videoElement.srcObject = null
      }

      // Torch/zoom gibi kontrol state'lerini sıfırlıyoruz.
      resetControls()
    }

    // Kamerayı güvenli şekilde başlatır ve video elementine bağlar.
    const startCamera = async (): Promise<void> => {
      // iOS Safari gibi ortamlarda kamera için HTTPS zorunludur.
      if (!window.isSecureContext) {
        if (isMounted) {
          setReady(false)
          setError(
            'iOS Safari kamera için HTTPS ister. Uygulamayı https:// üzerinden açın.',
          )
        }
        return
      }

      // Tarayıcı kamera API'sini desteklemiyorsa kullanıcıyı bilgilendiriyoruz.
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
        // Yeni başlangıç denemesinde eski hata ve ready bilgilerini sıfırlıyoruz.
        setError(null)
        setReady(false)

        // Arka kamerayı tercih edip yüksek çözünürlükte stream talep ediyoruz.
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        // Bileşen unmount olduysa açılan stream'i hemen kapatıyoruz.
        if (!isMounted) {
          stopCamera()
          return
        }

        // Kamera görüntüsünün bağlanacağı video elementini alıyoruz.
        const videoElement = videoRef.current
        if (!videoElement) {
          // Video elementi yoksa stream'i kapatıp hata döndürüyoruz.
          stopCamera()
          setError('Kamera görüntüsü video öğesine bağlanamadı.')
          return
        }

        // Stream içindeki ilk video track'i torch/zoom ayarları için saklıyoruz.
        const videoTrack = mediaStream.getVideoTracks()[0] ?? null
        trackRef.current = videoTrack

        // Video elementine stream'i bağlıyor ve oynatmayı başlatıyoruz.
        videoElement.srcObject = mediaStream
        await videoElement.play()

        // Oynatma sırasında unmount olduysa temiz kapatma yapıyoruz.
        if (!isMounted) {
          stopCamera()
          return
        }

        // Tarayıcı capability API'si destekliyorsa torch/zoom bilgilerini okuyoruz.
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          // Cihazın desteklediği aralıkları/capabilities bilgisini alıyoruz.
          const capabilities =
            videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities
          // Track'in mevcut ayarlarını alıp başlangıç state'i için kullanıyoruz.
          const settings = videoTrack.getSettings() as ExtendedMediaTrackSettings

          // Torch desteğini capability bilgisinden çıkarıyoruz.
          const hasTorch = capabilities.torch === true
          setTorchSupported(hasTorch)
          // Torch destekleniyorsa mevcut ayarı, değilse false değerini yazıyoruz.
          setTorchEnabled(hasTorch ? Boolean(settings.torch) : false)

          // Zoom capability nesnesi varsa aralık/step bilgilerini hesaplıyoruz.
          const zoomCapability = capabilities.zoom
          if (zoomCapability) {
            // Gelen değerler number değilse güvenli varsayılanlarla devam ediyoruz.
            const rawMin =
              typeof zoomCapability.min === 'number' ? zoomCapability.min : 1
            const rawMax =
              typeof zoomCapability.max === 'number' ? zoomCapability.max : 1
            const rawStep =
              typeof zoomCapability.step === 'number' ? zoomCapability.step : 0.1
            // NaN/Infinity riskini ortadan kaldırmak için son kontrolü yapıyoruz.
            const capabilityMin = Number.isFinite(rawMin) ? rawMin : 1
            const capabilityMax = Number.isFinite(rawMax) ? rawMax : 1
            const capabilityStep =
              Number.isFinite(rawStep) && rawStep > 0
                ? rawStep
                : 0.1
            // Track settings içinde zoom varsa onu başlangıç değeri yapıyoruz.
            const settingsZoom =
              typeof settings.zoom === 'number' ? settings.zoom : capabilityMin
            // Başlangıç zoom'unu min/max aralığına sıkıştırıyoruz.
            const initialZoom = Math.min(
              capabilityMax,
              Math.max(capabilityMin, settingsZoom),
            )

            // Zoom desteği ve aralık bilgisini state'e yansıtıyoruz.
            setZoomSupported(capabilityMax > capabilityMin)
            setMinZoom(capabilityMin)
            setMaxZoom(capabilityMax)
            setZoomStep(capabilityStep)
            setZoom(initialZoom)
          }
        }

        // Buraya geldiysek kamera başarıyla hazır.
        setReady(true)
      } catch (cameraError: unknown) {
        // Hata durumunda açık kaynakları kapatıp kullanıcıya anlamlı mesaj veriyoruz.
        stopCamera()
        if (isMounted) {
          setReady(false)
          setError(getCameraErrorMessage(cameraError))
        }
      }
    }

    // Effect başladığında kamerayı asenkron olarak başlatıyoruz.
    void startCamera()

    // Effect cleanup: unmount/bağımlılık değişiminde kamerayı durduruyoruz.
    return () => {
      isMounted = false
      stopCamera()
    }
  }, [videoRef])

  // Dışarıya kamera hazırlık bilgisi, hata ve kontrol API'sini döndürüyoruz.
  return {
    ready,
    error,
    controls: {
      torchSupported,
      torchEnabled,
      setTorchEnabled: setTorch,
      zoomSupported,
      zoom,
      minZoom,
      maxZoom,
      zoomStep,
      setZoom: setZoomValue,
    },
  }
}
