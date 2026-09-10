'use client'

// OpenEir — Settings → Profile & accounts → "App permissions".
// Only renders inside the OpenEir Android app (where Capacitor injects its
// bridge and the OpenEirPermissions plugin is registered). Shows the four
// runtime permissions with plain reasons, an Allow button that triggers the
// system dialog, and a jump to Android Settings for the permanently-blocked
// case. In a plain browser there is nothing to manage, so the card is absent.

import { useCallback, useEffect, useState } from 'react'
import { Bell, Camera, MapPin, Mic, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

type PermState = 'granted' | 'denied' | 'prompt' | 'blocked'
type PermsMap = Record<string, PermState>

interface OpenEirPermsPlugin {
  status: () => Promise<PermsMap | { value: PermsMap }>
  request: (opts: { permissions: string[] }) => Promise<PermsMap | { value: PermsMap }>
  openSettings: () => Promise<void>
}

// Capacitor resolves plugin calls with the raw object the native side sent;
// some runtimes wrap it as {value: …} — accept both (same as the shell).
function unwrap<T>(res: T | { value: T } | null): T | null {
  if (res && typeof res === 'object' && 'value' in (res as { value?: unknown })) {
    return (res as { value: T }).value
  }
  return (res as T) ?? null
}

function getPlugin(): OpenEirPermsPlugin | null {
  if (typeof window === 'undefined') return null
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, OpenEirPermsPlugin> } }).Capacitor
  return cap?.Plugins?.OpenEirPermissions ?? null
}

const KEYS = ['microphone', 'camera', 'location', 'notifications'] as const

export function AppPermissionsCard() {
  const { t } = useT()
  const [plugin, setPlugin] = useState<OpenEirPermsPlugin | null>(null)
  const [states, setStates] = useState<PermsMap>({})
  const [busy, setBusy] = useState<string | null>(null)

  // The bridge is injected asynchronously on cold start — poll briefly, then
  // give up silently (plain-browser users never see this card).
  useEffect(() => {
    let waited = 0
    const timer = setInterval(() => {
      const p = getPlugin()
      if (p) {
        setPlugin(p)
        clearInterval(timer)
      } else if ((waited += 250) > 3000) {
        clearInterval(timer)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [])

  const refresh = useCallback(() => {
    const p = getPlugin()
    if (!p) return
    p.status()
      .then((r) => {
        const m = unwrap<PermsMap>(r)
        if (m) setStates(m)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!plugin) return
    refresh()
    // Coming back from Android Settings is the main "I changed it there" path.
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [plugin, refresh])

  if (!plugin) return null

  const request = async (keys: string[]) => {
    setBusy(keys.join(','))
    try {
      const r = await plugin.request({ permissions: keys })
      const m = unwrap<PermsMap>(r)
      if (m) setStates(m)
    } catch {
      refresh()
    } finally {
      setBusy(null)
    }
  }

  const rows: Array<{ key: string; title: string; why: string; icon: React.ReactNode }> = [
    { key: 'microphone', title: t('appPerms.micTitle'), why: t('appPerms.micWhy'), icon: <Mic className="h-4 w-4 text-teal-700" /> },
    { key: 'camera', title: t('appPerms.cameraTitle'), why: t('appPerms.cameraWhy'), icon: <Camera className="h-4 w-4 text-teal-700" /> },
    { key: 'location', title: t('appPerms.locationTitle'), why: t('appPerms.locationWhy'), icon: <MapPin className="h-4 w-4 text-teal-700" /> },
    { key: 'notifications', title: t('appPerms.notificationsTitle'), why: t('appPerms.notificationsWhy'), icon: <Bell className="h-4 w-4 text-teal-700" /> },
  ]

  const chip = (s: PermState | undefined) => {
    switch (s) {
      case 'granted':
        return <span className="rounded-full bg-teal-700/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-teal-700">{t('appPerms.stateGranted')}</span>
      case 'blocked':
        return <span className="rounded-full bg-red-900/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-red-900">{t('appPerms.stateBlocked')}</span>
      case 'denied':
        return <span className="rounded-full bg-amber-700/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700">{t('appPerms.stateDenied')}</span>
      default:
        return <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-stone-500">{t('appPerms.statePrompt')}</span>
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          <h3 className="text-sm font-semibold">{t('appPerms.title')}</h3>
        </div>
        <p className="text-xs leading-relaxed text-stone-500">{t('appPerms.subtitle')}</p>
        <div className="divide-y divide-stone-100">
          {rows.map((row) => {
            const s = states[row.key]
            return (
              <div key={row.key} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 shrink-0">{row.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[0.8rem] font-semibold">{row.title}</b>
                    {chip(s)}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{row.why}</p>
                  {s === 'blocked' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8 text-xs"
                      onClick={() => { void plugin.openSettings().catch(() => {}) }}
                    >
                      {t('appPerms.openSettings')}
                    </Button>
                  ) : s && s !== 'granted' ? (
                    <Button
                      size="sm"
                      className="mt-2 h-8 text-xs"
                      disabled={busy !== null}
                      onClick={() => { void request([row.key]) }}
                    >
                      {busy === row.key ? '…' : t('appPerms.allow')}
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[0.7rem] leading-relaxed text-stone-400">{t('appPerms.note')}</p>
      </CardContent>
    </Card>
  )
}
