import {
  Landmark,
  PhoneCall,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import type { IconType } from 'react-icons'
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6'

interface SupportLinkItem {
  label: string
  href: string
  icon: LucideIcon
}

interface SocialLinkItem {
  label: string
  href: string
  icon: IconType
}

interface FooterGroup {
  title: string
  links: ReadonlyArray<{
    label: string
    href: string
  }>
}

const SUPPORT_LINKS = [
  {
    label: 'Bize Ulaşın',
    href: 'https://www.sekerbank.com.tr/hakkimizda/iletisim',
    icon: PhoneCall,
  },
  {
    label: "Şube ve ATM'ler",
    href: 'https://www.sekerbank.com.tr/dijital-bankacilik/sube-ve-atmler',
    icon: Landmark,
  },
  {
    label: 'Dijital Bankacılık',
    href: 'https://www.sekerbank.com.tr/dijital-bankacilik',
    icon: Smartphone,
  },
] satisfies SupportLinkItem[]

const FOOTER_GROUPS = [
  {
    title: 'Bankacılık',
    links: [
      { label: 'Bireysel Bankacılık', href: 'https://www.sekerbank.com.tr/bireysel' },
      { label: 'Tarım Bankacılığı', href: 'https://www.sekerbank.com.tr/tarim' },
      { label: 'Esnaf/KOBİ Bankacılığı', href: 'https://www.sekerbank.com.tr/esnaf-kobi' },
      { label: 'Kurumsal Bankacılık', href: 'https://www.sekerbank.com.tr/kurumsal' },
      { label: 'Dijital Bankacılık', href: 'https://www.sekerbank.com.tr/dijital-bankacilik' },
      { label: 'Hakkımızda', href: 'https://www.sekerbank.com.tr/hakkimizda' },
    ],
  },
  {
    title: 'Popüler',
    links: [
      {
        label: 'Traktör ve Tarım Ekipmanları Kredisi',
        href: 'https://www.sekerbank.com.tr/tarim/tarim-kredileri/aile-ciftciligi/traktor-ve-tarim-ekipmanlari-kredisi',
      },
      {
        label: 'Emekli Promosyon Başvurusu',
        href: 'https://www.sekerbank.com.tr/bireysel/emekli-bankaciligi',
      },
      {
        label: 'Taksitli Tarım Kredisi',
        href: 'https://www.sekerbank.com.tr/tarim/tarim-kredileri/tarimsal-isletme-kredileri/taksitli-tarim-kredisi',
      },
      {
        label: 'Kredi Kartı Başvurusu',
        href: 'https://www.sekerbank.com.tr/bireysel/kart-urunleri/kredi-kartlari/kart-basvurusu',
      },
      {
        label: 'Hesaplama Araçları',
        href: 'https://www.sekerbank.com.tr/hesaplama-araclari',
      },
    ],
  },
  {
    title: 'Destek',
    links: [
      { label: 'İletişim', href: 'https://www.sekerbank.com.tr/hakkimizda/iletisim' },
      { label: 'Güvenlik', href: 'https://www.sekerbank.com.tr/guvenlik' },
      {
        label: 'Şube ve ATMler',
        href: 'https://www.sekerbank.com.tr/dijital-bankacilik/sube-ve-atmler',
      },
      {
        label: 'Basın Bültenleri',
        href: 'https://www.sekerbank.com.tr/hakkimizda/basin-odasi#basin-bultenleri',
      },
      {
        label: 'Duyurular',
        href: 'https://www.sekerbank.com.tr/hakkimizda/basin-odasi#duyurular',
      },
      {
        label: 'Bilgi Toplumu Hizmeti',
        href: 'https://www.sekerbank.com.tr/hakkimizda/bilgi-toplumu-hizmetleri',
      },
    ],
  },
  {
    title: 'Yasal',
    links: [
      {
        label: 'Sözleşmeler',
        href: 'https://www.sekerbank.com.tr/bireysel/bireysel-krediler/sozlesme-ve-formlar',
      },
      {
        label: 'Kişisel Verilerin Korunması',
        href: 'https://www.sekerbank.com.tr/hakkimizda/kisisel-verilerin-korunmasi',
      },
      {
        label: 'Satılık Gayrimenkuller',
        href: 'https://www.sekerbank.com.tr/hakkimizda/satilik-gayrimenkuller',
      },
      {
        label: 'Yatırımcı İlişkileri',
        href: 'https://www.sekerbank.com.tr/hakkimizda/yatirimci-iliskileri',
      },
      {
        label: 'Zaman Aşımına Uğrayan Mevduatlar',
        href: 'https://www.sekerbank.com.tr/bireysel/zaman-asimina-ugrayan-mevduatlar',
      },
      {
        label: 'Müşteri Şikayetleri',
        href: 'https://www.sekerbank.com.tr/harcama-itirazi-ve-musteri-sikayetleri',
      },
    ],
  },
] as const satisfies ReadonlyArray<FooterGroup>

const AFFILIATE_LINKS = [
  { label: 'Şeker Yatırım', href: 'https://www.sekeryatirim.com.tr/' },
  { label: 'Şeker Faktoring', href: 'https://www.sekerfactoring.com/' },
  { label: 'Şeker Leasing', href: 'https://www.sekerleasing.com.tr/' },
  { label: 'Şekerbank Kıbrıs', href: 'https://www.sekerbankkibris.com/tr' },
  { label: 'Şeker GYO', href: 'https://www.sekergyo.com.tr/tr' },
] as const

const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/Sekerbank',
    icon: FaFacebookF,
  },
  { label: 'X', href: 'https://twitter.com/sekerbank', icon: FaXTwitter },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/sekerbank/',
    icon: FaInstagram,
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/sekerbank',
    icon: FaLinkedinIn,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/user/SekerbankTAS',
    icon: FaYoutube,
  },
] satisfies SocialLinkItem[]

