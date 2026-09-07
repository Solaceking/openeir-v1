// OpenEir — agent CLI harness discovery.
// Probes the server for installed agent CLIs (Claude Code, Codex, Gemini CLI,
// OpenCode) so users can route AI calls through their own subscriptions,
// legally, via the vendor's login flow. Also exposes the Z.ai coding-plan →
// Claude Code bridge recipe.
//
// GET  — registry scan, served from a 60s TTL cache when fresh (cheap).
// POST — explicit rescan: bypasses the cache and re-probes the machine.
//        Buzz-style: timestamped, idempotent, never disrupts attached providers.

import { ok } from '@/lib/api-utils'
import { scanClis, ZAI_BRIDGE_RECIPE } from '@/lib/ai/harness'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const { agents, scannedAt, cached } = await scanClis()
  return ok({ agents, zaiBridge: ZAI_BRIDGE_RECIPE, scannedAt, cached })
}

export async function POST() {
  const { agents, scannedAt } = await scanClis(true)
  return ok({ agents, zaiBridge: ZAI_BRIDGE_RECIPE, scannedAt, cached: false })
}
