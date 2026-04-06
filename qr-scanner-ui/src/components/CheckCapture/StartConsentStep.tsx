import {
  CircleAlert,
  Clock3,
  FileScan,
  ListChecks,
  SendHorizontal,
} from 'lucide-react'
import { useId, useState } from 'react'

export interface StartConsentStepProps {
  onContinue: () => void
  onBack?: () => void
  customerNationalId?: string
  customerEmail?: string
  inviteExpiresAtText?: string
}

export function StartConsentStep({
  onContinue,
  onBack,
  customerNationalId,
  customerEmail,
  inviteExpiresAtText,
}: StartConsentStepProps) {
  const [imageProcessingConsent, setImageProcessingConsent] = useState(false)
  const [submitTransferConsent, setSubmitTransferConsent] = useState(false)
  const [anonymizedAnalyticsConsent, setAnonymizedAnalyticsConsent] = useState(false)

  const imageProcessingId = useId()
  const submitTransferId = useId()
  const anonymizedAnalyticsId = useId()

  const canContinue = imageProcessingConsent && submitTransferConsent

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
          Güncel akışta çekleri tek tek tarayıp, oturum özetinden şubeye tek seferde
          gönderirsiniz.
        </p>

        {customerNationalId || customerEmail || inviteExpiresAtText ? (
          <div className="mt-4 rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#007A3D]">
              Davet Bilgisi
            </p>
            {customerNationalId ? (
              <p className="mt-2 text-sm text-[#4B4F54]">
                Müşteri TC: <strong>{customerNationalId}</strong>
              </p>
            ) : null}
            {customerEmail ? (
              <p className="mt-1 text-sm text-[#4B4F54]">
                Müşteri Email: <strong>{customerEmail}</strong>
              </p>
            ) : null}
            {inviteExpiresAtText ? (
              <p className="mt-1 text-sm text-[#4B4F54]">
                Link Geçerlilik: <strong>{inviteExpiresAtText}</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              1
            </div>
            <FileScan className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">Çek Tarama</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              Çeki net kadraja alın. QR okunursa çek oturuma otomatik eklenir.
            </p>
          </article>

          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              2
            </div>
            <ListChecks className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">Çoklu Çek</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              İhtiyaç olduğunda Yeni Çek Ekle ile aynı oturuma ek çekler tarayabilirsiniz.
            </p>
          </article>

          <article className="rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE] text-sm font-bold text-[#007A3D]">
              3
            </div>
            <SendHorizontal className="mt-3 h-5 w-5 text-[#007A3D]" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-semibold text-[#4B4F54]">Özet ve Gönderim</h3>
            <p className="mt-1 text-xs leading-5 text-[#6E747B]">
              Oturum özetinde çekleri kontrol edip Çekleri Gönder ile işlemi tek seferde tamamlayın.
            </p>
          </article>
        </div>

        <div className="mt-4 rounded-2xl border border-[#E5EDD5] bg-[#F4FBF6] p-4">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#7DB900]" aria-hidden="true" />
            <p className="text-xs leading-5 text-[#5B6168] sm:text-sm">
              Fotoğraf kalitesi ve QR okunabilirliği süreci doğrudan etkiler. Çek üzerinde
              gölge/parlama olmamasına dikkat edin.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-[#DDEFE3] bg-[#F8FCF9] p-4">
          <div className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#007A3D]" aria-hidden="true" />
            <p className="text-xs leading-5 text-[#5B6168] sm:text-sm">
              Bu link, süresi dolana kadar tekrar açılabilir. Gönderim tamamlandığında link
              otomatik olarak pasif hale gelir.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-[#DCEEE3] bg-white p-5 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-7">
        <h2 className="text-lg font-semibold text-[#4B4F54]">KVKK ve Açık Rıza Onayı</h2>
        <p className="mt-2 text-sm leading-6 text-[#6E747B]">
          Çek tarama ve şubeye gönderim sürecine devam etmek için aşağıdaki onaylar gereklidir.
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
                Çek görüntüsü ve QR verisinin doğrulama amacıyla işlenmesini kabul ediyorum.
                <span className="ml-2 text-xs font-semibold text-[#007A3D]">Zorunlu</span>
              </p>
              <p className="mt-1 text-xs text-[#6E747B]">
                Veriler, çek bilgisini doğrulamak ve işlem güvenliğini sağlamak için kullanılır.
              </p>
            </div>
          </label>

          <label
            htmlFor={submitTransferId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#DFE8E2] bg-[#FCFEFC] p-3"
          >
            <input
              id={submitTransferId}
              type="checkbox"
              checked={submitTransferConsent}
              onChange={(event) => setSubmitTransferConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
            />
            <div>
              <p className="text-sm font-medium text-[#4B4F54]">
                Taranan çek görüntülerinin ve metadata bilgisinin şube ekranına iletilmesini kabul ediyorum.
                <span className="ml-2 text-xs font-semibold text-[#007A3D]">Zorunlu</span>
              </p>
              <p className="mt-1 text-xs text-[#6E747B]">
                Gönderim tamamlandığında link pasif olur ve aynı oturum tekrar gönderilemez.
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
                Bu onay verilmezse sadece zorunlu doğrulama ve gönderim işlemleri uygulanır.
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
            Onayla ve Taramaya Geç
          </button>
        </div>
      </div>
    </section>
  )
}

export default StartConsentStep
