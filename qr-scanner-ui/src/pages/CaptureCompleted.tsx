import { closePageSafely } from '../utils/closePage'

export function CaptureCompleted() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] px-4 text-[#4B4F54]">
      <section className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-[0_8px_24px_rgba(0,122,61,0.08)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xl text-[#007A3D]">
          ✓
        </div>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">İşleminiz için teşekkür ederiz</h1>
        <p className="mt-2 text-sm text-[#5B6168]">Çekleriniz başarıyla şubeye iletildi.</p>
        <p className="mt-1 text-sm text-[#5B6168]">Bu sayfayı kapatabilirsiniz.</p>

        <button
          type="button"
          onClick={closePageSafely}
          className="mt-5 h-11 w-full rounded-xl bg-[#007A3D] text-sm font-semibold text-white transition-colors hover:bg-[#018342]"
        >
          Sayfayı Kapat
        </button>

        <p className="mt-2 text-[11px] text-[#8A9096]">
          Bazı tarayıcılar güvenlik nedeniyle otomatik kapatmaya izin vermeyebilir.
        </p>
      </section>
    </main>
  )
}

export default CaptureCompleted
