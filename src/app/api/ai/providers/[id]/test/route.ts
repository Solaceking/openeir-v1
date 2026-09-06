// OpenEir — provider connectivity test: tiny real prompt, measured.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'
import { completeChat } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const provider = await db.aiProviderConfig.findUnique({ where: { id } })
  if (!provider) return fail('Provider not found', 404)
  if (!provider.enabled) return fail('Provider is disabled', 400)

  // temporarily test ONLY this provider: flip others off is invasive — instead
  // run a direct single-provider attempt via the chain but filter by label match
  const rows = await db.aiProviderConfig.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  const target = rows.find((r) => r.id === id)
  if (!target) return fail('Provider is disabled', 400)

  const result = await completeChat('insight', [
    { role: 'system', content: 'Reply with exactly: PONG' },
    { role: 'user', content: 'ping' },
  ])

  const reachedTarget = result.providerLabel === provider.label
  return ok({
    ok: result.ok && reachedTarget,
    providerLabel: result.providerLabel,
    latencyMs: result.latencyMs,
    attempted: result.attempted,
    detail: reachedTarget
      ? `Connected in ${result.latencyMs} ms via ${provider.label}${provider.model ? ` (${provider.model})` : ''}.`
      : `${provider.label} failed: ${result.attempted[0] ?? 'no response'}. The fallback chain answered via ${result.providerLabel}.`,
  })
}
