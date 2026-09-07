import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex')
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

/**
 * Companion's scoped view. Auth: Bearer viewer token (hash lookup).
 * Returns ONLY the consented scopes — status, meds, vitals. No location.
 * Also returns any ACTIVE emergency event so the companion sees it instantly.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return fail('Not paired', 401)

  const link = await db.companionLink.findUnique({ where: { viewerHash: sha256(token) } })
  if (!link || link.status !== 'active') return fail('Access revoked or invalid', 403)

  // presence heartbeat for the user's "companion last visited" panel
  void db.companionLink.update({ where: { id: link.id }, data: { lastSeenAt: new Date() } }).catch(() => {})

  const scopes: string[] = JSON.parse(link.scopes)

  const [profile, lastBp, lastGlucose, activeMeds, todayLogs, lastCheckin, lastAppOpen, activeSos] = await Promise.all([
    db.profile.findFirst(),
    db.bpReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.glucoseReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.medication.findMany({ where: { active: true } }),
    db.medicationLog.findMany({ where: { date: todayKey() }, include: { medication: true } }),
    db.appSetting.findUnique({ where: { key: 'last_checkin' } }),
    db.appSetting.findUnique({ where: { key: 'last_app_open' } }),
    db.emergencyEvent.findFirst({ where: { status: 'active' }, orderBy: { startedAt: 'desc' } }),
  ])

  const taken = todayLogs.filter((l) => l.status === 'taken').length
  const missed = todayLogs.filter((l) => l.status === 'missed' || l.status === 'skipped').length
  const pending = todayLogs.length - taken - missed

  return ok({
    companionName: link.name,
    user: {
      name: profile?.fullName ?? 'Unknown',
      lastCheckin: lastCheckin?.value ?? null,
      checkinHoursAgo: hoursSince(lastCheckin?.value),
      lastAppOpen: lastAppOpen?.value ?? null,
      appOpenHoursAgo: hoursSince(lastAppOpen?.value),
    },
    meds: scopes.includes('meds')
      ? {
          total: activeMeds.length,
          taken, missed, pending,
          schedule: activeMeds.map((m) => ({ name: m.name, dose: `${m.doseValue}${m.doseUnit}`, times: JSON.parse(m.scheduleTimes) as string[] })),
        }
      : null,
    vitals: scopes.includes('vitals')
      ? {
          lastBp: lastBp ? { systolic: lastBp.systolic, diastolic: lastBp.diastolic, pulse: lastBp.pulse, at: lastBp.takenAt } : null,
          lastGlucose: lastGlucose ? { value: lastGlucose.value, unit: profile?.glucoseUnit ?? 'mmol', at: lastGlucose.takenAt } : null,
        }
      : null,
    activeEmergency: activeSos
      ? { since: activeSos.startedAt, sharePath: `/sos/${activeSos.shareToken}` }
      : null,
  })
}
