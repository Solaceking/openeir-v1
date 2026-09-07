import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { encryptSecret } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  baseUrl: z.string().url().nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  apiKey: z.string().max(400).nullable().optional(),
  clearKey: z.boolean().optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(1).max(999).optional(),
  privacyMode: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data
  const existing = await db.aiProviderConfig.findUnique({ where: { id } })
  if (!existing) return fail('Provider not found', 404)

  if (d.isDefault) {
    await db.aiProviderConfig.updateMany({ data: { isDefault: false } })
  }
  const provider = await db.aiProviderConfig.update({
    where: { id },
    data: {
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.baseUrl !== undefined ? { baseUrl: d.baseUrl } : {}),
      ...(d.model !== undefined ? { model: d.model } : {}),
      ...(d.apiKey ? { apiKeyEnc: encryptSecret(d.apiKey) } : {}),
      ...(d.clearKey ? { apiKeyEnc: null } : {}),
      ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
      ...(d.isDefault !== undefined ? { isDefault: d.isDefault } : {}),
      ...(d.priority !== undefined ? { priority: d.priority } : {}),
      ...(d.privacyMode !== undefined ? { privacyMode: d.privacyMode } : {}),
    },
  })
  return ok({ id: provider.id, isDefault: provider.isDefault })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.aiProviderConfig.findUnique({ where: { id } })
  if (!existing) return fail('Provider not found', 404)
  await db.aiProviderConfig.delete({ where: { id } })
  return ok({ deleted: id })
}
