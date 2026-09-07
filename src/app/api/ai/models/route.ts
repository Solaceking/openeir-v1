// OpenEir — live model catalog, powered by https://models.dev.
//
// models.dev is the community-maintained, continuously-updated registry of
// AI models (ids, context limits, $/M pricing, modalities, release dates).
// Instead of hardcoding a list that ages badly, OpenEir server-side fetches
// the catalog, keeps only the slices for the preset providers, compresses
// each model to what the picker UI needs, and caches the result in SQLite
// for 12 hours. The dropdown is therefore always CURRENT by construction.
//
//   GET /api/ai/models            → all preset slices
//   GET /api/ai/models?provider=z → one slice (z = models.dev provider id)

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'
import { CATALOG_PROVIDER_IDS } from '@/lib/ai/presets'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CACHE_KEY = 'modelsdev:catalog:v1'
const TTL_MS = 12 * 60 * 60 * 1000
const SOURCE_URL = 'https://models.dev/api.json'

const CompactModel = z.object({
  id: z.string(),
  name: z.string(),
  ctx: z.number().nullable(),
  /** $ per million tokens */
  in: z.number().nullable(),
  out: z.number().nullable(),
  reasoning: z.boolean(),
  tools: z.boolean(),
  vision: z.boolean(),
  released: z.string().nullable(),
})
export type CompactModel = z.infer<typeof CompactModel>

interface CatalogShape {
  fetchedAt: string
  providers: Record<string, CompactModel[]>
}

/** Map the raw models.dev model entry to the compact picker shape. */
function compactModel(id: string, m: Record<string, unknown>): CompactModel | null {
  if (typeof m !== 'object' || m === null) return null
  const name = typeof m.name === 'string' && m.name.trim() ? m.name : id
  // skip non-chat entries (embeddings, image gens, transcribe) — they can't answer a chat prompt
  const modalities = m.modalities as { input?: string[]; output?: string[] } | undefined
  const output = modalities?.output ?? []
  if (output.length > 0 && !output.includes('text')) return null
  const limit = m.limit as { context?: number } | undefined
  const cost = m.cost as { input?: number; output?: number } | undefined
  return {
    id,
    name,
    ctx: typeof limit?.context === 'number' ? limit.context : null,
    in: typeof cost?.input === 'number' ? cost.input : null,
    out: typeof cost?.output === 'number' ? cost.output : null,
    reasoning: m.reasoning === true,
    tools: m.tool_call === true,
    vision: Array.isArray(modalities?.input) && (modalities.input.includes('image') || modalities.input.includes('pdf')),
    released: typeof m.release_date === 'string' ? m.release_date : null,
  }
}

/** Newest first — "current models, not aged" enforced by sort, not vibes. */
function sortModels(models: CompactModel[]): CompactModel[] {
  return [...models].sort((a, b) => (b.released ?? '').localeCompare(a.released ?? '') || a.name.localeCompare(b.name))
}

async function loadCatalog(): Promise<CatalogShape> {
  const cached = await db.appSetting.findUnique({ where: { key: CACHE_KEY } })
  if (cached) {
    try {
      const parsed = JSON.parse(cached.value) as CatalogShape
      if (Date.now() - new Date(parsed.fetchedAt).getTime() < TTL_MS) return parsed
    } catch { /* corrupt cache → refetch */ }
  }

  const res = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, { models?: Record<string, unknown> }>

  const providers: Record<string, CompactModel[]> = {}
  for (const pid of CATALOG_PROVIDER_IDS) {
    const slice = raw[pid]?.models ?? {}
    const models = Object.entries(slice)
      .map(([mid, m]) => compactModel(mid, m as Record<string, unknown>))
      .filter((m): m is CompactModel => m !== null)
    providers[pid] = sortModels(models)
  }

  const catalog: CatalogShape = { fetchedAt: new Date().toISOString(), providers }
  await db.appSetting.upsert({
    where: { key: CACHE_KEY },
    create: { key: CACHE_KEY, value: JSON.stringify(catalog) },
    update: { value: JSON.stringify(catalog) },
  })
  return catalog
}

export async function GET(req: NextRequest) {
  const wanted = req.nextUrl.searchParams.get('provider')
  try {
    const catalog = await loadCatalog()
    if (wanted) {
      const slice = catalog.providers[wanted]
      if (!slice) return fail(`Unknown catalog provider: ${wanted}`, 404)
      return ok({ provider: wanted, fetchedAt: catalog.fetchedAt, models: slice })
    }
    return ok({ fetchedAt: catalog.fetchedAt, providers: catalog.providers })
  } catch (e) {
    // stale-on-error: if we have any cached copy, serve it flagged stale
    const cached = await db.appSetting.findUnique({ where: { key: CACHE_KEY } })
    if (cached) {
      try {
        const parsed = JSON.parse(cached.value) as CatalogShape
        return ok({ ...parsed, stale: true, detail: e instanceof Error ? e.message : String(e) })
      } catch { /* fallthrough */ }
    }
    return fail(`Model catalog unavailable: ${e instanceof Error ? e.message : 'fetch failed'}`, 502)
  }
}
