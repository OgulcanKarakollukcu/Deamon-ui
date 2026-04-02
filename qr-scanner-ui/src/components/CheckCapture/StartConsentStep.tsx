import { CircleAlert, FileScan, ScanLine, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'

export interface StartConsentStepProps {
  onContinue: () => void
  onBack?: () => void
}

export function StartConsentStep({ onContinue, onBack }: StartConsentStepProps) {
  const [imageProcessingConsent, setImageProcessingConsent] = useState(false)
  const [automatedAnalysisConsent, setAutomatedAnalysisConsent] = useState(false)
  const [anonymizedAnalyticsConsent, setAnonymizedAnalyticsConsent] = useState(false)

  const imageProcessingId = useId()
  const automatedAnalysisId = useId()
  const anonymizedAnalyticsId = useId()

  const canContinue = imageProcessingConsent && automatedAnalysisConsent

  const handleContinue = (): void => {
    if (!canContinue) {
      return
    }

    onContinue()
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-0 py-6 sm:py-8">
      <div className="rounded-3xl border border-[#DCEEE3] bg-white p-5 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-7">
        <h2 className="text-2xl font-bold text-[#4B4F54]">İşleme Başlamadan Önce</h2>
        <p className="mt-2 text-sm leading-6 text-[#6E747B] sm:text-base">
          Çek doğrulama akışı üç temel adımdan oluşur. Aşağıdaki adımları tamamlayarak
          işlemi hızlıca sonuçlandırabilirsiniz.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              1
            </div>
            <FileScan className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">Çek Fotoğrafı</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              Çeki net şekilde kadraja alın ve tek çekimde fotoğrafı tamamlayın.
            </p>
          </article>

          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              2
            </div>
            <ScanLine className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">QR Doğrulama</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              Çek üzerindeki QR kodu okutun, sistem eşleşmeyi otomatik kontrol etsin.
            </p>
          </article>

          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              3
            </div>
            <ShieldCheck className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">Özet ve Onay</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              Sonuç ekranında bilgileri kontrol edin ve oturumu güvenli biçimde tamamlayın.
            </p>
          </article>
        </div>

        <div className="mt-4 rounded-2xl border border-[#E5EDD5] bg-[#F4FBF6] p-4">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#7DB900]" aria-hidden="true" />
            <p className="text-xs leading-5 text-[#5B6168] sm:text-sm">
              Fotoğraf kalitesi ve QR okunabilirliği, doğrulama hızını doğrudan etkiler.
              İşleme başlamadan önce çek üzerinde gölge/parlama olmadığından emin olun.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-[#DCEEE3] bg-white p-5 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-7">
        <h2 className="text-lg font-semibold text-[#4B4F54]">KVKK ve Görüntü İşleme Onayı</h2>
        <p className="mt-2 text-sm leading-6 text-[#6E747B]">
          Çek doğrulama sürecine devam etmek için aşağıdaki izinleri onaylamanız gerekir.
        </p>

        <div className="mt-4 space-y-3">
          <label
            htmlFor={imageProcessingId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#DFE8E2] bg-[#FCFEFC] p-3"
          >
            <input
              id={imageProcessingId}
              type="checkbox"
              checked={imageProcessingConsent}
              onChange={(event) => setImageProcessingConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
            />
            <div>
              <p className="text-sm font-medium text-[#4B4F54]">
                Çek görüntüsünün doğrulama amacıyla işlenmesini kabul ediyorum.
                <span className="ml-2 text-xs font-semibold text-[#007A3D]">Zorunlu</span>
              </p>
              <p className="mt-1 text-xs text-[#6E747B]">
                Görüntü, çek bilgilerini doğrulamak ve işlem güvenliğini sağlamak için kullanılır.
              </p>
            </div>
          </label>

          <label
            htmlFor={automatedAnalysisId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#DFE8E2] bg-[#FCFEFC] p-3"
          >
            <input
              id={automatedAnalysisId}
              type="checkbox"
              checked={automatedAnalysisConsent}
              onChange={(event) => setAutomatedAnalysisConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
            />
            <div>
              <p className="text-sm font-medium text-[#4B4F54]">
                Görüntünün otomatik analiz (OCR/QR) ile kontrol edilmesini kabul ediyorum.
                <span className="ml-2 text-xs font-semibold text-[#007A3D]">Zorunlu</span>
              </p>
              <p className="mt-1 text-xs text-[#6E747B]">
                Sistem, sahtecilik riskini azaltmak için çek üzerindeki alanları otomatik analiz eder.
              </p>
            </div>
          </label>

          <label
            htmlFor={anonymizedAnalyticsId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#DFE8E2] bg-[#FCFEFC] p-3"
          >
            <input
              id={anonymizedAnalyticsId}
              type="checkbox"
              checked={anonymizedAnalyticsConsent}
              onChange={(event) => setAnonymizedAnalyticsConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
            />
            <div>
              <p className="text-sm font-medium text-[#4B4F54]">
                Anonimleştirilmiş süreç verilerinin hizmet geliştirme amacıyla kullanılmasını kabul
                ediyorum.
                <span className="ml-2 text-xs font-semibold text-[#8A9096]">Opsiyonel</span>
              </p>
              <p className="mt-1 text-xs text-[#6E747B]">
                Bu onay verilmezse sadece doğrulama için zorunlu işleme devam edilir.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="h-11 rounded-xl border border-[#D6E5DC] bg-white px-5 text-sm font-semibold text-[#4B4F54] transition-colors hover:bg-[#F3F8F5]"
            >
              Geri Dön
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
            className={`h-11 rounded-xl px-5 text-sm font-semibold text-white transition-colors ${
              canContinue
                ? 'bg-[#007A3D] hover:bg-[#018342]'
                : 'cursor-not-allowed bg-[#A5A7AA]'
            }`}
          >
            Onayla ve Devam Et
          </button>
        </div>
      </div>
    </section>
  )
}

export default StartConsentStep
