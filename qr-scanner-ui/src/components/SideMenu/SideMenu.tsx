import { Building2, ClipboardList, House, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface LogoModuleMap {
  [path: string]: string
}

interface MenuItem {
  icon: LucideIcon
  label: string
  path: string
}

export interface SideMenuProps {
  open: boolean
  onClose: () => void
}

const ASSET_LOGO_SVG = import.meta.glob('../../assets/cybersoft-logo.svg', {
  eager: true,
  import: 'default',
}) as LogoModuleMap
const ASSET_LOGO_PNG = import.meta.glob('../../assets/cybersoft-logo.png', {
  eager: true,
  import: 'default',
}) as LogoModuleMap
const ASSET_LOGO_WEBP = import.meta.glob('../../assets/cybersoft-logo.webp', {
  eager: true,
  import: 'default',
}) as LogoModuleMap

const PUBLIC_LOGO_CANDIDATES = [
  '/%C5%9Eekerbank_logo_2.png',
  '/Şekerbank_logo2.svg',
  '/cybersoft-logo.svg',
  '/cybersoft-logo.png',
  '/cybersoft-logo.webp',
]

const MENU_ITEMS: MenuItem[] = [
  { icon: House, label: 'Ana Sayfa', path: '/home' },
  { icon: ClipboardList, label: 'Bireysel Kredi', path: '/bireysel-kredi' },
  { icon: Building2, label: 'Kurumsal Kredi', path: '/kurumsal-kredi' },
]

export function SideMenu({ open, onClose }: SideMenuProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [logoIndex, setLogoIndex] = useState(0)

  const logoCandidates = useMemo(() => {
    return [
      ...Object.values(ASSET_LOGO_SVG),
      ...Object.values(ASSET_LOGO_PNG),
      ...Object.values(ASSET_LOGO_WEBP),
      ...PUBLIC_LOGO_CANDIDATES,
    ]
  }, [])

  const activeLogoSrc = logoCandidates[logoIndex] ?? null

  const handleNavigate = (path: string): void => {
    navigate(path)
    onClose()
  }

  const handleLogoError = (): void => {
    setLogoIndex((prev) => prev + 1)
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Menüyü kapat"
        onClick={onClose}
        className={`absolute inset-0 bg-[#007A3D]/25 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        className={`relative flex h-full w-72 flex-col bg-white transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigasyon Menüsü"
      >
        <header className="flex h-16 items-center justify-between border-b border-[#DFDFDF] px-6">
          <div className="min-w-0">
            {activeLogoSrc ? (
              <img
                src={activeLogoSrc}
                alt="Şekerbank logo"
                className="h-6 w-auto"
                onError={handleLogoError}
              />
            ) : (
              <span className="font-['DM Sans'] text-base font-bold tracking-tight text-[#4B4F54]">
                Şekerbank
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={onClose}
            className="text-[#007A3D] transition-colors duration-150 hover:text-[#018342]"
          >
            ✕
          </button>
        </header>

        <section className="flex items-center gap-3 border-b border-[#DFDFDF] px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#007A3D] text-sm font-semibold text-white">
            CS
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-[#4B4F54]">Şube Kullanıcısı</p>
            <p className="text-xs text-[#A5A7AA]">Yetkili</p>
          </div>
        </section>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1.5">
            {MENU_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon

              return (
                <li key={item.path}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                      isActive
                        ? 'bg-[#EAF4EE] text-[#007A3D]'
                        : 'text-[#4B4F54] hover:bg-[#F3F3F3] hover:text-[#007A3D]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <footer className="border-t border-[#DFDFDF] px-6 py-4">
          <p className="text-xs text-[#A5A7AA]">v1.0.0</p>
        </footer>
      </aside>
    </div>
  )
}

export default SideMenu
