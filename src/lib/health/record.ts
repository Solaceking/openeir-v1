// OpenEir — the ONE write path for tracked health data.
//
// Every writer — REST routes, the chat tool layer, voice, OCR, the realtime
// voice agent — calls these functions. Business rules (duplicate guards,
// inventory/stock effects, event emission) live here exactly once, so a tool
// and a route can never disagree about what a valid action looks like.
//
// The route handlers in /api/readings/*, /api/medications/log and
// /api/lifestyle are thin wrappers around this module; the agent tool layer
// (src/lib/ai/tools.ts) validates args with the same zod schemas.

import { z } from 'zod'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { detectDuplicate } from '@/lib/pipeline/dedupe'

// ---------- shared zod schemas (single source for routes AND tools) ----------

export const bpInputSchema = z.object({
  systolic: z.number().int().min(60).max(260),
  diastolic: z.number().int().min(30).max(180),
  pulse: z.number().int().min(25).max(250).nullable().optional(),
  arm: z.enum(['left', 'right']).optional(),
  label: z.enum(['morning', 'evening', 'pre_med', 'post_med', 'general']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
  source: z.enum(['manual', 'bluetooth', 'import', 'voice', 'ocr', 'chat', 'agent']).optional(),
  /** machine captures may override a duplicate guard after user confirmation */
  force: z.boolean().optional(),
})

export const glucoseInputSchema = z.object({
  value: z.number().min(1).max(40), // canonical mmol/L
  context: z.enum(['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random']).optional(),
  carbs: z.number().min(0).max(500).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
  source: z.enum(['manual', 'bluetooth', 'import', 'voice', 'ocr', 'chat', 'agent']).optional(),
  force: z.boolean().optional(),
})

export const medLogInputSchema = z.object({
  medicationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.enum(['taken', 'skipped', 'delayed', 'missed', 'pending']),
  actualTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

export const lifestyleInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  sleepQuality: z.number().int().min(1).max(5).nullable().optional(),
  stress: z.number().int().min(1).max(5).nullable().optional(),
  weightKg: z.number().min(25).max(400).nullable().optional(),
  sodiumHigh: z.boolean().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export type BpInput = z.infer<typeof bpInputSchema>
export type GlucoseInput = z.infer<typeof glucoseInputSchema>
export type MedLogInput = z.infer<typeof medLogInputSchema>
export type LifestyleInput = z.infer<typeof lifestyleInputSchema>

export type RecordResult =
  | { saved: true; kind: string; id: string; summary: string; row: Record<string, unknown> }
  | { saved: false; duplicate: true; existing: { id: string; takenAt?: Date | string; summary: string }; summary: string }

// ---------- blood pressure ----------

export async function logBpReading(d: BpInput): Promise<RecordResult> {
  const source = d.source ?? 'manual'

  // Unified input pipeline: voice/ocr/chat/agent captures must not silently
  // double-log a reading another source already recorded.
  if (!d.force) {
    const dup = await detectDuplicate(source, {
      findExisting: async () => {
        const takenAt = d.takenAt ? new Date(d.takenAt) : new Date()
        const since = new Date(takenAt.getTime() - 3 * 60 * 1000)
        const until = new Date(takenAt.getTime() + 3 * 60 * 1000)
        return db.bpReading.findFirst({
          where: { takenAt: { gte: since, lte: until }, systolic: d.systolic, diastolic: d.diastolic },
          orderBy: { takenAt: 'desc' },
        })
      },
      isSame: (existing) => existing.systolic === d.systolic && existing.diastolic === d.diastolic,
    })
    if (dup.duplicate && dup.existing) {
      return {
        saved: false,
        duplicate: true,
        existing: {
          id: dup.existing.id,
          takenAt: dup.existing.takenAt,
          summary: `${dup.existing.systolic}/${dup.existing.diastolic} (${dup.existing.source})`,
        },
        summary: 'An identical reading was already captured within the last few minutes.',
      }
    }
  }

  const reading = await db.bpReading.create({
    data: {
      systolic: d.systolic,
      diastolic: d.diastolic,
      pulse: d.pulse ?? null,
      arm: d.arm ?? 'left',
      label: d.label ?? 'general',
      tags: JSON.stringify(d.tags ?? []),
      notes: d.notes ?? null,
      source,
      takenAt: d.takenAt ? new Date(d.takenAt) : new Date(),
    },
  })

  await emitEvent('READING_LOGGED', { kind: 'bp', id: reading.id, systolic: d.systolic, diastolic: d.diastolic }, d.systolic >= 140 || d.diastolic >= 90 ? 'high' : 'normal')
  return {
    saved: true,
    kind: 'bp',
    id: reading.id,
    row: reading as unknown as Record<string, unknown>,
    summary: `BP ${d.systolic}/${d.diastolic}${d.pulse ? ` pulse ${d.pulse}` : ''} logged (${d.label ?? 'general'})`,
  }
}

// ---------- glucose ----------

export async function logGlucoseReading(d: GlucoseInput): Promise<RecordResult> {
  const source = d.source ?? 'manual'

  if (!d.force) {
    const dup = await detectDuplicate(source, {
      findExisting: async () => {
        const takenAt = d.takenAt ? new Date(d.takenAt) : new Date()
        const since = new Date(takenAt.getTime() - 3 * 60 * 1000)
        const until = new Date(takenAt.getTime() + 3 * 60 * 1000)
        return db.glucoseReading.findFirst({
          where: { takenAt: { gte: since, lte: until }, value: d.value },
          orderBy: { takenAt: 'desc' },
        })
      },
      isSame: (existing) => Math.abs(existing.value - d.value) < 0.001,
    })
    if (dup.duplicate && dup.existing) {
      return {
        saved: false,
        duplicate: true,
        existing: {
          id: dup.existing.id,
          takenAt: dup.existing.takenAt,
          summary: `${dup.existing.value} mmol/L (${dup.existing.source})`,
        },
        summary: 'An identical reading was already captured within the last few minutes.',
      }
    }
  }

  const reading = await db.glucoseReading.create({
    data: {
      value: d.value,
      context: d.context ?? 'random',
      carbs: d.carbs ?? null,
      tags: JSON.stringify(d.tags ?? []),
      notes: d.notes ?? null,
      source,
      takenAt: d.takenAt ? new Date(d.takenAt) : new Date(),
    },
  })

  await emitEvent(
    'READING_LOGGED',
    { kind: 'glucose', id: reading.id, value: d.value, context: d.context ?? 'random' },
    d.value < 3.9 || d.value > 13.9 ? 'high' : 'normal',
  )
  return {
    saved: true,
    kind: 'glucose',
    id: reading.id,
    row: reading as unknown as Record<string, unknown>,
    summary: `Glucose ${d.value} mmol/L (${d.context ?? 'random'}) logged`,
  }
}

// ---------- medication status ----------

export async function logMedicationStatus(d: MedLogInput): Promise<{ saved: true; id: string; summary: string; row: Record<string, unknown> }> {
  const med = await db.medication.findUnique({ where: { id: d.medicationId } })
  if (!med) throw new Error('Medication not found')

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

  return {
    saved: true,
    id: log.id,
    row: log as unknown as Record<string, unknown>,
    summary: `${med.name} ${d.status} for ${d.date} ${d.scheduledTime}`,
  }
}

// ---------- lifestyle (mood / sleep / weight / stress) ----------

export async function upsertLifestyleLog(d: LifestyleInput): Promise<{ saved: true; id: string; summary: string; row: Record<string, unknown> }> {
  const { date, ...rest } = d
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  const log = await db.lifestyleLog.upsert({
    where: { date },
    create: { date, ...clean },
    update: clean,
  })
  void emitEvent('PATTERN_CHECK', { kind: 'lifestyle' }, 'low')
  const bits = [
    d.mood != null ? `mood ${d.mood}/5` : null,
    d.energy != null ? `energy ${d.energy}/5` : null,
    d.sleepQuality != null ? `sleep ${d.sleepQuality}/5` : null,
    d.stress != null ? `stress ${d.stress}/5` : null,
    d.weightKg != null ? `weight ${d.weightKg} kg` : null,
    d.sodiumHigh != null ? `sodium ${d.sodiumHigh ? 'high' : 'ok'}` : null,
  ].filter(Boolean)
  return { saved: true, id: log.id, row: log as unknown as Record<string, unknown>, summary: `Lifestyle ${date}: ${bits.join(', ') || 'updated'}` }
}

// ---------- local date helper (shared by tool layer + routes) ----------

export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
