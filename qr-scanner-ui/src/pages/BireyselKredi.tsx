import { FileText } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { SiteFooter } from '../components/SiteFooter'
import { SideMenu, useMenuState } from '../components/SideMenu'

interface IndividualLoanFormState {
  fullName: string
  nationalId: string
  phone: string
  email: string
  monthlyIncome: string
  requestedAmount: string
  termMonths: string
  employmentType: string
  city: string
  notes: string
  marketingConsent: boolean
}

const INITIAL_FORM_STATE: IndividualLoanFormState = {
  fullName: '',
  nationalId: '',
  phone: '',
  email: '',
  monthlyIncome: '',
  requestedAmount: '',
  termMonths: '24',
  employmentType: 'ucretli-calisan',
  city: '',
  notes: '',
  marketingConsent: false,
}

export function BireyselKredi() {
  const { open, toggle, close } = useMenuState()
  const [form, setForm] = useState<IndividualLoanFormState>(INITIAL_FORM_STATE)
  const [submitted, setSubmitted] = useState(false)

  const updateField = <K extends keyof IndividualLoanFormState>(
    key: K,
    value: IndividualLoanFormState[K],
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
            Bireysel Kredi Başvurusu
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
                  Bireysel Kredi Başvurusu
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Bu form demo amaçlıdır. Girilen bilgiler backend&apos;e gönderilmez.
                </p>
              </div>
            </div>

            {submitted ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Demo başvuru alındı. İnceleme sonucu ekranınızda gösterilmeyecektir.
              </div>
            ) : null}

            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Ad Soyad</span>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(event) => updateField('fullName', event.target.value)}
                  placeholder="Örn. Ahmet Yılmaz"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">T.C. Kimlik No</span>
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={form.nationalId}
                  onChange={(event) => updateField('nationalId', event.target.value)}
                  placeholder="11 haneli numara"
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
                  placeholder="ornek@mail.com"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Aylık Gelir (TL)</span>
                <input
                  type="number"
                  required
                  min={0}
                  value={form.monthlyIncome}
                  onChange={(event) => updateField('monthlyIncome', event.target.value)}
                  placeholder="Örn. 45000"
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
                  placeholder="Örn. 250000"
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
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Çalışma Durumu</span>
                <select
                  value={form.employmentType}
                  onChange={(event) => updateField('employmentType', event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                >
                  <option value="ucretli-calisan">Ücretli Çalışan</option>
                  <option value="serbest-meslek">Serbest Meslek</option>
                  <option value="emekli">Emekli</option>
                  <option value="diger">Diğer</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">İl</span>
                <input
                  type="text"
                  value={form.city}
                  onChange={(event) => updateField('city', event.target.value)}
                  placeholder="Örn. İstanbul"
                  className="h-11 w-full rounded-xl border border-[#D6E5DC] px-3 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Ek Not</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  placeholder="Başvuru hakkında paylaşmak istediğiniz ek bilgi..."
                  className="w-full rounded-xl border border-[#D6E5DC] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#7DB900] focus:ring-2 focus:ring-[#7DB900]/20"
                />
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-[#D6E5DC] bg-[#F8FCF9] p-3 text-sm text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={(event) => updateField('marketingConsent', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#9CBCA8] text-[#007A3D] focus:ring-[#7DB900]"
                />
                <span>Kampanya ve bilgilendirme amaçlı iletişim izni veriyorum. (Opsiyonel)</span>
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

export default BireyselKredi
