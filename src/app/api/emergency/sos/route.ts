import { randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { nearestMedicalFacility, reverseGeocode, emergencyNumberForCountry, plusCode } from '@/lib/places'
import { sendPushToAll } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const sosSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).optional(),
  note: z.string().max(500).optional(),
  kind: z.enum(['sos', 'fall', 'checkin_missed']).default('sos'),
})

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const events = await db.emergencyEvent.findMany({ orderBy: { startedAt: 'desc' }, take: 20 })
  return ok({
    events: events.map((e) => ({
      ...e,
      location: e.location ? JSON.parse(e.location) : null,
      context: e.context ? JSON.parse(e.context) : null,
      notifiedVia: JSON.parse(e.notifiedVia),
    })),
  })
}

/**
 * Emergency activation. Builds the complete dispatcher package in one shot:
 * who I am, where I am (GPS + plus code + maps link), my clinical snapshot
 * (latest BP/glucose, active meds, today's adherence), my GP, my contacts —
 * then resolves the local emergency number and nearest emergency department.
 * Outbound channel blast (push/email/SMS) attaches to this event next.
 */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'sos'), 6, 60_000)) return fail('Too many SOS activations', 429)
  const parsed = await parseBody(req, sosSchema)
  if ('response' in parsed) return parsed.response
  const { lat, lng, accuracyM, note, kind } = parsed.data

  // 1) Clinical + identity snapshot (everything a call-taker asks for)
  const [profile, lastBp, lastGlucose, activeMeds, todayLogs, lifestyle, contacts, companions] = await Promise.all([
    db.profile.findFirst(),
    db.bpReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.glucoseReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.medication.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.medicationLog.findMany({ where: { date: todayKey() }, include: { medication: true } }),
    db.lifestyleLog.findFirst({ orderBy: { date: 'desc' } }),
    db.emergencyContact.findMany({ where: { active: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
    db.companionLink.findMany({ where: { status: 'active' } }),
  ])

  const age = profile?.birthYear ? new Date().getFullYear() - profile.birthYear : null

  // 2) Where am I, really — country → local emergency number, nearest ED
  const [geo, nearest] = await Promise.all([
    reverseGeocode(lat, lng),
    nearestMedicalFacility({ lat, lng }),
  ])
  const emergencyNumber = emergencyNumberForCountry(geo?.countryCode ?? '')
  const pc = plusCode(lat, lng)
  const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`

  // 3) The dispatcher package — read this screen to the call-taker
  const pkg = {
    identity: {
      name: profile?.fullName ?? 'Unknown',
      age,
      sex: profile?.sex ?? null,
      conditions: profile ? JSON.parse(profile.conditions) : [],
      allergies: profile?.notes?.match(/allerg(?:y|ies)[:\s]([^\n]+)/i)?.[1]?.trim() ?? null,
    },
    location: {
      lat, lng,
      accuracyM: accuracyM ?? null,
      plusCode: pc,
      mapsUrl,
      address: geo?.displayName ?? null,
      country: geo?.country ?? null,
    },
    emergency: {
      number: emergencyNumber,
      nearest: nearest ? { name: nearest.name, address: nearest.address, phone: nearest.phone, source: nearest.source } : null,
    },
    clinical: {
      lastBp: lastBp ? { systolic: lastBp.systolic, diastolic: lastBp.diastolic, pulse: lastBp.pulse, at: lastBp.takenAt } : null,
      lastGlucose: lastGlucose ? { value: lastGlucose.value, unit: profile?.glucoseUnit ?? 'mmol', at: lastGlucose.takenAt } : null,
      medications: activeMeds.map((m) => ({ name: m.name, dose: `${m.doseValue}${m.doseUnit}`, form: m.form, purpose: m.purpose })),
      dosesToday: todayLogs.map((l) => ({ med: l.medication.name, time: l.scheduledTime, status: l.status })),
      lastWellnessNote: lifestyle?.notes ?? null,
    },
    gp: profile?.gpName ? {
      name: profile.gpName, org: profile.gpOrg, phone: profile.gpPhone, address: profile.gpAddress,
    } : null,
    contacts: contacts.map((c) => ({ name: c.name, relationship: c.relationship, primary: c.isPrimary, channels: JSON.parse(c.channels) })),
    companions: companions.map((c) => c.name),
    note: note ?? null,
    generatedAt: new Date().toISOString(),
  }

  // 4) Persist — full audit trail + public share token for the card page
  const shareToken = randomBytes(24).toString('base64url')
  const event = await db.emergencyEvent.create({
    data: {
      kind,
      status: 'active',
      location: JSON.stringify({ lat, lng, accuracyM: accuracyM ?? null }),
      context: JSON.stringify({ country: geo?.country ?? null, countryCode: geo?.countryCode ?? null, emergencyNumber, nearest, plusCode: pc, mapsUrl }),
      packageJson: JSON.stringify(pkg),
      shareToken,
      notifiedVia: JSON.stringify([]),
      note: note ?? null,
    },
  })

  // 5) Outbound push blast — reaches every subscribed device (user + companions)
  //    even when the app is closed. Channels actually attempted are audited.
  const notifiedVia: string[] = []
  try {
    const pushResult = await sendPushToAll({
      title: `SOS activated — ${pkg.identity.name}`,
      body: `Emergency package ready. Location: ${pkg.location.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}. Tap to open the dispatcher card.`,
      kind: 'sos',
      url: `/sos/${shareToken}`,
      tag: `sos-${event.id}`,
    })
    if (pushResult.sent > 0) notifiedVia.push('push')
  } catch {
    /* push is best-effort — never delay the SOS response */
  }

  // 6) Feed the event nervous system (ambient intelligence + future automation)
  await db.eventRecord.create({
    data: { type: 'SOS_TRIGGERED', priority: 'critical', payload: JSON.stringify({ eventId: event.id, emergencyNumber, country: geo?.countryCode ?? null, notifiedVia }) },
  })
  await db.emergencyEvent.update({ where: { id: event.id }, data: { notifiedVia: JSON.stringify(notifiedVia) } }).catch(() => {})

  return ok({
    event: {
      id: event.id,
      shareToken,
      sharePath: `/sos/${shareToken}`,
      startedAt: event.startedAt,
    },
    package: pkg,
  })
}
