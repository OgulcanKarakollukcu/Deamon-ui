import { Eye, EyeOff, Lock, LogIn, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { loginEmployee } from '../services/authClient'
import { setAuthSession } from '../services/authStorage'

type LoginPageProps = {
  onLoginSuccess: (username: string) => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await loginEmployee({ username, password })
      setAuthSession(response.token, response.username, response.expires_at)
      onLoginSuccess(response.username)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EDF0ED] px-4 py-8 dark:bg-[#050605]">
      <section className="w-full max-w-5xl">
        <header className="mb-5 flex justify-center">
          <img src="/sekerbank-logo-2.png" alt="Şekerbank" className="h-10 w-auto object-contain sm:h-12" />
        </header>

        <div className="overflow-hidden rounded-2xl border border-[#D5DED7] bg-white shadow-[0_14px_34px_rgba(34,54,43,0.12)] dark:border-[#203328] dark:bg-[#0f1713]">
          <div className="grid md:grid-cols-[minmax(0,1fr)_420px]">
            <aside className="border-b border-[#DDE6E0] bg-[#0E5B36] p-6 text-white md:border-b-0 md:border-r md:border-r-[#1d7448] md:p-10">
              <h1 className="text-2xl font-semibold leading-tight">Apex Çek İstihbarat Paneli</h1>
              <p className="mt-3 max-w-xl text-sm text-white/85">
                Müşteriye gönderilen çek linklerinden gelen verileri şube operasyon akışı içinde tek ekrandan yönetin.
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-2 text-white/90">
                  <ShieldCheck className="h-4 w-4" />
                  Şube çalışanı müşteriye tek kullanımlık link gönderir.
                </li>
                <li className="flex items-center gap-2 text-white/90">
                  <ShieldCheck className="h-4 w-4" />
                  Müşteri çek görüntülerini ve QR verilerini güvenli oturumda iletir.
                </li>
                <li className="flex items-center gap-2 text-white/90">
                  <ShieldCheck className="h-4 w-4" />
                  İstihbarat ekranı kayıtları listeler, detay ve kontrolü tek akışta sunar.
                </li>
              </ul>
            </aside>

            <div className="p-5 sm:p-7 md:p-8">
              <header className="mb-6 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A3D] text-white">
                  <Lock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-[#3F4540] dark:text-[#e5ebe7]">Banka Çalışanı Girişi</h2>
                  <p className="text-xs text-[#6D746F] dark:text-[#a7b5ad]">Yetkili kullanıcı bilgilerinizi girin</p>
                </div>
              </header>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <label className="block space-y-1 text-xs font-medium text-[#54605A] dark:text-[#c0cdc6]">
                  Kullanıcı Adı
                  <input
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-12 w-full rounded-lg border border-[#C8D7CD] bg-white px-3 text-[16px] text-[#3F4540] outline-none transition focus:border-[#0E8A48] focus:ring-2 focus:ring-[#0E8A48]/20 dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-[#54605A] dark:text-[#c0cdc6]">
                  Şifre
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 w-full rounded-lg border border-[#C8D7CD] bg-white px-3 pr-11 text-[16px] text-[#3F4540] outline-none transition focus:border-[#0E8A48] focus:ring-2 focus:ring-[#0E8A48]/20 dark:border-[#325a44] dark:bg-[#0f1a13] dark:text-[#e5ebe7]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((previous) => !previous)}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#6D746F] transition hover:bg-[#EEF5F0] hover:text-[#007A3D] dark:text-[#a7b5ad] dark:hover:bg-[#1c2f24] dark:hover:text-[#9bd8b3]"
                      aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {error ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#007A3D] px-4 text-sm font-semibold text-white transition hover:bg-[#0B8A47] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