export function SiteFooter() {
  return (
    <footer className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden">
      <div className="bg-[#F3F3F3]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <h2 className="text-center text-xl font-medium text-[#4B4F54]">
            Size nasıl destek olabiliriz?
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
            {SUPPORT_LINKS.map((item) => {
              const Icon = item.icon

              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-white px-4 py-5 text-[#4B4F54] shadow-[0_2px_3px_rgba(0,0,0,0.08)] transition hover:outline hover:outline-2 hover:outline-[#7DB900]"
                >
                  <Icon className="h-7 w-7 text-[#007A3D]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-[#007A3D]">{item.label}</p>
                </a>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#007A3D] text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a
            href="https://www.sekerbank.com.tr/en"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-white/90 transition-colors hover:text-white"
          >
            English
          </a>

          <div className="flex flex-wrap gap-2">
            {SOCIAL_LINKS.map((item) => {
              const Icon = item.icon

              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              )
            })}
          </div>
        </div>

        <div className="border-t border-white/20">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(220px,1.1fr)_minmax(0,2fr)]">
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <PhoneCall className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/70">
                    Çağrı Merkezi
                  </p>
                  <a
                    href="tel:08502227878"
                    className="mt-1 block text-3xl font-bold leading-none tracking-tight text-white"
                  >
                    0850 222 78 78
                  </a>
                </div>
              </div>

              <a
                href="https://blindlook.com/tr/eyebrand-profili/sekerbank"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-md border border-white/30 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                EyeBrand Erişilebilirlik Profili
              </a>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FOOTER_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs uppercase tracking-[0.14em] text-white/70">
                    {group.title}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {group.links.map((item) => (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-white/90 transition-colors hover:text-white"
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#018342]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {AFFILIATE_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-white/90 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>

          <p className="text-xs text-white/80">Copyright © 2026, Şekerbank T.A.Ş.</p>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter
