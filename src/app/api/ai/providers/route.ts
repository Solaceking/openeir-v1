// OpenEir — AI provider configuration CRUD (API keys encrypted at rest)
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { encryptSecret } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const ADAPTERS = ['openai_compatible', 'anthropic', 'ollama', 'cli'] as const

const createSchema = z.object({
  label: z.string().min(1).max(60),
  adapter: z.enum(ADAPTERS),
  baseUrl: z.string().url().nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  apiKey: z.string().max(400).nullable().optional(),
  priority: z.number().int().min(1).max(999).optional(),
  costPer1kIn: z.number().min(0).nullable().optional(),
  costPer1kOut: z.number().min(0).nullable().optional(),
  privacyMode: z.boolean().optional(),
})

const listSchema = z.object({
  id: z.string(),
  label: z.string(),
  adapter: z.string(),
  baseUrl: z.string().nullable(),
  model: z.string().nullable(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  priority: z.number(),
  privacyMode: z.boolean(),
  hasKey: z.boolean(),
  lastStatus: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
})

export async function GET() {
  const rows = await db.aiProviderConfig.findMany({ orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }] })
  const providers: (z.infer<typeof listSchema>)[] = rows.map((r) => ({
    id: r.id, label: r.label, adapter: r.adapter, baseUrl: r.baseUrl, model: r.model,
    enabled: r.enabled, isDefault: r.isDefault, priority: r.priority,
    privacyMode: r.privacyMode, hasKey: Boolean(r.apiKeyEnc),
    lastStatus: r.lastStatus, lastLatencyMs: r.lastLatencyMs,
  }))
  const usage = await db.aiUsage.findMany({ orderBy: { createdAt: 'desc' }, take: 40 })
  return ok({ providers, usage, builtin: { configured: false, source: null, checkedPaths: [] } })
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, createSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data
  // cli rows store the CLI id in `model` — no URL needed
  if (d.adapter !== 'cli' && !d.baseUrl) return fail('baseUrl is required for external providers', 422)
  const provider = await db.aiProviderConfig.create({
    data: {
      label: d.label,
      adapter: d.adapter,
      baseUrl: d.baseUrl ?? null,
      model: d.model ?? null,
      apiKeyEnc: d.apiKey ? encryptSecret(d.apiKey) : null,
      priority: d.priority ?? 100,
      costPer1kIn: d.costPer1kIn ?? null,
      costPer1kOut: d.costPer1kOut ?? null,
      privacyMode: d.privacyMode ?? false,
    },
  })
  return ok({ id: provider.id }, { status: 201 })
}
