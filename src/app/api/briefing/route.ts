// OpenEir — Morning Briefing API.
// GET  → today's briefing, built fresh from the shared health context.
// POST → deliver: optional push to all devices + mark "delivered today".
//        Idempotency is ENFORCED here on the server: a second automatic
//        delivery for the same calendar day is rejected with 409, so a stale
//        tab, a scheduler race or an old client can never spam devices or
//        toasts. Manual re-sends pass force:true and always go through.

import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { buildHealthContext } from '@/lib/ai/context'
import { buildBriefing } from '@/lib/briefing'
import { getBriefingConfig } from '@/lib/briefing-config'
import { sendPushToAll } from '@/lib/push'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const deliverSchema = z.object({ push: z.boolean().default(true), force: z.boolean().default(false) })

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const [ctx, config] = await Promise.all([buildHealthContext(), getBriefingConfig()])
  if (!ctx) return fail('Complete setup first', 400)

  // Today's scheduled doses (every active med × its slots, joined with log status)
  const meds = await db.medication.findMany({ where: { active: true } })
  const logs = await db.medicationLog.findMany({ where: { date: todayKey() } })
  const todayDoses = meds.flatMap((m) => {
    let slots: string[] = []
    try { slots = JSON.parse(m.scheduleTimes) as string[] } catch { slots = [] }
    return slots.map((time) => {
      const log = logs.find((l) => l.medicationId === m.id && l.scheduledTime === time)
      return { time, label: `${m.name} ${m.doseValue}${m.doseUnit}`, status: log?.status ?? 'pending' }
    })
  }).sort((a, b) => a.time.localeCompare(b.time))

  const briefing = buildBriefing({ ctx, todayDoses })
  const delivered = await db.appSetting.findUnique({ where: { key: 'briefing.lastDelivered' } })

  return ok({
    briefing,
    date: todayKey(),
    deliveredToday: delivered?.value === todayKey(),
    config,
  })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'briefing'), 10, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, deliverSchema)
  if ('response' in parsed) return parsed.response

  const ctx = await buildHealthContext()
  if (!ctx) return fail('Complete setup first', 400)

  // Single source of truth: one automatic delivery per calendar day.
  const prior = await db.appSetting.findUnique({ where: { key: 'briefing.lastDelivered' } })
  if (prior?.value === todayKey() && !parsed.data.force) {
    return fail('Briefing was already delivered today', 409)
  }

  const meds = await db.medication.findMany({ where: { active: true } })
  const logs = await db.medicationLog.findMany({ where: { date: todayKey() } })
  const todayDoses = meds.flatMap((m) => {
    let slots: string[] = []
    try { slots = JSON.parse(m.scheduleTimes) as string[] } catch { slots = [] }
    return slots.map((time) => ({ time, label: `${m.name} ${m.doseValue}${m.doseUnit}` }))
  })

  const briefing = buildBriefing({ ctx, todayDoses })

  let push: { sent: number; failed: number; pruned: number } | null = null
  if (parsed.data.push) {
    push = await sendPushToAll({
      title: `Morning briefing — ${briefing.headline}`,
      body: briefing.sections[0]?.text.slice(0, 180) ?? 'Your daily snapshot is ready.',
      kind: 'briefing',
      url: '/?view=dashboard',
      tag: `briefing-${todayKey()}`,
    })
  }

  await db.appSetting.upsert({
    where: { key: 'briefing.lastDelivered' },
    update: { value: todayKey() },
    create: { key: 'briefing.lastDelivered', value: todayKey() },
  })
  await db.eventRecord.create({
    data: { type: 'BRIEFING_DELIVERED', priority: 'low', payload: JSON.stringify({ date: todayKey(), pushed: push?.sent ?? 0 }) },
  }).catch(() => {})

  return ok({ briefing, push, date: todayKey() })
}
