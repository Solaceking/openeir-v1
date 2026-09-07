'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Siren, Phone, MapPin, Plus, Trash2, Star, ShieldCheck, Copy, Check,
  Navigation, Users, Stethoscope, Loader2, ExternalLink, CheckCircle2, XCircle, History,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/lib/api-client'
import { PageHeader } from '@/components/page-header'

// ---- types -----------------------------------------------------------------

interface Channel { type: 'phone' | 'whatsapp' | 'email' | 'signal' | 'other'; value: string; label?: string }
interface Contact { id: string; name: string; relationship: string; isPrimary: boolean; channels: Channel[] }

interface SosPackage {
  identity: { name: string; age: number | null; sex: string | null; conditions: string[] }
  location: { lat: number; lng: number; plusCode: string | null; mapsUrl: string; address: string | null; country: string | null }
  emergency: { number: string; nearest: { name: string; address: string; phone: string | null } | null }
  clinical: { lastBp: { systolic: number; diastolic: number; pulse: number | null } | null; medications: { name: string; dose: string }[] }
  gp: { name: string; phone: string | null } | null
  contacts: { name: string; relationship: string; primary: boolean }[]
}

interface SosEvent {
  id: string
  kind: string
  status: string
  startedAt: string
  context: { emergencyNumber?: string; country?: string | null } | null
}

const HOLD_MS = 1200

