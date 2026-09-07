'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowLeft, Check, MapPin, Phone, Globe, Search, Navigation,
  Star, Plus, Trash2, Copy, ShieldCheck, Stethoscope, Users, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpenEirLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { useSaveProfile } from '@/lib/api-client'

// ---- types -----------------------------------------------------------------

interface PlaceResult {
  id: string
  name: string
  address: string
  phone: string | null
  website: string | null
  lat: number | null
  lng: number | null
  plusCode: string | null
  source: 'google' | 'osm'
}

interface GpDraft {
  name: string
  org: string
  address: string
  phone: string
  website: string
  placeId: string | null
  plusCode: string | null
}

interface ChannelDraft {
  type: 'phone' | 'whatsapp' | 'email' | 'signal' | 'other'
  value: string
}

interface ContactDraft {
  name: string
  relationship: 'family' | 'friend' | 'carer' | 'neighbour' | 'other'
  isPrimary: boolean
  channels: ChannelDraft[]
  saved: boolean
}

const STEPS = ['Welcome', 'About you', 'Health', 'Your doctor', 'Emergency contacts', 'Trusted companion', 'Ready']

const RELATIONSHIPS: ContactDraft['relationship'][] = ['family', 'friend', 'carer', 'neighbour', 'other']
const CHANNEL_TYPES: ChannelDraft['type'][] = ['phone', 'whatsapp', 'email', 'signal', 'other']

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const save = useSaveProfile()

  // step 1 — about you
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')

  // step 2 — health
  const [conditions, setConditions] = useState<string[]>([])
  const [sysT, setSysT] = useState(130)
  const [diaT, setDiaT] = useState(80)

  // step 3 — GP via map search
  const [gpQuery, setGpQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [gp, setGp] = useState<GpDraft | null>(null)

  // step 4 — emergency contacts
  const [contacts, setContacts] = useState<ContactDraft[]>([])
  const [cName, setCName] = useState('')
  const [cRel, setCRel] = useState<ContactDraft['relationship']>('family')
  const [cPrimary, setCPrimary] = useState(false)
  const [cChannels, setCChannels] = useState<ChannelDraft[]>([{ type: 'phone', value: '' }])

  // step 5 — companion
  const [kName, setKName] = useState('')
  const [kContact, setKContact] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggleCondition = (c: string) =>
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  // ---- GP search -------------------------------------------------------------
  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Location not available in this browser')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
        toast.success('Location captured — searches now prioritise your area')
      },
      () => {
        setLocating(false)
        toast.error('Location denied — you can still search by town or postcode')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const runSearch = async () => {
    if (gpQuery.trim().length < 3) return
    setSearching(true)
    setPlaces([])
    try {
      const params = new URLSearchParams({ q: gpQuery.trim() })
      if (near) {
        params.set('lat', String(near.lat))
        params.set('lng', String(near.lng))
      }
      const res = await fetch(`/api/places/search?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Search failed')
      setPlaces(json.places ?? [])
      if (!json.places?.length) toast.error('Nothing found — try adding a town or postcode')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed — you can enter details manually')
    } finally {
      setSearching(false)
    }
  }

  const pickPlace = (p: PlaceResult) => {
    setGp({
      name: p.name,
      org: p.name,
      address: p.address,
      phone: p.phone ?? '',
      website: p.website ?? '',
      placeId: p.id,
      plusCode: p.plusCode,
    })
    setPlaces([])
  }

  const saveContact = async () => {
    const channels = cChannels.filter((c) => c.value.trim().length >= 3)
    if (!cName.trim() || !channels.length) {
      toast.error('A name and at least one way to reach them is needed')
      return
    }
    const draft: ContactDraft = { name: cName.trim(), relationship: cRel, isPrimary: cPrimary, channels, saved: false }
    setContacts((prev) => [...prev, draft])
    setCName(''); setCChannels([{ type: 'phone', value: '' }]); setCPrimary(false)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, notes: null }),
      })
      if (!res.ok) throw new Error()
      setContacts((prev) => prev.map((c) => (c === draft ? { ...c, saved: true } : c)))
      toast.success(`${draft.name} will be contacted in an emergency`)
    } catch {
      toast.error(`Could not save ${draft.name} — retry from Settings`)
    }
  }

  const generateInvite = async () => {
    if (!kName.trim()) {
      toast.error('Give your companion a name first')
      return
    }
    try {
      const res = await fetch('/api/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: kName.trim(), contact: kContact.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setInviteToken(json.token)
      toast.success('Invite created — send it before you close this screen')
    } catch {
      toast.error('Could not create the invite — try again from Settings')
    }
  }

  // ---- finish ----------------------------------------------------------------
  const finish = () => {
    setSaving(true)
    save.mutate(
      {
        fullName: name || 'Friend',
        birthYear: birthYear ? Number(birthYear) : null,
        conditions,
        bpSystolicTarget: sysT,
        bpDiastolicTarget: diaT,
        onboarded: true,
        ...(gp ? {
          gpName: gp.name || null,
          gpOrg: gp.org || null,
          gpAddress: gp.address || null,
          gpPhone: gp.phone || null,
          gpWebsite: gp.website || null,
          gpPlaceId: gp.placeId,
          gpPlusCode: gp.plusCode,
        } : {}),
      },
      { onSuccess: onDone, onError: () => { setSaving(false); toast.error('Could not save — try again') } },
    )
  }

  const copyInvite = async () => {
    if (!inviteToken) return
    const url = `${window.location.origin}/companion/${inviteToken}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the link manually')
    }
  }

  // ---- chrome ----------------------------------------------------------------
  const back = () => setStep((s) => Math.max(0, s - 1))
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50/60 to-background p-4 dark:from-teal-950/20">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center gap-2" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="rounded-3xl border bg-card shadow-xl shadow-black/5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="p-6 sm:p-7"
            >
              {/* 0 — welcome */}
              {step === 0 && (
                <div className="py-3 text-center">
                  <OpenEirLogo className="eir-breathe mx-auto h-16 w-16" aria-hidden />
                  <h1 className="mt-4 text-2xl font-bold">Welcome to OpenEir</h1>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    A private, self-hosted companion for your health — with an ambient intelligence called{' '}
                    <b className="text-foreground">Eir</b> that watches your numbers, talks with you, and — if you ever
                    need it — hands everything a call-taker asks for to the right people. Your data never leaves your server.
                  </p>
                </div>
              )}

              {/* 1 — about you */}
              {step === 1 && (
                <div className="space-y-4">
                  <h1 className="text-xl font-bold">About you</h1>
                  <div>
                    <Label htmlFor="w-name">What should Eir call you?</Label>
                    <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" className="mt-1.5" autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="w-year">Birth year <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="w-year" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1968" className="mt-1.5" />
                  </div>
                  <p className="text-xs text-muted-foreground">Used only to personalise context and — in an emergency — to help responders.</p>
                </div>
              )}

              {/* 2 — health */}
              {step === 2 && (
                <div className="space-y-5">
                  <h1 className="text-xl font-bold">Your health</h1>
                  <div>
                    <Label>Do any of these apply?</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['Hypertension', 'Type 2 Diabetes', 'High cholesterol', 'Kidney concerns', 'Heart arrhythmia'].map((c) => (
                        <button
                          key={c} type="button" onClick={() => toggleCondition(c)} aria-pressed={conditions.includes(c)}
                          className={`min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors ${conditions.includes(c) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                        >
                          {conditions.includes(c) && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />}{c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-background/50 p-4 space-y-4">
                    <p className="text-xs text-muted-foreground">Standard adult targets are 130/80 — your doctor may set different ones. Changeable anytime.</p>
                    <div>
                      <Label>Systolic target: <b className="numeric">{sysT}</b> mmHg</Label>
                      <Slider value={[sysT]} min={110} max={150} step={1} onValueChange={(v) => setSysT(v[0])} className="mt-2.5" aria-label="Systolic target" />
                    </div>
                    <div>
                      <Label>Diastolic target: <b className="numeric">{diaT}</b> mmHg</Label>
                      <Slider value={[diaT]} min={65} max={100} step={1} onValueChange={(v) => setDiaT(v[0])} className="mt-2.5" aria-label="Diastolic target" />
                    </div>
                  </div>
                </div>
              )}

              {/* 3 — GP via map search */}
              {step === 3 && (
                <div className="space-y-4">
                  <h1 className="flex items-center gap-2 text-xl font-bold"><Stethoscope className="h-5 w-5 text-primary" aria-hidden /> Your doctor</h1>
                  <p className="text-sm text-muted-foreground">
                    Search for your GP practice — we pull the full details straight from the map so nothing is mistyped.
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        value={gpQuery}
                        onChange={(e) => setGpQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch() } }}
                        placeholder="Riverside Family Practice, Dublin"
                        className="pl-9"
                        aria-label="Search for your GP practice"
                      />
                    </div>
                    <Button type="button" variant="outline" size="icon" onClick={locateMe} disabled={locating} aria-label="Use my location to improve results" title="Use my location">
                      {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                    </Button>
                    <Button type="button" onClick={() => void runSearch()} disabled={searching || gpQuery.trim().length < 3}>
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                    </Button>
                  </div>
                  {near && <p className="text-xs text-muted-foreground">Prioritising results near your location. Deny and search by town instead — both work.</p>}

                  {places.length > 0 && (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border p-2" role="listbox" aria-label="Search results">
                      {places.map((p) => (
                        <button
                          key={p.id} type="button" onClick={() => pickPlace(p)}
                          className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors hover:bg-accent"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.address}</span>
                          </span>
                          <Badge variant="outline" className="ml-auto shrink-0 text-[9px] uppercase">{p.source}</Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {gp ? (
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{gp.name}</p>
                        <Check className="h-4 w-4 text-primary" aria-hidden />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{gp.address}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {gp.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden />{gp.phone}</span>}
                        {gp.website && <span className="inline-flex items-center gap-1 truncate"><Globe className="h-3 w-3" aria-hidden />{gp.website.replace(/^https?:\/\//, '').slice(0, 30)}</span>}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => setGp(null)}>Choose a different practice</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Can&apos;t find it? Skip ahead — you can enter details manually later in Settings.
                    </p>
                  )}
                </div>
              )}

              {/* 4 — emergency contacts */}
              {step === 4 && (
                <div className="space-y-4">
                  <h1 className="flex items-center gap-2 text-xl font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> Emergency contacts</h1>
                  <p className="text-sm text-muted-foreground">
                    When SOS fires, everyone here is contacted through <b className="text-foreground">every channel you list</b> — phone, WhatsApp, email. Add as many as you like; mark one as primary.
                  </p>

                  {contacts.length > 0 && (
                    <div className="space-y-2">
                      {contacts.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="flex items-center justify-between rounded-xl border bg-background/50 px-3 py-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              {c.name}
                              {c.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Primary contact" />}
                              {c.saved ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-label="Saved" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.relationship} · {c.channels.map((ch) => `${ch.type}: ${ch.value}`).join(', ')}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${c.name}`}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3 rounded-2xl border p-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="c-name">Name</Label>
                        <Input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Maria (sister)" className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="c-rel">Relationship</Label>
                        <select
                          id="c-rel" value={cRel} onChange={(e) => setCRel(e.target.value as ContactDraft['relationship'])}
                          className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                        >
                          {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label>Ways to reach them</Label>
                      <div className="mt-1 space-y-1.5">
                        {cChannels.map((ch, i) => (
                          <div key={i} className="flex gap-1.5">
                            <select
                              value={ch.type}
                              onChange={(e) => setCChannels((prev) => prev.map((x, j) => (j === i ? { ...x, type: e.target.value as ChannelDraft['type'] } : x)))}
                              className="h-9 w-28 shrink-0 rounded-md border bg-transparent px-2 text-xs"
                              aria-label={`Channel type ${i + 1}`}
                            >
                              {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <Input
                              value={ch.value}
                              onChange={(e) => setCChannels((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                              placeholder={ch.type === 'email' ? 'maria@example.com' : '+353 87 123 4567'}
                              className="flex-1"
                              aria-label={`Contact detail ${i + 1}`}
                            />
                            {cChannels.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCChannels((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove channel">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => setCChannels((prev) => [...prev, { type: 'phone', value: '' }])}>
                        <Plus className="mr-1 h-3 w-3" aria-hidden /> Add another way
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cPrimary} onChange={(e) => setCPrimary(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                      Primary contact (called first, shown first on the SOS card)
                    </label>
                    <Button onClick={() => void saveContact()} className="w-full" variant="outline">
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add contact
                    </Button>
                  </div>
                </div>
              )}

              {/* 5 — companion */}
              {step === 5 && (
                <div className="space-y-4">
                  <h1 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Trusted companion</h1>
                  <p className="text-sm text-muted-foreground">
                    One person who can check on you remotely — your check-in status, today&apos;s meds, latest vitals. They can also hear you live during an SOS, and they&apos;re automatically added as an emergency contact. You can revoke access anytime.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label htmlFor="k-name">Who is it?</Label>
                      <Input id="k-name" value={kName} onChange={(e) => setKName(e.target.value)} placeholder="David (partner)" className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="k-contact">Their phone or email <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="k-contact" value={kContact} onChange={(e) => setKContact(e.target.value)} placeholder="+353 87 987 6543" className="mt-1" />
                    </div>
                  </div>
                  {!inviteToken ? (
                    <Button onClick={() => void generateInvite()} variant="outline" className="w-full">
                      Create pairing invite
                    </Button>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <p className="text-sm font-semibold">Send this link to {kName || 'your companion'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">One-time, single-use. It pairs their device to you. Shown only now.</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2.5 py-1.5 text-xs">{`${typeof window !== 'undefined' ? window.location.origin : ''}/companion/${inviteToken}`}</code>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => void copyInvite()} aria-label="Copy invite link">
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                  <p className="text-xs text-muted-foreground">No companion? Skip — you can invite one anytime from Safety settings.</p>
                </div>
              )}

              {/* 6 — done */}
              {step === 6 && (
                <div className="space-y-4 py-3 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Check className="h-7 w-7" aria-hidden />
                  </div>
                  <h1 className="text-xl font-bold">You are set{name ? `, ${name.split(' ')[0]}` : ''}!</h1>
                  <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Start with a first reading so Eir can learn your baseline. Within a week you&apos;ll see patterns and gentle early warnings.
                    And the <b className="text-foreground">SOS button</b> is ready if you ever need it — it knows who to call and what to say.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between border-t px-6 py-4 sm:px-7">
            <Button variant="ghost" onClick={back} disabled={step === 0} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="gap-2">
                {step === 0 ? 'Get started' : 'Continue'} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="gap-2">
                {saving ? 'Setting up…' : 'Open OpenEir'} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Step {step + 1} of {STEPS.length} · everything is stored on your own server
        </p>
      </div>
    </div>
  )
}
