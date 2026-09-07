// OpenEir — gateway config inspector (read-only).
// Surfaces exactly what the built-in AI sees on this machine: which of the
// three .z-ai-config locations exist, their file metadata, and their parsed
// fields (values included — the client masks sensitive ones). Env vars are
// reported as booleans only; their values are never returned.

import { promises as fs } from 'node:fs'
import { ok } from '@/lib/api-utils'
import { builtinGatewayStatus, gatewayConfigPaths } from '@/lib/ai/builtin'

export const dynamic = 'force-dynamic'

type PathReport = {
  path: string
  exists: boolean
  readable: boolean
  usable: boolean
  size: number | null
  mode: string | null
  modified: string | null
  fields: Record<string, string> | null
  error: string | null
}

function modeToRwx(mode: number): string {
  const bits = (mode & 0o777).toString(8).padStart(3, '0')
  const map: Record<string, string> = { '7': 'rwx', '6': 'rw-', '5': 'r-x', '4': 'r--', '3': '-wx', '2': '-w-', '1': '--x', '0': '---' }
  return bits.split('').map((b) => map[b] ?? '---').join('')
}

export async function GET() {
  const status = await builtinGatewayStatus(true)
  const paths: PathReport[] = []

  for (const p of gatewayConfigPaths()) {
    const item: PathReport = {
      path: p, exists: false, readable: false, usable: false,
      size: null, mode: null, modified: null, fields: null, error: null,
    }
    try {
      const st = await fs.stat(p)
      item.exists = true
      item.size = st.size
      item.mode = modeToRwx(st.mode)
      item.modified = st.mtime.toISOString()
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        item.exists = true
        item.error = code === 'EACCES' ? 'Permission denied' : `stat failed (${code ?? 'unknown'})`
      }
      paths.push(item)
      continue
    }
    try {
      const raw = await fs.readFile(p, 'utf-8')
      item.readable = true
      const cfg: unknown = JSON.parse(raw)
      const fields: Record<string, string> = {}
      if (cfg && typeof cfg === 'object') {
        for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
          fields[k] = typeof v === 'string' ? v : JSON.stringify(v)
        }
      }
      item.fields = fields
      item.usable = Boolean((cfg as { baseUrl?: string })?.baseUrl && (cfg as { apiKey?: string })?.apiKey)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code
      item.error = code === 'EACCES' ? 'Permission denied' : 'File exists but is not valid JSON'
    }
    paths.push(item)
  }

  return ok({
    configured: status.configured,
    activeSource: status.source,
    env: {
      hasApiKey: Boolean(process.env.ZAI_API_KEY),
      hasBaseUrl: Boolean(process.env.ZAI_BASE_URL),
    },
    paths,
  })
}
