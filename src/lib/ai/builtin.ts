// OpenEir — the built-in AI gateway lifecycle.
//
// "Built-in" means the Z.ai GLM gateway through z-ai-web-dev-sdk. The SDK is
// zero-config ONLY where a gateway config file exists — it reads
// `.z-ai-config` (JSON with baseUrl + apiKey) from the project root, the user's
// home directory, or /etc. Inside managed environments (like this sandbox)
// /etc/.z-ai-config is provisioned; on a self-hosted clone it is not, so the
// built-in provider must be presented honestly and the docs/env paths below
// give self-hosters a one-minute setup.
//
// Three jobs:
//   1. Report WHERE the gateway config lives (surfaced in Settings → AI).
//   2. Bootstrap a config from ZAI_API_KEY + ZAI_BASE_URL env vars (written to
//      the project root as .z-ai-config — the SDK only reads files).
//   3. Auto-seed the built-in provider row on first boot so a fresh clone
//      doesn't depend on running the demo-data seed script.

import { db } from '@/lib/db'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_BUILTIN_MODEL } from '@/lib/ai/model-default'

export interface BuiltinGatewayStatus {
  /** true when the SDK will find a usable config right now */
  configured: boolean
  /** human-readable origin of the config: a file path or 'environment' */
  source: string | null
  /** the exact paths the SDK checks, for actionable guidance */
  checkedPaths: string[]
  /** true when a config was just written from env vars */
  bootstrappedFromEnv?: boolean
}

/** The three locations z-ai-web-dev-sdk scans, in order. */
export function gatewayConfigPaths(): string[] {
  return [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
}

function isUsableConfig(raw: string): boolean {
  try {
    const cfg = JSON.parse(raw)
    return Boolean(cfg?.baseUrl && cfg?.apiKey)
  } catch {
    return false
  }
}

let statusCache: BuiltinGatewayStatus | null = null
let statusCacheAt = 0
const STATUS_TTL_MS = 10_000

/** Detect (and if possible, create) the gateway config. Cached briefly. */
export async function builtinGatewayStatus(force = false): Promise<BuiltinGatewayStatus> {
  if (!force && statusCache && Date.now() - statusCacheAt < STATUS_TTL_MS) return statusCache
  const checkedPaths = gatewayConfigPaths()
  const status: BuiltinGatewayStatus = { configured: false, source: null, checkedPaths }

  // 1. An existing config file wins.
  for (const p of checkedPaths) {
    try {
      const raw = await fs.readFile(p, 'utf-8')
      if (isUsableConfig(raw)) {
        status.configured = true
        status.source = p
        break
      }
    } catch { /* not readable — try the next path */ }
  }

  // 2. Env bootstrap: ZAI_API_KEY + ZAI_BASE_URL → write a config the SDK can read.
  if (!status.configured && process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL) {
    const cfg = JSON.stringify({ baseUrl: process.env.ZAI_BASE_URL, apiKey: process.env.ZAI_API_KEY })
    for (const target of checkedPaths.slice(0, 2)) {
      try {
        await fs.writeFile(target, cfg, { encoding: 'utf-8', mode: 0o600 })
        status.configured = true
        status.source = `${target} (from ZAI_API_KEY / ZAI_BASE_URL env)`
        status.bootstrappedFromEnv = true
        break
      } catch { /* read-only cwd → try home */ }
    }
  }

  statusCache = status
  statusCacheAt = Date.now()
  return status
}

let ensured: Promise<void> | null = null
let ensuredAt = 0
const ENSURE_TTL_MS = 30_000

/**
 * Guarantee the built-in provider row exists so a fresh clone (no demo seed)
 * still gets the advertised default chain entry.
 *   - gateway configured  → enabled, first in chain
 *   - gateway not present → created DISABLED with a lastStatus that tells the
 *     user exactly how to enable it (Settings shows this verbatim)
 *
 * Memoized for a short window only — a self-hoster adding .z-ai-config (or
 * deleting the row to test) must not wait for a process restart.
 */
export async function ensureBuiltinProvider(): Promise<void> {
  if (ensured && Date.now() - ensuredAt < ENSURE_TTL_MS) return ensured
  ensuredAt = Date.now()
  ensured = (async () => {
    try {
      const existing = await db.aiProviderConfig.findFirst({ where: { adapter: 'builtin_zai' } })
      if (existing) return
      const status = await builtinGatewayStatus()
      const configured = status.configured
      await db.aiProviderConfig.create({
        data: {
          label: 'OpenEir Built-in AI',
          adapter: 'builtin_zai',
          model: DEFAULT_BUILTIN_MODEL,
          enabled: configured,
          isDefault: true,
          priority: 10,
          privacyMode: false,
          lastStatus: configured
            ? null
            : 'built-in gateway not configured on this machine — add a .z-ai-config file or set ZAI_API_KEY + ZAI_BASE_URL (see Settings → AI)',
        },
      })
    } catch { /* never block the provider chain over housekeeping */ }
  })()
  return ensured
}

/** Invalidate memoization after the user changes config on disk. */
export function resetBuiltinCache(): void {
  statusCache = null
  ensured = null
}
