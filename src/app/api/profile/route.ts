import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const prefsSchema = z.record(z.string(), z.unknown())

const profileSchema = z.object({
  fullName: z.string().min(1).max(80),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  heightCm: z.number().min(50).max(250).nullable().optional(),
  conditions: z.array(z.string().max(60)).max(12).optional(),
  notes: z.string().max(2000).nullable().optional(),
  bpSystolicTarget: z.number().int().min(100).max(160).optional(),
  bpDiastolicTarget: z.number().int().min(60).max(110).optional(),
  glucoseTargetMin: z.number().min(2).max(8).optional(),
  glucoseTargetMax: z.number().min(4).max(15).optional(),
  glucoseUnit: z.enum(['mmol', 'mgdl']).optional(),
  weightTargetKg: z.number().min(30).max(300).nullable().optional(),
  onboarded: z.boolean().optional(),
  // GP details (filled via map search in the wizard)
  gpName: z.string().max(120).nullable().optional(),
  gpOrg: z.string().max(160).nullable().optional(),
  gpEmail: z.string().email().max(200).nullable().optional(),
  gpAddress: z.string().max(300).nullable().optional(),
  gpPhone: z.string().max(40).nullable().optional(),
  gpWebsite: z.string().max(200).nullable().optional(),
  gpPlaceId: z.string().max(200).nullable().optional(),
  gpPlusCode: z.string().max(20).nullable().optional(),
  gpNotes: z.string().max(500).nullable().optional(),
  prefs: prefsSchema.optional(),
})

export async function GET() {
  let profile = await db.profile.findFirst()
  if (!profile) {
    profile = await db.profile.create({ data: {} })
  }
  return ok({ profile: { ...profile, conditions: JSON.parse(profile.conditions), prefs: JSON.parse(profile.prefs) } })
}

export async function PUT(req: Request) {
  if (!rateLimit(clientKey(req, 'profile'), 30, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, profileSchema)
  if ('response' in parsed) return parsed.response
  const data = parsed.data

  const existing = await db.profile.findFirst()
  const values = {
    fullName: data.fullName,
    birthYear: data.birthYear ?? null,
    sex: data.sex ?? null,
    heightCm: data.heightCm ?? null,
    conditions: JSON.stringify(data.conditions ?? []),
    notes: data.notes ?? null,
    ...(data.bpSystolicTarget !== undefined ? { bpSystolicTarget: data.bpSystolicTarget } : {}),
    ...(data.bpDiastolicTarget !== undefined ? { bpDiastolicTarget: data.bpDiastolicTarget } : {}),
    ...(data.glucoseTargetMin !== undefined ? { glucoseTargetMin: data.glucoseTargetMin } : {}),
    ...(data.glucoseTargetMax !== undefined ? { glucoseTargetMax: data.glucoseTargetMax } : {}),
    ...(data.glucoseUnit !== undefined ? { glucoseUnit: data.glucoseUnit } : {}),
    weightTargetKg: data.weightTargetKg ?? null,
    ...(data.onboarded !== undefined ? { onboarded: data.onboarded } : {}),
    ...(data.gpName !== undefined ? { gpName: data.gpName } : {}),
    ...(data.gpOrg !== undefined ? { gpOrg: data.gpOrg } : {}),
    ...(data.gpEmail !== undefined ? { gpEmail: data.gpEmail } : {}),
    ...(data.gpAddress !== undefined ? { gpAddress: data.gpAddress } : {}),
    ...(data.gpPhone !== undefined ? { gpPhone: data.gpPhone } : {}),
    ...(data.gpWebsite !== undefined ? { gpWebsite: data.gpWebsite } : {}),
    ...(data.gpPlaceId !== undefined ? { gpPlaceId: data.gpPlaceId } : {}),
    ...(data.gpPlusCode !== undefined ? { gpPlusCode: data.gpPlusCode } : {}),
    ...(data.gpNotes !== undefined ? { gpNotes: data.gpNotes } : {}),
    ...(data.prefs !== undefined ? { prefs: JSON.stringify(data.prefs) } : {}),
  }
  const profile = existing
    ? await db.profile.update({ where: { id: existing.id }, data: values })
    : await db.profile.create({ data: values })
  return ok({ profile: { ...profile, conditions: JSON.parse(profile.conditions), prefs: JSON.parse(profile.prefs) } })
}
