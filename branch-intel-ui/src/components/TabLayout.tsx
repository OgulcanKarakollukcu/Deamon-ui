import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import { Link as LinkIcon, LogOut, Menu, Moon, ShieldCheck, Sun, User, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Tab as AppTab } from '../types'

type TabLayoutProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  isDarkMode: boolean
  username: string
  onLogout: () => void
  onThemeToggle: () => void
  customerLinkContent?: ReactNode
  intelligenceContent?: ReactNode
}

const tabs: Array<{ id: AppTab; label: string; icon: typeof LinkIcon }> = [
  { id: 'customer-link', label: 'Müşteri Link', icon: LinkIcon },
  { id: 'intelligence', label: 'İstihbarat', icon: ShieldCheck },
]

const tabTitleMap: Record<AppTab, string> = {
  'customer-link': 'Müşteri Link Yönetimi',
  intelligence: 'İstihbarat Sistemi',
}

export function TabLayout({
  activeTab,
  onTabChange,
  isDarkMode,
  username,
  onLogout,
  onThemeToggle,
  customerLinkContent,
  intelligenceContent,
}: TabLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false)
  const selectedTabIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const normalizedTabIndex = selectedTabIndex >= 0 ? selectedTabIndex : 0
  const pageTitle = tabTitleMap[activeTab]

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F3F3F3] text-[#4B4F54] md:h-screen md:overflow-hidden dark:bg-[#050605] dark:text-[#E6E9E7]">
      <TabGroup
        className="h-full lg:flex"
        selectedIndex={normalizedTabIndex}
        onChange={(index) => {
          const selectedTab = tabs[index]
          if (selectedTab) {
            onTabChange(selectedTab.id)
          }
        }}
        >
        <div
          className={clsx(
            'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden',
            isMobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => {
            setIsMobileSidebarOpen(false)
          }}
          aria-hidden={!isMobileSidebarOpen}
        />
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#DFDFDF] bg-white text-[#4B4F54] transition-transform duration-200 lg:hidden dark:border-[#213328] dark:bg-[#0b120e] dark:text-[#d9e3dc]',
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-hidden={!isMobileSidebarOpen}
        >
          <div className="flex items-center justify-between border-b border-[#DFDFDF] p-4 dark:border-[#213328]">
            <img src="/sekerbank-logo-2.png" alt="Şekerbank Logo" className="h-10 w-auto object-contain" />
            <button
              type="button"
              onClick={() => {
                setIsMobileSidebarOpen(false)
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#DFDFDF] text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#2a4032] dark:text-[#9bd8b3] dark:hover:bg-[#132119]"
              aria-label="Menüyü kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 p-3">
            <div className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id)
                    setIsMobileSidebarOpen(false)
                  }}
                  className={clsx(
                    'flex items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-medium transition',
                    activeTab === tab.id
                      ? 'bg-[#EAF4EE] text-[#007A3D] dark:bg-[#1b3226] dark:text-[#9ad7b1]'
                      : 'text-[#4B4F54] hover:bg-[#F3F3F3] hover:text-[#007A3D] dark:text-[#c4d0c9] dark:hover:bg-[#132019] dark:hover:text-[#a5ddba]',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="border-t border-[#DFDFDF] p-3 dark:border-[#213328]">
            <div className="rounded-xl border border-[#D6E5DC] bg-[#F7FBF8] px-3 py-2 dark:border-[#2e4a3a] dark:bg-[#14231a]">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#007A3D] dark:text-[#9bd8b3]" />
                <div className="min-w-0">
                  <p className="text-[11px] text-[#6E747B] dark:text-[#aeb9b3]">Banka Çalışanı</p>
                  <p className="truncate text-xs font-semibold text-[#4B4F54] dark:text-[#e4ebe7]">{username}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsMobileSidebarOpen(false)
                onLogout()
              }}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#D6E5DC] px-3 py-2 text-xs font-semibold text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#2e4a3a] dark:text-[#9bd8b3] dark:hover:bg-[#1d3226]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Çıkış Yap
            </button>
          </div>
        </aside>

        <aside
          className={clsx(
            'hidden h-full border-r border-[#DFDFDF] bg-white text-[#4B4F54] transition-all duration-300 lg:flex lg:flex-col dark:border-[#213328] dark:bg-[#0b120e] dark:text-[#d9e3dc]',
            isSidebarCollapsed ? 'w-20' : 'w-72',
          )}
        >
          <div className={clsx('border-b border-[#DFDFDF]', isSidebarCollapsed ? 'p-3' : 'p-6')}>
            <div className={clsx('flex', isSidebarCollapsed ? 'justify-center' : 'justify-start')}>
              <img
                src={isSidebarCollapsed ? '/sekerbank-mini.svg' : '/sekerbank-logo-2.png'}
                alt="Şekerbank Logo"
                className={clsx('w-auto object-contain', isSidebarCollapsed ? 'h-9' : 'h-14')}
              />
            </div>
          </div>

          <nav className={clsx('flex-1 space-y-1', isSidebarCollapsed ? 'p-2' : 'p-4')}>
            <TabList className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <Tab
                  as="button"
                  key={tab.id}
                  title={isSidebarCollapsed ? tab.label : undefined}
                  className={({ selected }) =>
                    clsx(
                      'flex items-center rounded-md text-sm font-medium transition',
                      isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3 text-left',
                      selected
                        ? 'bg-[#EAF4EE] text-[#007A3D] dark:bg-[#1b3226] dark:text-[#9ad7b1]'
                        : 'text-[#4B4F54] hover:bg-[#F3F3F3] hover:text-[#007A3D] dark:text-[#c4d0c9] dark:hover:bg-[#132019] dark:hover:text-[#a5ddba]',
                    )
                  }
                >
                  <tab.icon className="h-4 w-4" />
                  {!isSidebarCollapsed ? tab.label : <span className="sr-only">{tab.label}</span>}
                </Tab>
              ))}
            </TabList>
          </nav>

          <div className={clsx('border-t border-[#DFDFDF] p-3 dark:border-[#213328]', isSidebarCollapsed && 'p-2')}>
            <div
              className={clsx(
                'rounded-xl border border-[#D6E5DC] bg-[#F7FBF8] px-3 py-2 dark:border-[#2e4a3a] dark:bg-[#14231a]',
                isSidebarCollapsed && 'flex justify-center px-2',
              )}
            >
              {isSidebarCollapsed ? (
                <User className="h-4 w-4 text-[#007A3D] dark:text-[#9bd8b3]" />
              ) : (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#007A3D] dark:text-[#9bd8b3]" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-[#6E747B] dark:text-[#aeb9b3]">Banka Çalışanı</p>
                    <p className="truncate text-xs font-semibold text-[#4B4F54] dark:text-[#e4ebe7]">{username}</p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              title={isSidebarCollapsed ? 'Çıkış Yap' : undefined}
              className={clsx(
                'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#D6E5DC] px-3 py-2 text-xs font-semibold text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#2e4a3a] dark:text-[#9bd8b3] dark:hover:bg-[#1d3226]',
                isSidebarCollapsed && 'px-0',
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSidebarCollapsed ? <span className="sr-only">Çıkış Yap</span> : 'Çıkış Yap'}
            </button>
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 border-b border-[#DFDFDF] bg-white/95 backdrop-blur dark:border-[#213328] dark:bg-[#0d1510]/95">
            <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSidebarOpen(true)
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#DFDFDF] text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#2a4032] dark:text-[#9bd8b3] dark:hover:bg-[#132119] lg:hidden"
                  aria-label="Menüyü aç"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarCollapsed((prev) => !prev)
                  }}
                  className="hidden h-9 w-9 items-center justify-center rounded-md border border-[#DFDFDF] text-[#007A3D] transition hover:bg-[#F3F8F5] dark:border-[#2a4032] dark:text-[#9bd8b3] dark:hover:bg-[#132119] lg:inline-flex"
                  aria-label={isSidebarCollapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
                >
                  <Menu className="h-4 w-4" />
                </button>
                <img
                  src="/sekerbank-mini.svg"
                  alt="Şekerbank"
                  className="h-7 w-7 rounded-md border border-[#DDEFE3] bg-white p-1 dark:border-[#2a4032] dark:bg-[#122019]"
                />

                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[#4B4F54] sm:text-lg dark:text-[#e4ebe7]">{pageTitle}</h2>
                  <p className="hidden text-xs text-[#6E747B] sm:block dark:text-[#aeb9b3]">
                    Müşteri link ve istihbarat operasyonlarını tek panelden yönetin.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onThemeToggle}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#DFDFDF] px-2.5 py-2 text-sm text-[#007A3D] transition hover:bg-[#F3F8F5] sm:px-3 dark:border-[#2a4032] dark:text-[#9bd8b3] dark:hover:bg-[#132119]"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="hidden sm:inline">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          </header>

          <section className="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-4 md:p-6 lg:p-8">
            <TabPanels className="h-full min-h-0">
              <TabPanel className="h-full min-h-0 overflow-auto">
                {customerLinkContent ?? <div>Customer link placeholder</div>}
              </TabPanel>
              <TabPanel className="h-full min-h-0 overflow-auto">
                {intelligenceContent ?? <div>Intelligence placeholder</div>}
              </TabPanel>
            </TabPanels>
          </section>
        </div>
      </TabGroup>
    </main>
  )
}
