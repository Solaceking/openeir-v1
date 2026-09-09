// OpenEir — plugin registry (Settings → Integrations → Plugins).
// GET  list installed plugins
// POST install from a manifest URL: fetch the JSON manifest, validate scopes,
//      register, and mint a scoped access token (returned exactly once).

import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { sha256 } from '@/lib/auth'
import { PLUGIN_SCOPES, PLUGIN_SCOPE_INFO, type PluginScope } from '@/lib/plugin-auth'

export const dynamic = 'force-dynamic'

interface PluginManifest {
  name?: string
  version?: string
  description?: string
  baseUrl?: string
  scopes?: string[]
}

function view(row: {
  id: string; name: string; manifestUrl: string; version: string; description: string
  baseUrl: string | null; scopes: string; enabled: boolean; health: string; lastSeenAt: Date | null
}) {
  let scopes: string[] = []
  try { scopes = JSON.parse(row.scopes) as string[] } catch { /* ignore */ }
  return { ...row, scopes }
}

export async function GET() {
  const rows = await db.plugin.findMany({ orderBy: { createdAt: 'asc' } })
  return ok({
    plugins: rows.map(view),
    availableScopes: PLUGIN_SCOPES.map((s) => ({ scope: s, description: PLUGIN_SCOPE_INFO[s] })),
  })
}

const postSchema = z.object({
  manifestUrl: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL'),
  scopes: z.array(z.enum(PLUGIN_SCOPES)).optional(), // admin may trim the manifest's ask
})

export async function POST(req: Request) {
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { manifestUrl } = parsed.data

  let manifest: PluginManifest
  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return fail(`Manifest host answered HTTP ${res.status}`, 422)
    manifest = (await res.json()) as PluginManifest
  } catch (err) {
    return fail(`Could not fetch the manifest: ${err instanceof Error ? err.message : 'network error'}`, 422)
  }

  const name = (manifest.name ?? '').trim()
  if (!name || name.length > 60) return fail('Manifest needs a "name" (1-60 chars)', 422)
  const requested = Array.isArray(manifest.scopes) ? manifest.scopes : []
  const granted = (parsed.data.scopes ?? requested).filter(
    (s): s is PluginScope => (PLUGIN_SCOPES as readonly string[]).includes(s),
  )
  const denied = requested.filter((s) => !(PLUGIN_SCOPES as readonly string[]).includes(s))

  let baseUrl: string | null = null
  if (manifest.baseUrl) {
    try { baseUrl = new URL(manifest.baseUrl).toString() } catch { baseUrl = null }
  }

  const token = randomBytes(32).toString('base64url')
  try {
    const row = await db.plugin.create({
      data: {
        name,
        manifestUrl,
        version: (manifest.version ?? '0.0.0').slice(0, 20),
        description: (manifest.description ?? '').slice(0, 300),
        baseUrl,
        scopes: JSON.stringify([...new Set(granted)]),
        tokenHash: sha256(token),
        enabled: true,
      },
    })
    return ok({
      plugin: view(row),
      // plaintext token — shown once, stored only as its hash
      token,
      deniedScopes: denied,
      scopeInfo: Object.fromEntries(granted.map((s) => [s, PLUGIN_SCOPE_INFO[s]])),
    }, { status: 201 })
  } catch {
    return fail('A plugin with this manifest URL is already installed', 409)
  }
}
