'use client'

// OpenEir — the app shell. A proper application frame:
//   desktop → full-height sidebar rail (flush, hairline-separated) grouped
//             Home / Daily care / Insight / Safety / System, collapsible to an
//             icon rail; content column opens with a top bar that carries the
//             breadcrumb trail + global actions, and a ⌘K quick-nav palette.
//   mobile  → brand top bar, four essentials + a grouped "More" sheet.
// Navigation is filtered by the signed-in role (admin / caregiver / viewer).

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useTheme } from 'next-themes'
import {
  useUI, applyA11yClasses,
} from '@/lib/store'
import { NAV_GROUPS, SETTINGS_SECTIONS, roleCanView, type Role, type ViewKey } from '@/lib/nav'
import { VIEW_ICONS } from '@/components/nav-icons'
import { useOfflineSync } from '@/lib/offline'
import { useStats, useAuth } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Sun, Moon, Monitor, WifiOff, Accessibility, Sparkles, Menu,
  PanelLeftClose, LogOut, KeyRound, ChevronRight, House, Search, Plus,
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
  const [cmdOpen, setCmdOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

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

  // new view → content scrolls to the top; leaving Settings clears its drill-down
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    if (view !== 'settings') useUI.getState().setSettingsSection(null)
  }, [view])

  // ⌘K / Ctrl-K quick navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const connected = useRealtimeInsights((p) => {
    toast(p.title, { description: p.body.slice(0, 120), icon: <Sparkles className="h-4 w-4 text-teal-600" /> })
    void stats.refetch()
  })

  const go = (k: ViewKey) => {
    if (!roleCanView(role, k)) { toast.info('Your role does not include this area'); return }
    setView(k)
    setMoreOpen(false)
    setCmdOpen(false)
  }

  const allowed = (keys: ViewKey[]) => keys.filter((k) => roleCanView(role, k))
  const label = (k: ViewKey) => t(`nav.${k}`)
  const account = auth.data?.account ?? null

  const signOut = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {})
    window.location.href = '/login'
  }

  // ---- breadcrumb trail (top bar, desktop) -----------------------------------
  const settingsSection = useUI((s) => s.settingsSection)
  const sectionLabel = view === 'settings' && settingsSection
    ? SETTINGS_SECTIONS.find((s) => s.key === settingsSection)?.label ?? null
    : null
  const crumbs = () => {
    const groupKey = NAV_GROUPS.find((g) => g.keys.includes(view))?.key ?? 'home'
    const CurrentIcon = VIEW_ICONS[view]
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px] leading-none">
        <ol className="flex min-w-0 items-center gap-1">
          <li className="flex shrink-0 items-center">
            {view === 'dashboard' ? (
              <span className="flex items-center gap-1.5 font-semibold text-foreground" aria-current="page">
                <House className="h-3.5 w-3.5" aria-hidden />
                {t('nav.group.home')}
              </span>
            ) : (
              <button
                onClick={() => go('dashboard')}
                className="flex items-center gap-1.5 rounded-md px-1 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <House className="h-3.5 w-3.5" aria-hidden />
                {t('nav.group.home')}
              </button>
            )}
          </li>
          {view !== 'dashboard' && (
            <>
              <li aria-hidden><ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" /></li>
              <li className="shrink-0 font-medium text-muted-foreground/75">{t(`nav.group.${groupKey}`)}</li>
              <li aria-hidden><ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" /></li>
              {sectionLabel ? (
                <>
                  <li className="shrink-0">
                    <button
                      onClick={() => useUI.getState().setSettingsSection(null)}
                      className="rounded-md px-1 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {label(view)}
                    </button>
                  </li>
                  <li aria-hidden><ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" /></li>
                  <li className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground" aria-current="page">
                    <span className="truncate">{t(sectionLabel)}</span>
                  </li>
                </>
              ) : (
                <li className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground" aria-current="page">
                  {CurrentIcon && <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                  <span className="truncate">{label(view)}</span>
                </li>
              )}
            </>
          )}
        </ol>
      </nav>
    )
  }

  // ---- desktop sidebar item ---------------------------------------------------
  const sideItem = (k: ViewKey) => {
    const active = view === k
    const I = VIEW_ICONS[k]
    return (
      <button
        key={k}
        onClick={() => go(k)}
        title={collapsed ? label(k) : undefined}
        aria-current={active ? 'page' : undefined}
        className={`relative flex min-h-[38px] w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150 ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        } ${collapsed ? 'justify-center px-0' : ''}`}
      >
        <I className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 2} aria-hidden />
        {!collapsed && <span className="truncate">{label(k)}</span>}
      </button>
    )
  }

  // ---- mobile bar item ---------------------------------------------------------
  const mobileItem = (k: ViewKey) => {
    const active = view === k
    const I = VIEW_ICONS[k]
    const emphasized = k === 'talk'
    return (
      <button
        key={k}
        onClick={() => go(k)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors ${
          active ? 'bg-secondary' : ''
        }`}
      >
        <span className={`relative flex h-7 w-7 items-center justify-center rounded-full ${emphasized && !active ? 'eir-orb-btn text-white' : ''}`}>
          <I className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={active ? 2.2 : 2} aria-hidden />
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

  const allNavKeys = NAV_GROUPS.flatMap((g) => allowed(g.keys))

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Ambient scheduler: briefing delivery + nightly reflection triggers */}
      <AmbientScheduler />

      {/* ---- Desktop sidebar: full-height rail -------------------------------- */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex ${collapsed ? 'w-[60px]' : 'w-[232px]'}`}
        aria-label="Main navigation"
      >
        {/* brand */}
        <div className={`flex h-[60px] shrink-0 items-center gap-2.5 border-b border-sidebar-border/70 px-3 ${collapsed ? 'justify-center px-0' : ''}`}>
          <button
            onClick={() => collapsed && setSidebarCollapsed(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent"
            aria-label="OpenEir"
            title="OpenEir"
          >
            <OpenEirLogo className="h-[26px] w-[26px]" />
          </button>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="font-display truncate text-[16.5px] font-semibold tracking-tight">OpenEir</div>
                <div className="truncate text-[10px] text-muted-foreground">{t('app.tagline')}</div>
              </div>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t('nav.collapse')}
                title={t('nav.collapse')}
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
        </div>

        {/* groups */}
        <nav className="scroll-slim flex-1 overflow-y-auto px-2 pb-3" aria-label="Sections">
          {NAV_GROUPS.map((g) => {
            const keys = allowed(g.keys)
            if (keys.length === 0) return null
            return (
              <div key={g.key} className="flex flex-col gap-0.5">
                {!collapsed ? (
                  <div className="px-2.5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">{t(g.label)}</div>
                ) : (
                  <div className="mx-auto mt-3 h-px w-6 bg-sidebar-border" aria-hidden />
                )}
                {keys.map(sideItem)}
              </div>
            )
          })}
        </nav>

        {/* footer: user card + trust note */}
        <div className="shrink-0 border-t border-sidebar-border/70 p-2">
          {auth.data?.mode === 'accounts' && account ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent ${collapsed ? 'justify-center px-0' : ''}`}
                  aria-label={`${t('nav.account')}: ${account.displayName}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground" aria-hidden>
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
            <button
              onClick={() => go('settings')}
              className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent ${collapsed ? 'justify-center px-0' : ''}`}
              title={t('accounts.openNote')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground" aria-hidden>
                <House className="h-4 w-4" />
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-xs font-semibold">{t('roles.open')}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{t('nav.account')}</span>
                </span>
              )}
            </button>
          )}
          {!collapsed && (
            <p className="px-2 pb-0.5 pt-1.5 text-[9.5px] leading-snug text-muted-foreground/50">
              Self-hosted & private — not a medical device.
            </p>
          )}
        </div>
      </aside>

      {/* ---- Content column ---------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: breadcrumbs (desktop) / brand (mobile) + global actions */}
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background px-3 sm:px-5">
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              <OpenEirLogo className="h-7 w-7" aria-hidden />
              <span className="font-display text-[16px] font-semibold tracking-tight">OpenEir</span>
            </div>
          </div>
          <div className="hidden min-w-0 md:block">{crumbs()}</div>

          <div className="flex shrink-0 items-center gap-1">
            {/* quick navigation */}
            <Button
              variant="ghost"
              onClick={() => setCmdOpen(true)}
              className="hidden h-8 gap-2 rounded-lg px-2.5 text-muted-foreground hover:text-foreground sm:flex"
              aria-label={t('nav.search')}
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden text-[12.5px] lg:inline">{t('nav.search')}</span>
              <kbd className="hidden rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground lg:inline">⌘K</kbd>
            </Button>

            {/* live ambient intelligence */}
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:inline-flex ${connected ? 'border-primary/25 bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground'}`}
              title={connected ? 'Live ambient intelligence connected' : 'Realtime service offline — insights still delivered on refresh'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary eir-live' : 'bg-muted-foreground/40'}`} aria-hidden />
              {connected ? 'Eir live' : 'Eir idle'}
            </span>

            {!online && (
              <Badge variant="outline" className="gap-1 border-metric/50 bg-metric/15 text-metric-foreground">
                <WifiOff className="h-3 w-3" aria-hidden /> {t('common.offline')}
              </Badge>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Accessibility options">
                  <Accessibility className="h-[17px] w-[17px]" />
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
              variant="ghost" size="icon" className="h-8 w-8" aria-label="Toggle theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
            </Button>
          </div>
        </header>

        {/* scrollable content */}
        <main ref={mainRef} className="scroll-slim min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-5 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* ---- Mobile bottom nav — 4 essentials + grouped More -------------------- */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-1 pt-1 backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-0.5">
          {allowed(MOBILE_PRIMARY).map(mobileItem)}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors ${
                  !allowed(MOBILE_PRIMARY).includes(view) && NAV_GROUPS.some((g) => g.keys.includes(view)) ? 'bg-secondary' : ''
                }`}
                aria-label={t('nav.more')}
                aria-expanded={moreOpen}
              >
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <Menu className={`h-5 w-5 ${!allowed(MOBILE_PRIMARY).includes(view) ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
                </span>
                <span className={`relative text-[10px] font-semibold ${!allowed(MOBILE_PRIMARY).includes(view) ? 'text-primary' : 'text-muted-foreground'}`}>{t('nav.more')}</span>
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

      {/* ---- ⌘K quick navigation ------------------------------------------------ */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen} title={t('nav.search')} description={t('nav.searchPlaceholder')}>
        <CommandInput placeholder={t('nav.searchPlaceholder')} />
        <CommandList>
          <CommandEmpty>{t('nav.noResults')}</CommandEmpty>
          <CommandGroup heading={t('nav.jumpTo')}>
            {allNavKeys.map((k) => {
              const I = VIEW_ICONS[k]
              const groupKey = NAV_GROUPS.find((g) => g.keys.includes(k))?.key ?? 'home'
              return (
                <CommandItem key={k} value={`${label(k)} ${t(`nav.group.${groupKey}`)}`} onSelect={() => go(k)} className="gap-2.5">
                  <I className="h-4 w-4 text-primary" aria-hidden />
                  <span className="flex-1">{label(k)}</span>
                  <span className="text-[11px] text-muted-foreground">{t(`nav.group.${groupKey}`)}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandGroup heading={t('nav.quickActions')}>
            <CommandItem value={`${t('dashboard.quickRecord')} record`} onSelect={() => go('record')} className="gap-2.5">
              <Plus className="h-4 w-4 text-primary" aria-hidden />
              {t('dashboard.quickRecord')}
            </CommandItem>
            <CommandItem value={`${t('talk.title')} talk conversation`} onSelect={() => go('talk')} className="gap-2.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              {t('talk.title')}
            </CommandItem>
            <CommandItem
              value="Toggle theme"
              onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setCmdOpen(false) }}
              className="gap-2.5"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-primary" aria-hidden /> : <Moon className="h-4 w-4 text-primary" aria-hidden />}
              Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
