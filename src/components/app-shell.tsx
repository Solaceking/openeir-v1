'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import { useUI, applyA11yClasses, type ViewKey } from '@/lib/store'
import { useOfflineSync } from '@/lib/offline'
import { useStats } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  LayoutDashboard, PenLine, ListOrdered, Pill, Activity, BookOpen,
  FlaskConical, FileText, Settings, Sun, Moon, Monitor, Wifi, WifiOff,
  Accessibility, Sparkles, Mic, MessagesSquare, Menu, ChevronRight, Siren,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { OpenEirLogo } from '@/components/logo'
import { AmbientScheduler } from '@/components/ambient-scheduler'

const ICONS: Record<ViewKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  talk: MessagesSquare,
  record: PenLine,
  voice: Mic,
  readings: ListOrdered,
  medications: Pill,
  safety: Siren,
  trends: Activity,
  story: BookOpen,
  whatif: FlaskConical,
  reports: FileText,
  settings: Settings,
}

/** Desktop sidebar groups */
const GROUPS: { label: string; keys: ViewKey[] }[] = [
  { label: 'Care', keys: ['dashboard', 'talk', 'record', 'voice', 'readings', 'medications', 'safety'] },
  { label: 'Insight', keys: ['trends', 'story', 'whatif', 'reports'] },
  { label: 'System', keys: ['settings'] },
]

/** Mobile bottom bar: the four essentials + More */
const MOBILE_PRIMARY: ViewKey[] = ['dashboard', 'talk', 'record', 'medications']
const MOBILE_MORE: ViewKey[] = ['safety', 'voice', 'readings', 'trends', 'story', 'whatif', 'reports', 'settings']

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
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const upd = () => setOnline(navigator.onLine)
    upd()
    window.addEventListener('online', upd)
    window.addEventListener('offline', upd)
    return () => { window.removeEventListener('online', upd); window.removeEventListener('offline', upd) }
  }, [setOnline])

  useEffect(() => { applyA11yClasses(largeText, highContrast) }, [largeText, highContrast])

  const connected = useRealtimeInsights((p) => {
    toast(p.title, { description: p.body.slice(0, 120), icon: <Sparkles className="h-4 w-4 text-teal-600" /> })
    void stats.refetch()
  })

  const go = (k: ViewKey) => { setView(k); setMoreOpen(false) }

  const label = (k: ViewKey) => t(`nav.${k}`)
  const Icon = (k: ViewKey) => ICONS[k]

  // ---- desktop sidebar item -------------------------------------------------
  const sideItem = (k: ViewKey) => {
    const active = view === k
    const I = Icon(k)
    return (
      <button
        key={k}
        onClick={() => go(k)}
        className={`group relative flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        {active && (
          <motion.span
            layoutId="eir-side-pill"
            className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/15"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          />
        )}
        <I className="relative h-4.5 w-4.5 shrink-0" aria-hidden />
        <span className="relative">{label(k)}</span>
      </button>
    )
  }

  // ---- mobile bar item -------------------------------------------------------
  const mobileItem = (k: ViewKey) => {
    const active = view === k
    const I = Icon(k)
    const emphasized = k === 'talk'
    return (
      <button
        key={k}
        onClick={() => go(k)}
        className="relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1"
        aria-current={active ? 'page' : undefined}
      >
        {active && (
          <motion.span
            layoutId="eir-mobile-pill"
            className="absolute inset-x-1 inset-y-0 rounded-2xl bg-primary/10 ring-1 ring-primary/15"
            transition={{ type: 'spring', stiffness: 480, damping: 36 }}
          />
        )}
        <span className={`relative flex h-7 w-7 items-center justify-center rounded-full ${emphasized && !active ? 'eir-orb-btn text-white shadow-md' : ''}`}>
          <I className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
        </span>
        <span className={`relative w-full truncate text-center text-[10px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {label(k)}
        </span>
      </button>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Ambient scheduler: briefing delivery + nightly reflection triggers */}
      <AmbientScheduler />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10" aria-hidden>
              <OpenEirLogo className="h-6.5 w-6.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">OpenEir</div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">{t('app.tagline')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
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
        <nav className="sticky top-[72px] hidden h-fit w-52 shrink-0 flex-col gap-1 rounded-2xl border bg-card/60 p-2 backdrop-blur md:flex" aria-label="Main navigation">
          {GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{g.label}</div>
              {g.keys.map(sideItem)}
            </div>
          ))}
        </nav>
        {/* Main content */}
        <main className="min-w-0 flex-1 pb-24 md:pb-4">{children}</main>
      </div>

      {/* Mobile bottom nav — 4 essentials + More */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-1 pt-1 backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-0.5">
          {MOBILE_PRIMARY.map(mobileItem)}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 ${MOBILE_MORE.includes(view) ? 'text-primary' : 'text-muted-foreground'}`}
                aria-label={t('nav.more')}
                aria-expanded={moreOpen}
              >
                {MOBILE_MORE.includes(view) && (
                  <motion.span
                    layoutId="eir-mobile-pill"
                    className="absolute inset-x-1 inset-y-0 rounded-2xl bg-primary/10 ring-1 ring-primary/15"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <Menu className={`h-5 w-5 ${MOBILE_MORE.includes(view) ? 'text-primary' : ''}`} aria-hidden />
                </span>
                <span className={`relative text-[10px] font-semibold ${MOBILE_MORE.includes(view) ? 'text-primary' : ''}`}>{t('nav.more')}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-safe pt-2">
              <SheetHeader className="sr-only">
                <SheetTitle>{t('nav.more')}</SheetTitle>
              </SheetHeader>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
              <div className="grid grid-cols-2 gap-1.5 pb-2">
                {MOBILE_MORE.map((k) => {
                  const I = Icon(k)
                  const active = view === k
                  return (
                    <button
                      key={k}
                      onClick={() => go(k)}
                      className={`flex min-h-[52px] items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                        active ? 'border-primary/30 bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-accent'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <I className="h-4.5 w-4.5" aria-hidden />
                        {label(k)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden />
                    </button>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <footer className="mt-auto hidden border-t bg-muted/30 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
          <span>OpenEir v1.0 — self-hosted & private. Not a medical device; always confirm with your doctor.</span>
          <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3" aria-hidden />{online ? 'Connected' : 'Offline queue active'}</span>
        </div>
      </footer>
    </div>
  )
}
