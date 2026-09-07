'use client'

// OpenEir — the app shell. A proper sidebar system:
//   desktop  → grouped rail (Home / Daily care / Insight / Safety / System),
//              collapsible to an icon rail, user card with role badge at the foot
//   mobile   → four essentials + a grouped "More" sheet
// Navigation is filtered by the signed-in role (admin / caregiver / viewer).

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import {
  useUI, applyA11yClasses,
} from '@/lib/store'
import { NAV_GROUPS, roleCanView, type Role, type ViewKey } from '@/lib/nav'
import { VIEW_ICONS } from '@/components/nav-icons'
import { useOfflineSync } from '@/lib/offline'
import { useStats, useAuth } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Sun, Moon, Monitor, Wifi, WifiOff, Accessibility, Sparkles, Menu,
  PanelLeftClose, PanelLeftOpen, LogOut, KeyRound, ChevronRight,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { OpenEirLogo } from '@/components/logo'
import { AmbientScheduler } from '@/components/ambient-scheduler'

/** Mobile bottom bar: the four essentials + More */
const MOBILE_PRIMARY: ViewKey[] = ['dashboard', 'talk', 'record', 'medications']

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

function initials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, online, setOnline, largeText, highContrast, sidebarCollapsed } = useUI()
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed)
  const { theme, setTheme } = useTheme()
  const { t } = useT()
  const stats = useStats()
  const auth = useAuth()
  useOfflineSync()
  const [moreOpen, setMoreOpen] = useState(false)

  const role: Role = (auth.data?.role as Role | null) ?? 'admin'
  const collapsed = sidebarCollapsed

  useEffect(() => {
    const upd = () => setOnline(navigator.onLine)
    upd()
    window.addEventListener('online', upd)
    window.addEventListener('offline', upd)
    return () => { window.removeEventListener('online', upd); window.removeEventListener('offline', upd) }
  }, [setOnline])

  useEffect(() => { applyA11yClasses(largeText, highContrast) }, [largeText, highContrast])

  // role change / sign-out: never sit on a view this role cannot see
  useEffect(() => {
    if (auth.data && !roleCanView(role, view)) setView('dashboard')
  }, [auth.data, role, view, setView])

  const connected = useRealtimeInsights((p) => {
    toast(p.title, { description: p.body.slice(0, 120), icon: <Sparkles className="h-4 w-4 text-teal-600" /> })
    void stats.refetch()
  })

  const go = (k: ViewKey) => {
    if (!roleCanView(role, k)) { toast.info('Your role does not include this area'); return }
    setView(k)
    setMoreOpen(false)
  }

  const allowed = (keys: ViewKey[]) => keys.filter((k) => roleCanView(role, k))
  const label = (k: ViewKey) => t(`nav.${k}`)
  const account = auth.data?.account ?? null

  const signOut = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {})
    window.location.href = '/login'
  }

  // ---- desktop sidebar item -------------------------------------------------
  const sideItem = (k: ViewKey) => {
    const active = view === k
    const I = VIEW_ICONS[k]
    return (
      <button
        key={k}
        onClick={() => go(k)}
        title={collapsed ? label(k) : undefined}
        className={`group relative flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        } ${collapsed ? 'justify-center px-0' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        {active && (
          <motion.span
            layoutId="eir-side-pill"
            className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/20"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          />
        )}
        <I className="relative h-[18px] w-[18px] shrink-0" aria-hidden />
        {!collapsed && <span className="relative truncate">{label(k)}</span>}
      </button>
    )
  }

  // ---- mobile bar item -------------------------------------------------------
  const mobileItem = (k: ViewKey) => {
    const active = view === k
    const I = VIEW_ICONS[k]
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
        <span className={`relative flex h-7 w-7 items-center justify-center rounded-full ${emphasized && !active ? 'eir-orb-btn text-white' : ''}`}>
          <I className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
        </span>
        <span className={`relative w-full truncate text-center text-[10px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {label(k)}
        </span>
      </button>
    )
  }

  const mobileMoreGroups = NAV_GROUPS
    .map((g) => ({ ...g, keys: allowed(g.keys.filter((k) => !MOBILE_PRIMARY.includes(k))) }))
    .filter((g) => g.keys.length > 0)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Ambient scheduler: briefing delivery + nightly reflection triggers */}
      <AmbientScheduler />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-5">
          <div className="flex items-center gap-2.5 md:hidden">
            <OpenEirLogo className="h-8 w-8" aria-hidden />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">OpenEir</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${connected ? 'border-primary/25 bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground'}`}
              title={connected ? 'Live ambient intelligence connected' : 'Realtime service offline — insights still delivered on refresh'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary eir-live' : 'bg-muted-foreground/40'}`} aria-hidden />
              {connected ? 'Eir live' : 'Eir idle'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!online && (
              <Badge variant="outline" className="gap-1 border-metric/50 bg-metric/15 text-metric-foreground">
                <WifiOff className="h-3 w-3" aria-hidden /> {t('common.offline')}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Accessibility options">
                  <Accessibility className="h-[18px] w-[18px]" />
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
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-5 px-3 py-4 sm:px-5">
        {/* Desktop sidebar */}
        <nav
          className={`sticky top-[72px] hidden h-fit shrink-0 flex-col rounded-2xl border bg-sidebar/70 p-2 backdrop-blur md:flex ${collapsed ? 'w-[68px]' : 'w-60'}`}
          aria-label="Main navigation"
        >
          {/* brand */}
          <div className={`flex items-center gap-2.5 px-1.5 pb-2 pt-1 ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-card">
              <OpenEirLogo className="h-7 w-7" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className="text-sm font-bold tracking-tight">OpenEir</div>
                <div className="truncate text-[10px] text-muted-foreground">{t('app.tagline')}</div>
              </div>
            )}
          </div>

          {/* groups */}
          {NAV_GROUPS.map((g) => {
            const keys = allowed(g.keys)
            if (keys.length === 0) return null
            return (
              <div key={g.key} className="flex flex-col gap-0.5 pb-1">
                {!collapsed && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">{t(g.label)}</div>
                )}
                {collapsed && <div className="mx-auto my-1 h-px w-6 bg-border" aria-hidden />}
                {keys.map(sideItem)}
              </div>
            )
          })}

          {/* footer: collapse + user card */}
          <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border/70 pt-2">
            <button
              onClick={() => setSidebarCollapsed(!collapsed)}
              className="flex min-h-[36px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            >
              {collapsed
                ? <PanelLeftOpen className="mx-auto h-4 w-4" aria-hidden />
                : <><PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden /><span>{t('nav.collapse')}</span></>}
            </button>

            {auth.data?.mode === 'accounts' && account ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent ${collapsed ? 'justify-center px-0' : ''}`}
                    aria-label={`${t('nav.account')}: ${account.displayName}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden>
                      {initials(account.displayName)}
                    </span>
                    {!collapsed && (
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-xs font-semibold">{account.displayName}</span>
                        <span className="block text-[10px] text-muted-foreground">{t(`roles.${role}`)}</span>
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-56">
                  <DropdownMenuLabel>
                    {account.displayName}
                    <span className="block text-[10px] font-normal text-muted-foreground">@{account.username} · {t(`roles.${role}`)}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => go('settings')}>
                    <KeyRound className="mr-2 h-4 w-4" /> {t('accounts.changePw')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void signOut()} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> {t('nav.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              !collapsed && (
                <div className="rounded-xl bg-secondary/60 px-3 py-2 leading-tight">
                  <span className="block text-[11px] font-semibold text-secondary-foreground">{t('roles.open')}</span>
                  <span className="block text-[10px] text-muted-foreground">{t('accounts.openNote')}</span>
                </div>
              )
            )}
          </div>
        </nav>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-24 md:pb-4">{children}</main>
      </div>

      {/* Mobile bottom nav — 4 essentials + grouped More */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-1 pt-1 backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-0.5">
          {allowed(MOBILE_PRIMARY).map(mobileItem)}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 ${!allowed(MOBILE_PRIMARY).includes(view) && NAV_GROUPS.some((g) => g.keys.includes(view)) ? 'text-primary' : 'text-muted-foreground'}`}
                aria-label={t('nav.more')}
                aria-expanded={moreOpen}
              >
                {!allowed(MOBILE_PRIMARY).includes(view) && NAV_GROUPS.some((g) => g.keys.includes(view)) && (
                  <motion.span
                    layoutId="eir-mobile-pill"
                    className="absolute inset-x-1 inset-y-0 rounded-2xl bg-primary/10 ring-1 ring-primary/15"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <Menu className={`h-5 w-5 ${!allowed(MOBILE_PRIMARY).includes(view) ? 'text-primary' : ''}`} aria-hidden />
                </span>
                <span className={`relative text-[10px] font-semibold ${!allowed(MOBILE_PRIMARY).includes(view) ? 'text-primary' : ''}`}>{t('nav.more')}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-safe pt-2">
              <SheetHeader className="sr-only">
                <SheetTitle>{t('nav.more')}</SheetTitle>
              </SheetHeader>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
              <div className="pb-2">
                {mobileMoreGroups.map((g) => (
                  <div key={g.key} className="pb-2">
                    <div className="px-1 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">{t(g.label)}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.keys.map((k) => {
                        const I = VIEW_ICONS[k]
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
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <footer className="mt-auto hidden border-t bg-muted/30 md:block">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
          <span>OpenEir v1.1 — self-hosted & private. Not a medical device; always confirm with your doctor.</span>
          <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3" aria-hidden />{online ? 'Connected' : 'Offline queue active'}</span>
        </div>
      </footer>

    </div>
  )
}
