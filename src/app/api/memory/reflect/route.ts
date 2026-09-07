// OpenEir — Nightly Reflection trigger.
// POST → run today's reflection (idempotent; ?force=1 re-runs and overwrites).

import { ok, rateLimit, clientKey } from '@/lib/api-utils'
import { runNightlyReflection } from '@/lib/reflection'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'reflect'), 6, 60_000)) {
    return ok({ created: false, date: new Date().toISOString().slice(0, 10), content: '', aiNarrated: false, observation: null })
  }
  const force = new URL(req.url).searchParams.get('force') === '1'
  const result = await runNightlyReflection(force)
  return ok(result)
}
