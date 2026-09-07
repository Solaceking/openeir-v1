import { db } from '@/lib/db'
import type { Metadata } from 'next'
import { Phone, MapPin, ShieldAlert } from 'lucide-react'
import { OpenEirLogo } from '@/components/logo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Emergency card — OpenEir',
  robots: { index: false, follow: false },
}

interface Pkg {
  identity: { name: string; age: number | null; sex: string | null; conditions: string[]; allergies: string | null }
  location: { lat: number; lng: number; accuracyM: number | null; plusCode: string | null; mapsUrl: string; address: string | null; country: string | null }
  emergency: { number: string; nearest: { name: string; address: string; phone: string | null } | null }
  clinical: { lastBp: { systolic: number; diastolic: number; pulse: number | null; at: string } | null; lastGlucose: { value: number; unit: string; at: string } | null; medications: { name: string; dose: string; form: string; purpose: string | null }[]; dosesToday: { med: string; time: string; status: string }[]; lastWellnessNote: string | null }
  gp: { name: string; org: string | null; phone: string | null; address: string | null } | null
  contacts: { name: string; relationship: string; primary: boolean; channels: { type: string; value: string }[] }[]
  note: string | null
  generatedAt: string
}

export default async function SosCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const event = await db.emergencyEvent.findUnique({ where: { shareToken: token } })

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <OpenEirLogo className="mx-auto h-10 w-10 opacity-40" />
          <h1 className="mt-4 text-xl font-semibold">Card not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">This emergency link is invalid or was revoked.</p>
        </div>
      </main>
    )
  }

  const pkg: Pkg | null = event.packageJson ? JSON.parse(event.packageJson) : null
  const ctx = event.context ? JSON.parse(event.context) as { emergencyNumber?: string } : null
  const resolved = event.status !== 'active'

  if (!pkg) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <h1 className="text-lg font-semibold">Emergency card is empty</h1>
      </main>
    )
  }

  const i = pkg.identity
  const loc = pkg.location

  return (
    <main className="mx-auto max-w-2xl bg-background p-4 sm:p-6">
      {/* header band */}
      <div className={`rounded-3xl p-6 text-white ${resolved ? 'bg-slate-700' : 'bg-gradient-to-br from-red-700 to-red-900'}`}>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-90">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Emergency medical card
          </span>
          <span className="text-xs opacity-75">{resolved ? 'Event resolved' : 'ACTIVE'}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{i.name}{i.age ? `, ${i.age}` : ''}</h1>
        <p className="mt-1 text-sm opacity-85">
          {i.sex ? `${i.sex[0].toUpperCase()}${i.sex.slice(1)} · ` : ''}{i.conditions.length ? i.conditions.join(' · ') : 'No recorded conditions'}
        </p>
        {i.allergies && (
          <p className="mt-2 inline-block rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold">ALLERGIES: {i.allergies}</p>
        )}
        <a
          href={`tel:${ctx?.emergencyNumber ?? pkg.emergency.number}`}
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-xl font-bold text-red-800 shadow-lg"
        >
          <Phone className="h-6 w-6" aria-hidden /> Call {ctx?.emergencyNumber ?? pkg.emergency.number}
        </a>
      </div>

      {/* where — the most time-critical block */}
      <section className="mt-4 rounded-2xl border-2 border-red-900/25 p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Where they are</h2>
        {loc.address && <p className="mt-1.5 text-lg font-medium leading-snug">{loc.address}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {loc.plusCode && <span className="numeric rounded-lg bg-muted px-2.5 py-1 font-mono font-semibold">{loc.plusCode}</span>}
          <a href={loc.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
            <MapPin className="h-4 w-4" aria-hidden /> Open in maps
          </a>
          {loc.accuracyM != null && <span className="text-xs text-muted-foreground">±{Math.round(loc.accuracyM)}m accuracy</span>}
        </div>
        {pkg.emergency.nearest && (
          <p className="mt-2 text-sm text-muted-foreground">
            Nearest ED: <b className="text-foreground">{pkg.emergency.nearest.name}</b>
            {pkg.emergency.nearest.phone && <> · <a href={`tel:${pkg.emergency.nearest.phone}`} className="text-primary">{pkg.emergency.nearest.phone}</a></>}
          </p>
        )}
      </section>

      {/* clinical snapshot */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Medications</h2>
          {pkg.clinical.medications.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {pkg.clinical.medications.map((m) => (
                <li key={m.name}><b>{m.name}</b> {m.dose}{m.purpose ? <span className="text-muted-foreground"> — {m.purpose}</span> : null}</li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">None recorded</p>}
        </div>
        <div className="rounded-2xl border p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Latest readings</h2>
          <div className="mt-2 space-y-1.5 text-sm numeric">
            {pkg.clinical.lastBp && <p>Blood pressure <b>{pkg.clinical.lastBp.systolic}/{pkg.clinical.lastBp.diastolic}</b>{pkg.clinical.lastBp.pulse ? `, pulse ${pkg.clinical.lastBp.pulse}` : ''}</p>}
            {pkg.clinical.lastGlucose && <p>Glucose <b>{pkg.clinical.lastGlucose.value} {pkg.clinical.lastGlucose.unit}</b></p>}
            {!pkg.clinical.lastBp && !pkg.clinical.lastGlucose && <p className="text-muted-foreground">No readings recorded</p>}
          </div>
          {pkg.note && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">“{pkg.note}”</p>}
        </div>
      </section>

      {/* who to call */}
      <section className="mt-4 rounded-2xl border p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">People to call</h2>
        {pkg.contacts.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {pkg.contacts.map((c) => (
              <div key={`${c.name}-${c.channels[0]?.value ?? ''}`} className="rounded-xl border bg-background/50 p-3">
                <p className="text-sm font-semibold">{c.name} {c.primary && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">primary</span>}</p>
                <p className="text-xs text-muted-foreground">{c.relationship}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {c.channels.map((ch) => (
                    ch.type === 'email'
                      ? <a key={ch.value} href={`mailto:${ch.value}`} className="text-xs font-medium text-primary">{ch.value}</a>
                      : <a key={ch.value} href={`tel:${ch.value}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Phone className="h-3 w-3" aria-hidden />{ch.value}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">None listed</p>}
      </section>

      {/* GP */}
      {pkg.gp && (
        <section className="mt-4 rounded-2xl border p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Their doctor</h2>
          <p className="mt-1.5 text-sm font-semibold">{pkg.gp.name}{pkg.gp.org ? ` — ${pkg.gp.org}` : ''}</p>
          {pkg.gp.address && <p className="text-xs text-muted-foreground">{pkg.gp.address}</p>}
          {pkg.gp.phone && <a href={`tel:${pkg.gp.phone}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary"><Phone className="h-3 w-3" aria-hidden /> {pkg.gp.phone}</a>}
        </section>
      )}

      <footer className="mt-6 pb-10 text-center text-[11px] leading-relaxed text-muted-foreground">
        Generated by OpenEir — {new Date(pkg.generatedAt).toLocaleString()} · shared once by the device owner · contains medical information, handle with care
      </footer>
    </main>
  )
}
