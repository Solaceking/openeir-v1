'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck, Bell, HeartPulse, Pill, RefreshCw, Siren, ExternalLink,
  Clock, CheckCircle2, AlertTriangle, XCircle, Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpenEirLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { subscribeToPush, pushSupported, readPushState } from '@/lib/push-client'

interface ViewData {
  companionName: string
  user: {
    name: string
    lastCheckin: string | null
    checkinHoursAgo: number | null
    lastAppOpen: string | null
    appOpenHoursAgo: number | null
  }
  meds: { total: number; taken: number; missed: number; pending: number; schedule: { name: string; dose: string; times: string[] }[] } | null
  vitals: { lastBp: { systolic: number; diastolic: number; pulse: number | null; at: string } | null; lastGlucose: { value: number; unit: string; at: string } | null } | null
  activeEmergency: { since: string; sharePath: string } | null
}

function ago(hours: number | null): string {
  if (hours === null) return 'never'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function CompanionViewPage() {
  const [pushOn, setPushOn] = useState(false)
  const [data, setData] = useState<ViewData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unpaired' | 'revoked'>('loading')
  const [nudging, setNudging] = useState(false)

  const load = useCallback(async () => {
    const token = localStorage.getItem('openeir_companion_viewer')
    if (!token) { setState('unpaired'); return }
    try {
      const res = await fetch('/api/companion/view', { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 403) { setState('revoked'); return }
      if (!res.ok) { setState('unpaired'); return }
      setData(await res.json())
      setState('ready')
    } catch {
      /* keep last data on transient errors */
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => { void load() }, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Offer push so the companion gets SOS alerts even with this page closed
  useEffect(() => {
    if (pushSupported()) {
      readPushState().then((s) => setPushOn(s.subscribed)).catch(() => {})
    }
  }, [])

  const enablePush = async () => {
    try {
      await subscribeToPush('Companion device')
      setPushOn(true)
      toast.success('Alerts enabled — you will be notified if SOS is activated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enable notifications')
    }
  }

  const nudge = async () => {
    setNudging(true)
    const token = localStorage.getItem('openeir_companion_viewer')
    try {
      const res = await fetch('/api/companion/nudge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      if (res.ok) toast.success('Nudge sent — a hello appears on their app')
      else toast.error('Could not send the nudge')
    } finally {
      setNudging(false)
    }
  }

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <OpenEirLogo className="h-10 w-10 animate-pulse opacity-50" />
      </main>
    )
  }

  if (state === 'unpaired' || state === 'revoked') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-3xl border bg-card p-8 text-center">
          <h1 className="text-xl font-bold">{state === 'revoked' ? 'Access was revoked' : 'This device isn\'t paired yet'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {state === 'revoked'
              ? 'The person you were paired with has withdrawn access. That is their right — ask them for a new invite if things change.'
              : 'Open the one-time invite link they sent you on this device to pair it.'}
          </p>
        </div>
      </main>
    )
  }

  if (!data) return null
  const { user, meds, vitals, activeEmergency } = data

  const checkinState = user.checkinHoursAgo === null ? 'none'
    : user.checkinHoursAgo < 14 ? 'ok' : user.checkinHoursAgo < 26 ? 'warn' : 'bad'
  const CheckinIcon = checkinState === 'ok' ? CheckCircle2 : checkinState === 'warn' ? AlertTriangle : XCircle
  const checkinColor = checkinState === 'ok' ? 'text-emerald-500' : checkinState === 'warn' ? 'text-amber-500' : 'text-red-500'
  const appFresh = user.appOpenHoursAgo !== null && user.appOpenHoursAgo < 1

  return (
    <main className="mx-auto max-w-xl space-y-4 bg-background p-4 pb-16 sm:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
            <OpenEirLogo className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{data.user.name}</h1>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden /> You&apos;re paired as {data.companionName} · revocable anytime
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {activeEmergency && (
        <motion.a
          href={activeEmergency.sharePath}
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-between rounded-2xl bg-red-600 px-5 py-4 text-white shadow-lg shadow-red-900/30"
        >
          <span className="flex items-center gap-2.5">
            <Siren className="h-6 w-6" aria-hidden />
            <span>
              <span className="block text-base font-bold">SOS ACTIVE — since {new Date(activeEmergency.since).toLocaleTimeString()}</span>
              <span className="block text-xs opacity-85">Tap to open the live emergency card</span>
            </span>
          </span>
          <ExternalLink className="h-5 w-5" aria-hidden />
        </motion.a>
      )}

      {/* check-in freshness — the core "are they OK" signal */}
      {!pushOn && (
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
          <div className="flex items-center gap-2.5 text-sm">
            <Bell className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>Get an instant alert if {data.user.name.split(' ')[0]} triggers SOS — even with this page closed.</span>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={enablePush}>Enable</Button>
        </section>
      )}

      <section className="rounded-2xl border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckinIcon className={`h-8 w-8 ${checkinColor}`} aria-hidden />
            <div>
              <p className="text-sm font-semibold">
                {checkinState === 'ok' ? 'Checked in — OK' : checkinState === 'warn' ? 'No check-in today yet' : 'No check-in for over a day'}
              </p>
              <p className="text-xs text-muted-foreground">Daily check-in {ago(user.checkinHoursAgo)}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => void nudge()} disabled={nudging} className="gap-1.5">
            <Bell className="h-3.5 w-3.5" aria-hidden /> {nudging ? 'Sending…' : 'Nudge'}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Smartphone className="h-3 w-3" aria-hidden /> Their app last active: {ago(user.appOpenHoursAgo)}{appFresh ? ' · live now' : ''}
        </div>
      </section>

      {/* vitals */}
      {vitals && (
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><HeartPulse className="h-3.5 w-3.5" aria-hidden /> Latest BP</p>
            {vitals.lastBp ? (
              <>
                <p className="numeric mt-1.5 text-2xl font-bold">{vitals.lastBp.systolic}/{vitals.lastBp.diastolic}</p>
                <p className="text-[11px] text-muted-foreground">{vitals.lastBp.pulse ? `pulse ${vitals.lastBp.pulse} · ` : ''}<Clock className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />{new Date(vitals.lastBp.at).toLocaleDateString()}</p>
              </>
            ) : <p className="mt-2 text-sm text-muted-foreground">No readings yet</p>}
          </div>
          <div className="rounded-2xl border p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><HeartPulse className="h-3.5 w-3.5" aria-hidden /> Latest glucose</p>
            {vitals.lastGlucose ? (
              <>
                <p className="numeric mt-1.5 text-2xl font-bold">{vitals.lastGlucose.value}</p>
                <p className="text-[11px] text-muted-foreground">{vitals.lastGlucose.unit} · {new Date(vitals.lastGlucose.at).toLocaleDateString()}</p>
              </>
            ) : <p className="mt-2 text-sm text-muted-foreground">No readings yet</p>}
          </div>
        </section>
      )}

      {/* meds today */}
      {meds && (
        <section className="rounded-2xl border p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Pill className="h-3.5 w-3.5" aria-hidden /> Medications today</p>
          {meds.total === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No medications configured</p>
          ) : (
            <>
              <div className="mt-2 flex gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 numeric">{meds.taken} taken</span>
                {meds.pending > 0 && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 numeric">{meds.pending} due</span>}
                {meds.missed > 0 && <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-medium text-red-600 numeric">{meds.missed} missed</span>}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {meds.schedule.map((m) => (
                  <li key={m.name} className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2">
                    <span><b>{m.name}</b> <span className="text-muted-foreground">{m.dose}</span></span>
                    <span className="numeric text-xs text-muted-foreground">{m.times.join(' · ') || 'as needed'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        You see only what they granted — status, medications, vitals. Location and live audio are never shared silently.
      </p>
    </main>
  )
}
