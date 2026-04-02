import { FileText } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { SiteFooter } from '../components/SiteFooter'
import { SideMenu, useMenuState } from '../components/SideMenu'

interface CorporateLoanFormState {
  companyName: string
  taxNumber: string
  authorizedPerson: string
  phone: string
  email: string
  city: string
  annualTurnover: string
  employeeCount: string
  requestedAmount: string
  termMonths: string
  collateralType: string
  notes: string
  commercialConsent: boolean
}

const INITIAL_FORM_STATE: CorporateLoanFormState = {
  companyName: '',
  taxNumber: '',
  authorizedPerson: '',
  phone: '',
  email: '',
  city: '',
  annualTurnover: '',
  employeeCount: '',
  requestedAmount: '',
  termMonths: '24',
  collateralType: 'ipotek',
  notes: '',
  commercialConsent: false,
}

export function KurumsalKredi() {
  const { open, toggle, close } = useMenuState()
  const [form, setForm] = useState<CorporateLoanFormState>(INITIAL_FORM_STATE)
  const [submitted, setSubmitted] = useState(false)

  const updateField = <K extends keyof CorporateLoanFormState>(
    key: K,
    value: CorporateLoanFormState[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitted(true)
  }

  const handleReset = (): void => {
    setForm(INITIAL_FORM_STATE)
    setSubmitted(false)
  }

  return (
    <>
      <main className="flex min-h-screen flex-col bg-white text-slate-900 font-['DM Sans']">
        <header className="flex h-14 items-center border-b border-emerald-100 bg-white px-4">
          <button
            type="button"
            onClick={toggle}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-md text-emerald-700 transition-colors hover:text-emerald-900"
            aria-label="Menüyü aç"
          >
            <span className="h-0.5 w-5 rounded bg-emerald-700" />
            <span className="h-0.5 w-5 rounded bg-emerald-700" />
            <span className="h-0.5 w-5 rounded bg-emerald-700" />
          </button>
          <p className="flex-1 text-center text-sm font-medium text-slate-900">
            Kurumsal Kredi Başvurusu
          </p>
          <span className="w-10" />
        </header>

        <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-3xl border border-[#DDEFE3] bg-white p-5 shadow-[0_6px_20px_rgba(0,122,61,0.08)] sm:p-7">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF4EE]">
                <FileText className="h-6 w-6 text-[#007A3D]" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Kurumsal Kredi Başvurusu
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Bu form demo amaçlıdır. Girilen bilgiler backend&apos;e gönderilmez.
                </p>
              </div>
            </div>

            {submitted ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Demo kurumsal başvuru alındı. Değerlendirme sonucu sistem dışından iletilir.
              </div>
            ) : null}

            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Şirket Ünvanı</span>
                <input
                  type="text"
                  required
                  value={form.companyName}
                  onChange={(event) => updateField('companyName', event.target.value)}
                  placeholder="Örn. ABC Gıda San. ve Tic. A.Ş."
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Vergi No</span>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={form.taxNumber}
                  onChange={(event) => updateField('taxNumber', event.target.value)}
                  placeholder="10 haneli vergi no"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Yetkili Kişi</span>
                <input
                  type="text"
                  required
                  value={form.authorizedPerson}
                  onChange={(event) => updateField('authorizedPerson', event.target.value)}
                  placeholder="Örn. Ayşe Demir"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Telefon</span>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  placeholder="05xx xxx xx xx"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">E-posta</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="info@sirket.com"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">İl</span>
                <input
                  type="text"
                  required
                  value={form.city}
                  onChange={(event) => updateField('city', event.target.value)}
                  placeholder="Örn. İstanbul"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Yıllık Ciro (TL)</span>
                <input
                  type="number"
                  required
                  min={0}
                  value={form.annualTurnover}
                  onChange={(event) => updateField('annualTurnover', event.target.value)}
                  placeholder="Örn. 12000000"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Çalışan Sayısı</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.employeeCount}
                  onChange={(event) => updateField('employeeCount', event.target.value)}
                  placeholder="Örn. 35"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Talep Edilen Tutar (TL)</span>
                <input
                  type="number"
                  required
                  min={0}
                  value={form.requestedAmount}
                  onChange={(event) => updateField('requestedAmount', event.target.value)}
                  placeholder="Örn. 3000000"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Vade</span>
                <select
                  value={form.termMonths}
                  onChange={(event) => updateField('termMonths', event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                >
                  <option value="12">12 Ay</option>
                  <option value="24">24 Ay</option>
                  <option value="36">36 Ay</option>
                  <option value="48">48 Ay</option>
                  <option value="60">60 Ay</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Teminat Türü</span>
                <select
                  value={form.collateralType}
                  onChange={(event) => updateField('collateralType', event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                >
                  <option value="ipotek">İpotek</option>
                  <option value="nakit-blokaj">Nakit Blokaj</option>
                  <option value="kefalet">Kefalet</option>
                  <option value="diger">Diğer</option>
                </select>
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Ek Not</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  placeholder="Talebinizle ilgili ek detaylar..."
                  className="w-full rounded-xl border border-[#D6E5DC] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-[#D6E5DC] bg-[#F8FCF9] p-3 text-sm text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.commercialConsent}
                  onChange={(event) => updateField('commercialConsent', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
                />
                <span>Ticari kampanya ve bilgilendirme iletişimine onay veriyorum. (Opsiyonel)</span>
              </label>

              <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-11 rounded-xl border border-[#D6E5DC] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Temizle
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-[#007A3D] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#018342]"
                >
                  Demo Başvuruyu Gönder
                </button>
              </div>
            </form>
          </div>
        </section>

        <SiteFooter />
      </main>

      <SideMenu open={open} onClose={close} />
    </>
  )
}

export default KurumsalKredi
