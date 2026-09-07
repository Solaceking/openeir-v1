'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useTheme } from 'next-themes'
import { useUI, applyA11yClasses, type ViewKey } from '@/lib/store'
import { useOfflineSync } from '@/lib/offline'
import { useStats } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  LayoutDashboard, PenLine, ListOrdered, Pill, Activity, BookOpen,
  FlaskConical, FileText, Settings, Sun, Moon, Monitor, Wifi, WifiOff,
  Accessibility, Sparkles, Mic,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { OpenEirLogo } from '@/components/logo'

const NAV: { key: ViewKey; icon: typeof LayoutDashboard; i18nKey: string }[] = [
  { key: 'dashboard', icon: LayoutDashboard, i18nKey: 'nav.dashboard' },
  { key: 'record', icon: PenLine, i18nKey: 'nav.record' },
  { key: 'voice', icon: Mic, i18nKey: 'nav.voice' },
  { key: 'readings', icon: ListOrdered, i18nKey: 'nav.readings' },
  { key: 'medications', icon: Pill, i18nKey: 'nav.medications' },
  { key: 'trends', icon: Activity, i18nKey: 'nav.trends' },
  { key: 'story', icon: BookOpen, i18nKey: 'nav.story' },
  { key: 'whatif', icon: FlaskConical, i18nKey: 'nav.whatif' },
  { key: 'reports', icon: FileText, i18nKey: 'nav.reports' },
  { key: 'settings', icon: Settings, i18nKey: 'nav.settings' },
]

export function useRealtimeInsights(onNew: (payload: { title: string; body: string; severity: string; origin: string }) => void) {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const socket: Socket = io('/?XTransformPort=3030', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
      timeout: 8000,
    })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('insight:new', (p: { title: string; body: string; severity: string; origin: string }) => {
      onNew(p)
    })
    return () => { socket.disconnect() }
  }, [])
  return connected
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, online, setOnline, largeText, highContrast, theme: _theme } = useUI()
  const { theme, setTheme } = useTheme()
  const { t } = useT()
  const stats = useStats()
  useOfflineSync()

  // connectivity tracking
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine)
    upd()
    window.addEventListener('online', upd)
    window.addEventListener('offline', upd)
    return () => { window.removeEventListener('online', upd); window.removeEventListener('offline', upd) }
  }, [setOnline])

  // a11y classes
  useEffect(() => { applyA11yClasses(largeText, highContrast) }, [largeText, highContrast])

  const connected = useRealtimeInsights((p) => {
    toast(p.title, { description: p.body.slice(0, 120), icon: <Sparkles className="h-4 w-4 text-teal-600" /> })
    void stats.refetch()
  })

  const navItem = (item: (typeof NAV)[number], mobile = false) => {
    const active = view === item.key
    const Icon = item.icon
    if (mobile) {
      return (
        <button
          key={item.key}
          onClick={() => setView(item.key)}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          aria-current={active ? 'page' : undefined}
        >
          <Icon className="h-5 w-5" aria-hidden />
          <span className="truncate w-full text-center">{t(item.i18nKey)}</span>
        </button>
      )
    }
    return (
      <button
        key={item.key}
        onClick={() => setView(item.key)}
        className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
        {t(item.i18nKey)}
      </button>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10" aria-hidden>
              <OpenEirLogo className="h-6.5 w-6.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">OpenEir</div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">{t('app.tagline')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* realtime + connectivity */}
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:inline-flex ${connected ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300' : 'border-border text-muted-foreground'}`}
              title={connected ? 'Live ambient intelligence connected' : 'Realtime service offline — insights still delivered on refresh'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-teal-500 eir-live' : 'bg-muted-foreground/40'}`} aria-hidden />
              {connected ? 'Eir live' : 'Eir idle'}
            </span>
            {!online && (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <WifiOff className="h-3 w-3" aria-hidden /> {t('common.offline')}
              </Badge>
            )}
            {/* a11y menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Accessibility options">
                  <Accessibility className="h-4.5 w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t('settings.appearance')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => useUI.getState().setAppearance({ largeText: !largeText })}>
                  <span className="flex-1">{t('settings.largeText')}</span>
                  <span className="text-xs text-muted-foreground">{largeText ? 'On' : 'Off'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => useUI.getState().setAppearance({ highContrast: !highContrast })}>
                  <span className="flex-1">{t('settings.highContrast')}</span>
                  <span className="text-xs text-muted-foreground">{highContrast ? 'On' : 'Off'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => useUI.getState().setAppearance({ simpleMode: !useUI.getState().simpleMode })}>
                  <span className="flex-1">{t('settings.simpleMode')}</span>
                  <span className="text-xs text-muted-foreground">{useUI.getState().simpleMode ? 'On' : 'Off'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="mr-2 h-4 w-4" /> Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="mr-2 h-4 w-4" /> Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="mr-2 h-4 w-4" /> System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost" size="icon" aria-label="Toggle theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-3 py-4 sm:px-6">
        {/* Desktop sidebar */}
        <nav className="sticky top-[72px] hidden h-fit w-52 shrink-0 flex-col gap-1 rounded-xl border bg-card p-2 md:flex" aria-label="Main navigation">
          {NAV.map((n) => navItem(n))}
        </nav>
        {/* Main content */}
        <main className="min-w-0 flex-1 pb-20 md:pb-4">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        {NAV.filter((n) => n.key !== 'reports' && n.key !== 'whatif').map((n) => navItem(n, true))}
      </nav>

      <footer className="mt-auto border-t bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
          <span>OpenEir v1.0 — self-hosted & private. Not a medical device; always confirm with your doctor.</span>
          <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3" aria-hidden />{online ? 'Connected' : 'Offline queue active'}</span>
        </div>
      </footer>
    </div>
  )
}
