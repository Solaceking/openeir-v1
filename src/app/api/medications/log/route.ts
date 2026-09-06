import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

const logSchema = z.object({
  medicationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.enum(['taken', 'skipped', 'delayed', 'missed', 'pending']),
  actualTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'medlog'), 120, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, logSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data

  const med = await db.medication.findUnique({ where: { id: d.medicationId } })
  if (!med) return fail('Medication not found', 404)

  const log = await db.medicationLog.upsert({
    where: { medicationId_date_scheduledTime: { medicationId: d.medicationId, date: d.date, scheduledTime: d.scheduledTime } },
    create: {
      medicationId: d.medicationId,
      date: d.date,
      scheduledTime: d.scheduledTime,
      status: d.status,
      actualTime: d.actualTime ?? null,
      note: d.note ?? null,
    },
    update: { status: d.status, actualTime: d.actualTime ?? null, note: d.note ?? null },
  })

  // inventory management: decrement on take, restore on un-take
  if (med.stock !== null && med.stock !== undefined) {
    const wasTaken = log.status === 'taken' || log.status === 'delayed'
    if (d.status === 'taken' || d.status === 'delayed') {
      if (!wasTaken) {
        await db.medication.update({ where: { id: med.id }, data: { stock: Math.max(0, med.stock - 1) } })
      }
    } else if (wasTaken) {
      await db.medication.update({ where: { id: med.id }, data: { stock: med.stock + 1 } })
    }
  }

  if (d.status === 'missed') {
    await emitEvent('MEDICATION_MISSED', { medicationName: med.name, medicationId: med.id, scheduledTime: d.scheduledTime }, 'high')
  } else if (d.status === 'taken' || d.status === 'delayed') {
    await emitEvent('MEDICATION_TAKEN', { medicationName: med.name, medicationId: med.id }, 'low')
  }

  return ok({ log })
}
