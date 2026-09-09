// OpenEir — manage the /api/mcp access token (Settings → MCP → Expose).
// POST { action: 'enable' | 'disable' | 'rotate' } — the plaintext token is
// returned exactly once, only on enable/rotate.

import { ok, fail } from '@/lib/api-utils'
import { getMcpAccess, enableMcpAccess, disableMcpAccess, rotateMcpToken } from '@/lib/mcp-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getMcpAccess()
  // never expose the hash — the UI only needs enabled/rotatedAt
  return ok({ enabled: access.enabled, rotatedAt: access.rotatedAt })
}

export async function POST(req: Request) {
  let body: { action?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }
  switch (body.action) {
    case 'enable': {
      const { token, access } = await enableMcpAccess()
      return ok({ enabled: access.enabled, rotatedAt: access.rotatedAt, token })
    }
    case 'disable': {
      const access = await disableMcpAccess()
      return ok({ enabled: access.enabled })
    }
    case 'rotate': {
      const current = await getMcpAccess()
      if (!current.enabled) return fail('Enable access first', 400)
      const { token, access } = await rotateMcpToken()
      return ok({ enabled: access.enabled, rotatedAt: access.rotatedAt, token })
    }
    default:
      return fail('Unknown action — use enable | disable | rotate', 422)
  }
}
