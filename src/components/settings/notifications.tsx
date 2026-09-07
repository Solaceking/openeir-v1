// OpenEir — Settings → Alerts: Web Push devices + Morning Briefing schedule.

'use client'

import { useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2, Send, MonitorSmartphone, Clock, Sun } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { usePushDevices, useBriefingConfig } from '@/lib/api-client'
import { pushSupported, readPushState, subscribeToPush, unsubscribeFromPush, sendTestPush, type PushState } from '@/lib/push-client'
import { toast } from 'sonner'

export function NotificationsSection() {
  const devices = usePushDevices()
  const briefing = useBriefingConfig()
  const [state, setState] = useState<PushState>({ supported: true, permission: 'default', subscribed: false })
  const [label, setLabel] = useState('This device')
  const [busy, setBusy] = useState<'sub' | 'unsub' | 'test' | null>(null)

  useEffect(() => {
    readPushState().then((s) => {
      setState(s)
      setLabel(deviceLabel())
    }).catch(() => setState({ supported: false, permission: 'unsupported', subscribed: false }))
  }, [])

  const subscribe = async () => {
    setBusy('sub')
    try {
      const s = await subscribeToPush(label.trim() || 'This device')
      setState(s)
      devices.refetch()
      toast.success('Notifications enabled on this device')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enable notifications')
    } finally {
      setBusy(null)
    }
  }

  const unsubscribe = async () => {
    setBusy('unsub')
    try {
      const s = await unsubscribeFromPush()
      setState(s)
      devices.refetch()
      toast.success('Notifications disabled on this device')
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const r = await sendTestPush(label.trim() || 'This device')
      devices.refetch()
      if (r.sent === 0) toast.warning('No device received it', { description: 'Subscribe this device first — or check the server can reach the push service.' })
      else toast.success(`Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}${r.pruned ? `, removed ${r.pruned} stale` : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setBusy(null)
    }
  }

  const cfg = briefing.query.data

  return (
    <div className="space-y-4">
      {/* ---- Web Push ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" aria-hidden /> Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Get an immediate alert on this device when an SOS is activated, when a companion nudges you, and for your
            morning briefing — even when the app is closed. Notifications are delivered directly to your browser; nothing
            routes through any third-party service except your browser&apos;s own push transport.
          </p>

          {!state.supported ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <BellOff className="h-4 w-4 shrink-0" aria-hidden />
              This browser does not support push notifications. Chrome, Edge, Firefox and Safari on iOS 16.4+ (installed as a web app) all do.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-45 flex-1">
                  <Label htmlFor="push-label">Device label</Label>
                  <Input id="push-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Living-room tablet" className="mt-1.5" maxLength={60} />
                </div>
                {state.subscribed ? (
                  <Button variant="outline" onClick={unsubscribe} disabled={busy !== null} className="gap-2">
                    {busy === 'unsub' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />} Disable here
                  </Button>
                ) : (
                  <Button onClick={subscribe} disabled={busy !== null} className="gap-2">
                    {busy === 'sub' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />} Enable notifications
                  </Button>
                )}
                <Button variant="outline" onClick={test} disabled={busy !== null || devices.data?.count === 0} className="gap-2">
                  {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send test
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${state.permission === 'granted' ? 'bg-emerald-500' : state.permission === 'denied' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden />
                This device: {state.subscribed ? 'subscribed' : 'not subscribed'} · permission {state.permission}
              </div>
            </div>
          )}

          {devices.data && devices.data.devices.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subscribed devices ({devices.data.count})</div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {devices.data.devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{d.label}</span>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${d.lastErrorAt ? 'border-amber-500/40 text-amber-600' : 'text-muted-foreground'}`}>
                      {d.lastErrorAt ? 'stale' : 'ok'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Morning briefing schedule ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Sun className="h-4 w-4 text-primary" aria-hidden /> Morning briefing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cfg ? (
            <div className="space-y-2"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-1/3" /></div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                A spoken-friendly snapshot of your day: latest numbers, adherence, streak, anything to watch and one
                gentle focus. It appears on the dashboard, can be read aloud, and pushed to your devices at a fixed time.
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden /> Enabled</div>
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => briefing.save.mutate({ ...cfg, enabled: v })}
                    aria-label="Enable morning briefing"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4 text-muted-foreground" aria-hidden /> Push at time</div>
                  <Switch
                    checked={cfg.push}
                    onCheckedChange={(v) => briefing.save.mutate({ ...cfg, push: v })}
                    aria-label="Push briefing at scheduled time"
                  />
                </div>
                <div>
                  <Label htmlFor="briefing-time">Delivery time</Label>
                  <Input
                    id="briefing-time" type="time" value={cfg.time} disabled={!cfg.enabled}
                    onChange={(e) => {
                      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) briefing.save.mutate({ ...cfg, time: e.target.value })
                    }}
                    className="mt-1.5 w-32"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Delivery happens while the app is open on any of your devices (self-hosted instance — there is no cloud
                cron). When the time passes, the next open device triggers it and every subscribed device gets the push.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Device'
  const browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Browser'
  return `${os} · ${browser}`
}