export function SafetyView() {
  const { data: profileData } = useProfile()
  const profile = profileData?.profile

  // ---- SOS hold-to-fire ------------------------------------------------------
  const [holding, setHolding] = useState(false)
  const [holdPct, setHoldPct] = useState(0)
  const [firing, setFiring] = useState(false)
  const [active, setActive] = useState<{ id: string; sharePath: string; pkg: SosPackage } | null>(null)
  const [copied, setCopied] = useState(false)
  const holdRaf = useRef<number>(0)
  const holdStart = useRef<number>(0)

  const fire = useCallback(async () => {
    setFiring(true)
    try {
      let lat: number | undefined, lng: number | undefined, acc: number | undefined
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation?.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000 }) ??
          rej(new Error('no geolocation')))
        lat = pos.coords.latitude; lng = pos.coords.longitude; acc = pos.coords.accuracy
      } catch {
        toast.error('No location — the SOS still goes out, but add your address when you call')
      }
      const res = await fetch('/api/emergency/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: lat ?? 0, lng: lng ?? 0, accuracyM: acc }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'SOS failed')
      setActive({ id: json.event.id, sharePath: json.event.sharePath, pkg: json.package })
      toast.error('Emergency mode active — call now, the card below has everything')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not activate SOS — call directly')
    } finally {
      setFiring(false)
    }
  }, [])

  const startHold = () => {
    setHolding(true)
    holdStart.current = performance.now()
    const tick = () => {
      const pct = Math.min((performance.now() - holdStart.current) / HOLD_MS, 1)
      setHoldPct(pct)
      if (pct >= 1) {
        stopHold()
        void fire()
      } else {
        holdRaf.current = requestAnimationFrame(tick)
      }
    }
    holdRaf.current = requestAnimationFrame(tick)
  }
  const stopHold = () => {
    cancelAnimationFrame(holdRaf.current)
    setHolding(false)
    setHoldPct(0)
  }

  const resolveActive = async (status: 'resolved' | 'cancelled') => {
    if (!active) return
    await fetch(`/api/emergency/${active.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setActive(null)
    toast.success(status === 'resolved' ? 'Marked resolved — glad you are OK' : 'Cancelled')
    void loadHistory()
  }

  // ---- contacts ---------------------------------------------------------------
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts')
      const json = await res.json()
      setContacts(json.contacts ?? [])
    } finally {
      setLoadingContacts(false)
    }
  }, [])
  useEffect(() => { void loadContacts() }, [loadContacts])

  const [cName, setCName] = useState('')
  const [cRel, setCRel] = useState('family')
  const [cPrimary, setCPrimary] = useState(false)
  const [cPhone, setCPhone] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [adding, setAdding] = useState(false)

  const addContact = async () => {
    const channels: Channel[] = []
    if (cPhone.trim()) channels.push({ type: 'phone', value: cPhone.trim() })
    if (cEmail.trim()) channels.push({ type: 'email', value: cEmail.trim() })
    if (!cName.trim() || !channels.length) {
      toast.error('Name plus at least one phone or email is needed')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName.trim(), relationship: cRel, isPrimary: cPrimary, channels }),
      })
      if (!res.ok) throw new Error()
      setCName(''); setCPhone(''); setCEmail(''); setCPrimary(false)
      void loadContacts()
      toast.success('Contact added')
    } catch {
      toast.error('Could not add contact')
    } finally {
      setAdding(false)
    }
  }

  const removeContact = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  // ---- companions ---------------------------------------------------------------
  interface Companion { id: string; name: string; status: string; contact: string | null }
  const [companions, setCompanions] = useState<Companion[]>([])
  const [kName, setKName] = useState('')
  const [kContact, setKContact] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const loadCompanions = useCallback(async () => {
    const res = await fetch('/api/companion')
    const json = await res.json()
    setCompanions(json.companions ?? [])
  }, [])
  useEffect(() => { void loadCompanions() }, [loadCompanions])

  const invite = async () => {
    if (!kName.trim()) { toast.error('Give your companion a name'); return }
    const res = await fetch('/api/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: kName.trim(), contact: kContact.trim() || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error('Invite failed'); return }
    setInviteLink(`${window.location.origin}${json.invitePath}`)
    setKName(''); setKContact('')
    void loadCompanions()
    toast.success('Invite created — send it now, it is shown once')
  }

  const revoke = async (id: string) => {
    await fetch('/api/companion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'revoke' }),
    })
    void loadCompanions()
    toast.success('Access revoked')
  }

  // ---- history -------------------------------------------------------------------
  const [events, setEvents] = useState<SosEvent[]>([])
  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/emergency/sos')
    const json = await res.json()
    setEvents(json.events ?? [])
  }, [])
  useEffect(() => { void loadHistory() }, [loadHistory])

  const gp = profile ? {
    name: profile.gpName as string | null,
    phone: profile.gpPhone as string | null,
    address: profile.gpAddress as string | null,
  } : null

  return (
    <div className="space-y-5">
      <PageHeader
        view="safety"
        subtitle="One hold, and everything that matters reaches the right people."
      />

      {/* ---- SOS trigger ---- */}
      <div className="relative overflow-hidden rounded-3xl border border-red-900/20 bg-gradient-to-b from-red-950/10 to-transparent p-6 dark:border-red-500/20">
        <div className="flex flex-col items-center gap-3">
          <button
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            disabled={firing || !!active}
            aria-label="Hold to trigger SOS emergency mode"
            className="relative flex h-32 w-32 touch-none items-center justify-center rounded-full text-white shadow-lg shadow-red-900/30 transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: 'radial-gradient(120% 120% at 30% 25%, oklch(0.62 0.21 25), oklch(0.5 0.22 27) 60%, oklch(0.42 0.19 28))' }}
          >
            <svg className="absolute inset-0" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="46" fill="none" stroke="oklch(1 0 0 / 0.18)" strokeWidth="4" />
              <circle
                cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 46}`}
                strokeDashoffset={`${2 * Math.PI * 46 * (1 - holdPct)}`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            {firing
              ? <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
              : <Siren className="h-10 w-10" aria-hidden />}
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold">{active ? 'Emergency mode is ACTIVE' : holding ? 'Keep holding…' : 'Hold to trigger SOS'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active ? 'The card below speaks for you — show it or read it to the call-taker.' : 'Hold 1 second. Release early to cancel. A 5-second grace prevents false alarms.'}
            </p>
          </div>
        </div>

        {/* ---- active emergency card ---- */}
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="mt-6 rounded-2xl border border-red-900/30 bg-card p-5"
              role="alert"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <a
                    href={`tel:${active.pkg.emergency.number}`}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-lg font-bold text-white shadow-md transition-transform active:scale-[0.98]"
                  >
                    <Phone className="h-5 w-5" aria-hidden /> Call {active.pkg.emergency.number}
                  </a>
                  {active.pkg.emergency.nearest && (
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearest emergency department</p>
                      <p className="mt-0.5 text-sm font-medium">{active.pkg.emergency.nearest.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{active.pkg.emergency.nearest.address}</p>
                      {active.pkg.emergency.nearest.phone && (
                        <a href={`tel:${active.pkg.emergency.nearest.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <Phone className="h-3 w-3" aria-hidden /> {active.pkg.emergency.nearest.phone}
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {active.pkg.location.plusCode && <Badge variant="outline" className="numeric">{active.pkg.location.plusCode}</Badge>}
                    <a href={active.pkg.location.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium text-primary">
                      <MapPin className="h-3 w-3" aria-hidden /> Open location <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">{active.pkg.identity.name}{active.pkg.identity.age ? `, ${active.pkg.identity.age}` : ''}</p>
                  {active.pkg.identity.conditions.length > 0 && (
                    <p className="text-xs text-muted-foreground">Conditions: {active.pkg.identity.conditions.join(', ')}</p>
                  )}
                  {active.pkg.clinical.lastBp && (
                    <p className="numeric text-xs text-muted-foreground">Last BP: {active.pkg.clinical.lastBp.systolic}/{active.pkg.clinical.lastBp.diastolic}{active.pkg.clinical.lastBp.pulse ? `, pulse ${active.pkg.clinical.lastBp.pulse}` : ''}</p>
                  )}
                  {active.pkg.clinical.medications.length > 0 && (
                    <p className="text-xs text-muted-foreground">Meds: {active.pkg.clinical.medications.map((m) => `${m.name} ${m.dose}`).join(', ')}</p>
                  )}
                  {active.pkg.contacts.length > 0 && (
                    <p className="text-xs text-muted-foreground">To notify: {active.pkg.contacts.map((c) => c.name).join(', ')}</p>
                  )}
                  <button
                    onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${active.sharePath}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                    {copied ? 'Share link copied' : 'Copy shareable card link'}
                  </button>
                </div>
              </div>
              <div className="mt-4 flex gap-2 border-t pt-3">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => void resolveActive('resolved')}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden /> I&apos;m safe — resolve
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 gap-1.5" onClick={() => void resolveActive('cancelled')}>
                  <XCircle className="h-4 w-4" aria-hidden /> False alarm
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- daily check-in ---- */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div>
          <p className="text-sm font-semibold">Daily check-in</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Tells your companion you&apos;re OK without them having to ask.</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={async () => {
            try {
              const res = await fetch('/api/companion/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
              if (!res.ok) throw new Error()
              toast.success('Checked in — your companion can see you\'re OK')
            } catch {
              toast.error('Check-in failed — try again')
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden /> I&apos;m OK
        </Button>
      </div>

      {/* ---- GP card ---- */}
      {gp?.name && (
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold"><Stethoscope className="h-4 w-4 text-primary" aria-hidden /> Your GP</p>
            {gp.phone && <a href={`tel:${gp.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Phone className="h-3 w-3" aria-hidden /> {gp.phone}</a>}
          </div>
          <p className="mt-1 text-sm">{gp.name}</p>
          {gp.address && <p className="text-xs text-muted-foreground">{gp.address}</p>}
        </div>
      )}

      {/* ---- contacts manager ---- */}
      <div className="rounded-2xl border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden /> Emergency contacts</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Everyone here is listed on your SOS card — add one or several, each with every way to reach them.</p>
        {loadingContacts ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : contacts.length > 0 ? (
          <div className="mt-3 space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border bg-background/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {c.name}
                    {c.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Primary" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.channels.map((ch) => `${ch.type}: ${ch.value}`).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-1">
                  {c.channels.find((ch) => ch.type === 'phone') && (
                    <a href={`tel:${c.channels.find((ch) => ch.type === 'phone')!.value}`} className="rounded-lg p-2 text-primary hover:bg-accent" aria-label={`Call ${c.name}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void removeContact(c.id)} aria-label={`Remove ${c.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">No contacts yet — add the person we should reach first.</p>
        )}

        <div className="mt-3 space-y-2 rounded-xl border bg-background/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s-c-name" className="text-xs">Name</Label>
              <Input id="s-c-name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Maria (sister)" className="mt-1 h-9" />
            </div>
            <div>
              <Label htmlFor="s-c-rel" className="text-xs">Relationship</Label>
              <select id="s-c-rel" value={cRel} onChange={(e) => setCRel(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                {['family', 'friend', 'carer', 'neighbour', 'other'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s-c-phone" className="text-xs">Phone</Label>
              <Input id="s-c-phone" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+353 87 123 4567" className="mt-1 h-9" type="tel" />
            </div>
            <div>
              <Label htmlFor="s-c-email" className="text-xs">Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="s-c-email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="maria@example.com" className="mt-1 h-9" type="email" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={cPrimary} onChange={(e) => setCPrimary(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Primary contact
          </label>
          <Button size="sm" variant="outline" className="w-full" onClick={() => void addContact()} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" aria-hidden /> Add contact</>}
          </Button>
        </div>
      </div>

      {/* ---- companions ---- */}
      <div className="rounded-2xl border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Trusted companions</p>
        <p className="mt-0.5 text-xs text-muted-foreground">They can check on you remotely and are auto-added to your SOS card.</p>
        {companions.length > 0 && (
          <div className="mt-3 space-y-2">
            {companions.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-xl border bg-background/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground">{k.contact ?? 'no contact listed'} · {k.status}</p>
                </div>
                {k.status !== 'revoked' && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void revoke(k.id)}>Revoke</Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Input value={kName} onChange={(e) => setKName(e.target.value)} placeholder="Companion name" className="h-9" aria-label="Companion name" />
          <Input value={kContact} onChange={(e) => setKContact(e.target.value)} placeholder="Phone or email" className="h-9" aria-label="Companion contact" />
          <Button size="sm" variant="outline" onClick={() => void invite()} className="h-9 shrink-0">Invite</Button>
        </div>
        {inviteLink && (
          <button onClick={() => { void navigator.clipboard.writeText(inviteLink); toast.success('Invite link copied') }} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs">
            <Navigation className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate font-medium">{inviteLink}</span>
            <Copy className="ml-auto h-3 w-3 shrink-0" aria-hidden />
          </button>
        )}
      </div>

      {/* ---- history ---- */}
      {events.length > 0 && (
        <div className="rounded-2xl border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" aria-hidden /> Emergency history</p>
          <div className="mt-2 space-y-1.5">
            {events.slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2 text-xs">
                <span className="font-medium uppercase">{e.kind}</span>
                <span className="text-muted-foreground">{new Date(e.startedAt).toLocaleString()}</span>
                <Badge variant={e.status === 'active' ? 'destructive' : 'outline'} className="text-[10px]">{e.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
