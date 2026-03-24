import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import { Database, FileText, History, LayoutDashboard, Menu, Moon, Server, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Tab as AppTab } from '../types'

type TabLayoutProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  activePcDaemonCount: number
  activeBranchDaemonCount: number
  isDarkMode: boolean
  onThemeToggle: () => void
  dashboardContent?: ReactNode
  bordroContent?: ReactNode
  logsContent?: ReactNode
  contentDisabled?: boolean
  contentOverlay?: ReactNode
}

const tabs: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bordro', label: 'Bordro', icon: FileText },
  { id: 'logs', label: 'Logs', icon: History },
]

const tabTitleMap: Record<AppTab, string> = {
  dashboard: 'Dashboard',
  bordro: 'Bordro',
  logs: 'Log Kayıtları',
}

export function TabLayout({
  activeTab,
  onTabChange,
  activePcDaemonCount,
  activeBranchDaemonCount,
  isDarkMode,
  onThemeToggle,
  dashboardContent,
  bordroContent,
  logsContent,
  contentDisabled = false,
  contentOverlay,
}: TabLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const selectedTabIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const normalizedTabIndex = selectedTabIndex >= 0 ? selectedTabIndex : 0
  const pageTitle = tabTitleMap[activeTab]

  return (
    <main className="h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
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
        <aside
          className={clsx(
            'hidden h-full border-r border-slate-700 bg-[#0a1f44] text-slate-100 transition-all duration-300 lg:flex lg:flex-col',
            isSidebarCollapsed ? 'w-20' : 'w-72',
          )}
        >
          <div className={clsx('border-b border-slate-700', isSidebarCollapsed ? 'p-3' : 'p-6')}>
            <div className={clsx('flex', isSidebarCollapsed ? 'justify-center' : 'justify-start')}>
              <img
                src="/logo.png"
                alt="Branch Test UI"
                className={clsx('w-auto object-contain', isSidebarCollapsed ? 'h-10' : 'h-14')}
              />
            </div>
            {!isSidebarCollapsed ? <h1 className="mt-3 text-xl font-semibold">Apex Branch SD</h1> : null}
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
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white',
                    )
                  }
                >
                  <tab.icon className="h-4 w-4" />
                  {!isSidebarCollapsed ? tab.label : <span className="sr-only">{tab.label}</span>}
                </Tab>
              ))}
            </TabList>
          </nav>

          <div
            className={clsx(
              'space-y-2 border-t border-slate-700 text-xs',
              isSidebarCollapsed ? 'p-2' : 'p-4',
            )}
          >
            <div
              className={clsx(
                'flex items-center rounded-md bg-slate-900/40',
                isSidebarCollapsed ? 'justify-center gap-1 px-1 py-2' : 'justify-between px-3 py-2',
              )}
              title={isSidebarCollapsed ? 'Aktif PCD' : undefined}
            >
              <span
                className={clsx(
                  'inline-flex items-center text-slate-300',
                  isSidebarCollapsed ? '' : 'gap-2',
                )}
              >
                <Database className="h-3.5 w-3.5" />
                {isSidebarCollapsed ? <span className="sr-only">Aktif PCD</span> : 'Aktif PCD'}
              </span>
              <span className="font-semibold text-white">{activePcDaemonCount.toString()}</span>
            </div>

            <div
              className={clsx(
                'flex items-center rounded-md bg-slate-900/40',
                isSidebarCollapsed ? 'justify-center gap-1 px-1 py-2' : 'justify-between px-3 py-2',
              )}
              title={isSidebarCollapsed ? 'Aktif BD' : undefined}
            >
              <span
                className={clsx(
                  'inline-flex items-center text-slate-300',
                  isSidebarCollapsed ? '' : 'gap-2',
                )}
              >
                <Server className="h-3.5 w-3.5" />
                {isSidebarCollapsed ? <span className="sr-only">Aktif BD</span> : 'Aktif BD'}
              </span>
              <span className="font-semibold text-white">{activeBranchDaemonCount.toString()}</span>
            </div>
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarCollapsed((prev) => !prev)
                  }}
                  className="hidden h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:inline-flex"
                  aria-label={isSidebarCollapsed ? 'Sidebarı genişlet' : 'Sidebarı daralt'}
                >
                  <Menu className="h-4 w-4" />
                </button>

                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{pageTitle}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Daemon ve scanner operasyonlarını tek panelden yönetin.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onThemeToggle}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDarkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </header>

          <nav className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 lg:hidden">
            <TabList className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Tab
                  as="button"
                  key={tab.id}
                  className={({ selected }) =>
                    clsx(
                      'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition',
                      selected
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )
                  }
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Tab>
              ))}
            </TabList>
          </nav>

          <section className="relative min-h-0 flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
            <div className="relative h-full min-h-0 rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-lg shadow-slate-300/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40 md:p-6">
              <fieldset
                disabled={contentDisabled}
                className={clsx(
                  'h-full min-h-0 min-w-0 border-0 p-0 transition',
                  contentDisabled && 'pointer-events-none opacity-70',
                )}
              >
                <TabPanels className="h-full min-h-0">
                  <TabPanel unmount={false} className="h-full min-h-0 overflow-auto">
                    {dashboardContent ?? <div>Dashboard placeholder</div>}
                  </TabPanel>
                  <TabPanel unmount={false} className="h-full min-h-0 overflow-auto">
                    {bordroContent ?? <div>Bordro placeholder</div>}
                  </TabPanel>
                  <TabPanel unmount={false} className="h-full min-h-0 overflow-auto">
                    {logsContent ?? <div>Logs placeholder</div>}
                  </TabPanel>
                </TabPanels>
              </fieldset>

              {contentOverlay ? <div className="absolute inset-0 z-10">{contentOverlay}</div> : null}
            </div>
          </section>
        </div>
      </TabGroup>
    </main>
  )
}
