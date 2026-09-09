// OpenEir — plugin scoped-token authentication.
// Plugins authenticate with `Authorization: Bearer <token>`; only the token's
// sha256 is stored. The access proxy (src/proxy.ts) uses resolvePluginScope to
// admit plugin requests for exactly the route+method their scopes cover —
// a plugin never sees more than its scopes allow.

import { db } from '@/lib/db'
import { sha256 } from '@/lib/auth'

export const PLUGIN_SCOPES = ['read:vitals', 'read:meds', 'read:profile', 'read:export', 'post:insights'] as const
export type PluginScope = (typeof PLUGIN_SCOPES)[number]

export const PLUGIN_SCOPE_INFO: Record<PluginScope, string> = {
  'read:vitals': 'Read blood pressure & glucose readings',
  'read:meds': 'Read the medication list and today’s dose status',
  'read:profile': 'Read the profile (name, conditions, targets)',
  'read:export': 'Download a full data export',
  'post:insights': 'Post insights onto your dashboard',
}

/** Route-level scope map (checked in the proxy). First match wins. */
export const PLUGIN_ROUTE_SCOPES: { prefix: string; methods: string[]; scope: PluginScope }[] = [
  { prefix: '/api/readings', methods: ['GET'], scope: 'read:vitals' },
  { prefix: '/api/medications', methods: ['GET'], scope: 'read:meds' },
  { prefix: '/api/profile', methods: ['GET'], scope: 'read:profile' },
  { prefix: '/api/export', methods: ['GET'], scope: 'read:export' },
  { prefix: '/api/agent/insights', methods: ['POST'], scope: 'post:insights' },
]

export interface PluginIdentity {
  id: string
  name: string
  scopes: PluginScope[]
}

/** Resolve `Authorization: Bearer …` to an active plugin + its scopes. */
export async function resolvePlugin(req: Request): Promise<PluginIdentity | null> {
  const header = req.headers.get('authorization')
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (token.length < 20) return null // sessions are base64url cookies; plugins carry long tokens
  const row = await db.plugin.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || !row.enabled) return null
  let scopes: string[] = []
  try { scopes = JSON.parse(row.scopes) as string[] } catch { /* empty */ }
  return { id: row.id, name: row.name, scopes: scopes.filter((s): s is PluginScope => (PLUGIN_SCOPES as readonly string[]).includes(s)) }
}

/**
 * Proxy hook: does this request present a valid plugin token that covers it?
 * Returns true when the caller may proceed WITHOUT a user session.
 */
export async function pluginTokenAuthorizes(req: Request, pathname: string, method: string): Promise<boolean> {
  const rule = PLUGIN_ROUTE_SCOPES.find(
    (r) => pathname.startsWith(r.prefix) && r.methods.includes(method),
  )
  if (!rule) return false
  const plugin = await resolvePlugin(req)
  if (!plugin) return false
  const okScope = plugin.scopes.includes(rule.scope)
  if (okScope) {
    void db.plugin.update({ where: { id: plugin.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return okScope
}
