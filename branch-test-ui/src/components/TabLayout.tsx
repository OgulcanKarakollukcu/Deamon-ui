import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import { Database, FileText, History, LayoutDashboard, Moon, Server, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
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
  const selectedTabIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const normalizedTabIndex = selectedTabIndex >= 0 ? selectedTabIndex : 0

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/15" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-lg shadow-slate-300/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Branch Daemon Console
              </p>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Branch Test UI</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Daemon ve scanner operasyonlarını tek panelden yönetin.
              </p>
            </div>

            <button
              type="button"
              onClick={onThemeToggle}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Aktif PCD
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {activePcDaemonCount.toString()}
                </p>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Aktif BD
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {activeBranchDaemonCount.toString()}
                </p>
              </div>
            </article>
          </div>
        </header>

        <TabGroup
          className="space-y-4"
          selectedIndex={normalizedTabIndex}
          onChange={(index) => {
            const selectedTab = tabs[index]
            if (selectedTab) {
              onTabChange(selectedTab.id)
            }
          }}
        >
          <nav className="rounded-2xl border border-slate-200/80 bg-white/85 p-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <TabList className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Tab
                  as="button"
                  key={tab.id}
                  className={({ selected }) =>
                    clsx(
                      'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                      selected
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
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

          <section className="relative rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-lg shadow-slate-300/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40 md:p-6">
            <fieldset
              disabled={contentDisabled}
              className={clsx(
                'min-w-0 border-0 p-0 transition',
                contentDisabled && 'pointer-events-none opacity-70',
              )}
            >
              <TabPanels>
                <TabPanel unmount={false}>{dashboardContent ?? <div>Dashboard placeholder</div>}</TabPanel>
                <TabPanel unmount={false}>{bordroContent ?? <div>Bordro placeholder</div>}</TabPanel>
                <TabPanel unmount={false}>{logsContent ?? <div>Logs placeholder</div>}</TabPanel>
              </TabPanels>
            </fieldset>

            {contentOverlay ? <div className="absolute inset-0 z-10">{contentOverlay}</div> : null}
          </section>
        </TabGroup>
      </div>
    </main>
  )
}
