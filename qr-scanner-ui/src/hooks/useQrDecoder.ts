import { useEffect, type RefObject } from 'react'
import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader'

// zxing-wasm içinden dinamik import ile alınacak decode fonksiyonunun tipi.
type ReadBarcodesFromImageData = typeof import('zxing-wasm/reader')['readBarcodesFromImageData']

// Sadece DataMatrix ve QRCode formatlarını tarayarak performansı daraltıyoruz.
const TARGET_FORMATS: ReadInputBarcodeFormat[] = ['DataMatrix', 'QRCode']

// Hook'un çalışması için gerekli video/canvas referansları ve callback opsiyonları.
export interface UseQrDecoderOptions {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  enabled: boolean
  onDetected: (result: string) => void
}

export function useQrDecoder(options: UseQrDecoderOptions): void {
  // Gelen seçenekleri effect içinde kullanmak üzere çözüyoruz.
  const { videoRef, canvasRef, enabled, onDetected } = options

  // Decoder döngüsünü sadece enabled true olduğunda çalıştırır.
  useEffect(() => {
    // Dışarıdan kapalı geldiyse hiçbir tarama döngüsü başlatmıyoruz.
    if (!enabled) {
      return
    }

    // requestAnimationFrame id'sini temizlemek için saklarız.
    let animationFrameId: number | null = null
    // Cleanup sonrası yeni frame planlamayı engelleyen bayrak.
    let isStopped = false
    // Aynı anda birden fazla decode işlemini başlatmamak için kilit bayrağı.
    let isDecoding = false
    // Başarılı sonuç bulunduğunda döngüyü kalıcı olarak durdurmak için bayrak.
    let hasDetected = false
    // Decode fonksiyonunu ilk kullanımda yükleyip sonraki frame'lerde tekrar kullanırız.
    let readBarcodesFromImageData: ReadBarcodesFromImageData | null = null

    // Tarama döngüsünü sonlandırır ve varsa planlı frame'i iptal eder.
    const stopLoop = (): void => {
      isStopped = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    }

    // Döngü hâlâ aktifse bir sonraki frame'de processFrame çağrısını planlar.
    const scheduleNextFrame = (): void => {
      if (!isStopped && !hasDetected) {
        animationFrameId = requestAnimationFrame(processFrame)
      }
    }

    // Her animation frame'de video görüntüsünü canvas'a alıp barkod çözmeyi dener.
    const processFrame = (): void => {
      // Döngü kapandıysa veya zaten sonuç bulunduysa işlem yapmayız.
      if (isStopped || hasDetected) {
        return
      }

      // Önceki decode hâlâ sürüyorsa yeni decode başlatmadan bir sonraki frame'e geçeriz.
      if (isDecoding) {
        scheduleNextFrame()
        return
      }

      // Güncel video ve canvas element referanslarını alıyoruz.
      const videoElement = videoRef.current
      const canvasElement = canvasRef.current

      // Referanslardan biri yoksa döngüyü kesmeden sonraki frame'i bekleriz.
      if (!videoElement || !canvasElement) {
        scheduleNextFrame()
        return
      }

      // Videonun gerçek render edilen çözünürlüğünü alıyoruz.
      const width = videoElement.videoWidth
      const height = videoElement.videoHeight

      // Video henüz metadata yüklemediyse boyut 0 gelebilir; bu durumda bekleriz.
      if (width <= 0 || height <= 0) {
        scheduleNextFrame()
        return
      }

      // Canvas genişliği video ile eşleşmiyorsa güncellenir.
      if (canvasElement.width !== width) {
        canvasElement.width = width
      }
      // Canvas yüksekliği video ile eşleşmiyorsa güncellenir.
      if (canvasElement.height !== height) {
        canvasElement.height = height
      }

      // Görüntüyü okuyabilmek için 2D context alıyoruz.
      const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
      // Context alınamazsa decode yapılamaz; sonraki frame'e geçilir.
      if (!ctx) {
        scheduleNextFrame()
        return
      }

      // Decode başlatıldığını işaretleyip eşzamanlı decode'u engelliyoruz.
      isDecoding = true

      // Async decode işini fire-and-forget başlatıyoruz.
      void (async () => {
        try {
          // Videodaki güncel frame'i canvas'a çiziyoruz.
          ctx.drawImage(videoElement, 0, 0, width, height)
          // Çizilen piksel verisini decoder'a verebilmek için alıyoruz.
          const imageData = ctx.getImageData(0, 0, width, height)

          // İlk decode anında zxing modülünü dinamik import ile yüklüyoruz.
          if (!readBarcodesFromImageData) {
            const readerModule = await import('zxing-wasm/reader')
            readBarcodesFromImageData = readerModule.readBarcodesFromImageData
          }

          // Sadece hedef formatlarda barkod çözümlemesini çalıştırıyoruz.
          const results = await readBarcodesFromImageData(imageData, {
            formats: TARGET_FORMATS,
          })

          // En az bir sonuç varsa ilkini alıp döngüyü durduruyoruz.
          if (results.length > 0) {
            const firstResult = results[0]
            hasDetected = true
            stopLoop()
            // Bulunan metni üst bileşene iletiyoruz.
            onDetected(firstResult.text)
            return
          }
        } catch (decodeError: unknown) {
          // Decode sırasında hata olursa loglayıp döngüyü tamamen öldürmüyoruz.
          console.error('QR decode loop error:', decodeError)
        } finally {
          // Bu frame decode işi bitti; kilidi kaldırıyoruz.
          isDecoding = false
          // Döngü durdurulmadıysa taramaya bir sonraki frame ile devam ediyoruz.
          if (!isStopped && !hasDetected) {
            scheduleNextFrame()
          }
        }
      })()
    }

    // Effect başladığında ilk frame planlamasını yapıyoruz.
    scheduleNextFrame()

    // Cleanup: component unmount veya bağımlılık değişiminde döngüyü durdurur.
    return () => {
      stopLoop()
    }
  }, [canvasRef, enabled, onDetected, videoRef])
}
