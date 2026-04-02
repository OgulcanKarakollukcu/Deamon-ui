import { type CSSProperties } from 'react'
import {
  ChartNoAxesColumnIncreasing,
  CircleCheckBig,
  Fingerprint,
  Gauge,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface LandingHighlight {
  title: string
  description: string
  icon: LucideIcon
}

const HIGHLIGHTS: LandingHighlight[] = [
  {
    title: 'Hızlı Operasyon',
    description: 'Çek fotoğrafı ve QR doğrulaması tek akışta tamamlanır.',
    icon: Gauge,
  },
  {
    title: 'Güvenli Süreç',
    description: 'Kontroller standartlaşır, şube süreçlerinde hata riski azalır.',
    icon: Fingerprint,
  },
  {
    title: 'Net İzlenebilirlik',
    description: 'Oturum bazlı kayıtlarla tüm adımlar görünür ve raporlanabilir.',
    icon: ChartNoAxesColumnIncreasing,
  },
]

const VALUE_POINTS = [
  'Manuel kontrol yükünü azaltarak ekip verimliliğini artırır.',
  'Daha tutarlı doğrulama ile operasyon kalitesini yükseltir.',
  'Şube iş akışına uyumlu, sade ve hızlı bir kullanım deneyimi sunar.',
]

export interface LandingProps {
  onStart?: () => void
  embedded?: boolean
}

export function Landing({ onStart, embedded = false }: LandingProps) {
  const navigate = useNavigate()
  const heroImageAnimationStyle: CSSProperties = {
    animation: 'fadeSlideUp 480ms ease-out 80ms both',
  }
  const buttonAnimationStyle: CSSProperties = {
    animation: 'fadeSlideUp 480ms ease-out 150ms both',
  }

  const handleStart = (): void => {
    if (onStart) {
      onStart()
      return
    }

    navigate('/home')
  }

  const WrapperTag = embedded ? 'section' : 'main'
  const shellClass = embedded
    ? 'flex min-h-[calc(100vh-7rem)] flex-col bg-white text-slate-900'
    : 'flex min-h-dvh flex-col bg-white text-slate-900'
  const innerClass = embedded
    ? 'mx-auto flex w-full max-w-3xl flex-1 flex-col px-0 py-6 sm:px-6'
    : 'mx-auto flex w-full max-w-3xl flex-1 flex-col px-0 py-8 sm:px-6'

  return (
    <WrapperTag className={shellClass}>
      <style>
        {`@keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }`}
      </style>

      <div
        style={heroImageAnimationStyle}
        className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-y border-[#DDEFE3] bg-white shadow-[0_8px_18px_rgba(0,122,61,0.12)] lg:left-auto lg:right-auto lg:mx-auto"
      >
        <img
          src="/hero-seker.png"
          alt="Şekerbank istihbarat sistemi hero görseli"
          className="h-52 w-full object-cover sm:h-64 lg:h-[32rem] xl:h-[36rem]"
        />
      </div>

      <div className={innerClass}>
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          

          <div className="w-full px-4">
            <span className="inline-flex items-center rounded-full border border-[#CDE7D6] bg-[#F4FBF6] px-3 py-1 text-xs font-semibold tracking-wide text-[#007A3D]">
              Şube Operasyonları İçin Yeni Nesil Yardımcı
            </span>

            <h1 className="mt-4 text-3xl font-bold leading-tight text-[#4B4F54] sm:text-4xl">
              İstihbarat Sistemi ile
              <span className="block text-[#007A3D]">çek süreçlerini hızlandırın</span>
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#6E747B] sm:text-base">
              Çek yakalama, QR okuma ve doğrulama adımlarını tek bir akışta birleştirerek
              operasyonu daha hızlı, daha güvenli ve daha ölçülebilir hale getirin.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon

                return (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-[#DDEFE3] bg-white p-4 shadow-[0_2px_8px_rgba(0,122,61,0.08)]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4EE]">
                      <Icon className="h-4 w-4 text-[#007A3D]" aria-hidden="true" />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-[#4B4F54]">{item.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-[#6E747B]">{item.description}</p>
                  </article>
                )
              })}
            </div>

            <section className="mt-5 rounded-2xl border border-[#DDEFE3] bg-[#F7FBF8] p-4 text-left sm:p-5">
              <p className="text-sm font-semibold text-[#007A3D]">
                Neden İstihbarat Sistemi?
              </p>
              <ul className="mt-3 space-y-2">
                {VALUE_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-[#4B4F54]">
                    <CircleCheckBig
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#007A3D]"
                      aria-hidden="true"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <button
            type="button"
            onClick={handleStart}
            style={buttonAnimationStyle}
            className="mt-7 h-14 w-full max-w-xs rounded-2xl bg-[#007A3D] text-lg font-semibold text-white shadow-[0_10px_20px_rgba(0,122,61,0.25)] transition-transform hover:bg-[#018342] active:scale-95"
          >
            Hemen Başla
          </button>
          <p className="mt-3 text-xs text-[#8A9096]">
            Ortalama birkaç adımda işlem tamamlanır.
          </p>
        </div>
      </div>
    </WrapperTag>
  )
}

export default Landing
