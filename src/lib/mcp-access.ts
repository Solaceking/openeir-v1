// OpenEir — MCP server-mode access (Settings → MCP → "Expose this OpenEir").
// External MCP clients (Claude Desktop, other agents) talk JSON-RPC to
// /api/mcp with a bearer token. Only the token HASH is stored; the plaintext
// is shown exactly once at enable/rotate time. All exposed tools are
// READ-ONLY summaries of the household's own data.

import { db } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sha256 } from '@/lib/auth'

export interface McpAccess {
  enabled: boolean
  tokenHash: string | null
  rotatedAt: string | null
}

const KEY = 'mcp.access'

export async function getMcpAccess(): Promise<McpAccess> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } })
  if (!row) return { enabled: false, tokenHash: null, rotatedAt: null }
  try {
    const raw = JSON.parse(row.value) as Partial<McpAccess>
    return {
      enabled: raw.enabled === true,
      tokenHash: typeof raw.tokenHash === 'string' ? raw.tokenHash : null,
      rotatedAt: typeof raw.rotatedAt === 'string' ? raw.rotatedAt : null,
    }
  } catch {
    return { enabled: false, tokenHash: null, rotatedAt: null }
  }
}

async function writeAccess(next: McpAccess): Promise<void> {
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
}

/** Enable (or re-enable) access, minting a fresh token. Returns the plaintext ONCE. */
export async function enableMcpAccess(): Promise<{ token: string; access: McpAccess }> {
  const token = randomBytes(32).toString('base64url')
  const access: McpAccess = { enabled: true, tokenHash: sha256(token), rotatedAt: new Date().toISOString() }
  await writeAccess(access)
  return { token, access }
}

export async function disableMcpAccess(): Promise<McpAccess> {
  const current = await getMcpAccess()
  const access: McpAccess = { ...current, enabled: false }
  await writeAccess(access)
  return access
}

/** Rotate = mint a new token (old one stops working immediately). */
export async function rotateMcpToken(): Promise<{ token: string; access: McpAccess }> {
  return enableMcpAccess()
}

/** Bearer-token check for /api/mcp. */
export async function validMcpAccess(headerValue: string | null): Promise<boolean> {
  if (!headerValue) return false
  const token = headerValue.startsWith('Bearer ') ? headerValue.slice(7).trim() : headerValue.trim()
  if (!token) return false
  const access = await getMcpAccess()
  return access.enabled && access.tokenHash === sha256(token)
}

/** Protocol version advertised by the exposed /api/mcp endpoint. */
export const MCP_PROTOCOL_VERSION = '2025-03-26'
