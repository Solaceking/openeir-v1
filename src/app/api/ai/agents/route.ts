// OpenEir — agent CLI harness discovery.
// Probes the server for installed agent CLIs (Claude Code, Codex, Gemini CLI,
// OpenCode) so users can route AI calls through their own subscriptions,
// legally, via the vendor's login flow. Also exposes the Z.ai coding-plan →
// Claude Code bridge recipe.

import { ok } from '@/lib/api-utils'
import { discoverClis, ZAI_BRIDGE_RECIPE } from '@/lib/ai/harness'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const agents = await discoverClis()
  return ok({ agents, zaiBridge: ZAI_BRIDGE_RECIPE })
}
