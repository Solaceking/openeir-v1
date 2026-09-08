// OpenEir — System Check. One endpoint that answers, in plain language,
// exactly what works and what needs the user's attention. No hidden state:
// everything it checks is user-configurable in Settings.
//
//   GET /api/system-check
//
// Checks (all optional services degrade gracefully):
//   1. AI provider reachable (the ONE brain — chat, insights, briefing)
//   2. Speech-to-text backend reachable (voice input)
//   3. Database writable (health data persistence)
//   4. Backup freshness (hours since last snapshot)

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { completeChat } from '@/lib/ai/providers'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const STT_TIMEOUT_MS = 12_000
const STT_MODEL_CANDIDATES = ['whisper-1', 'groq/whisper-large-v3', 'whisper-large-v3']

async function sttReachable(): Promise<{ ok: boolean; via: string; hint: string }> {
  const row = await db.appSetting.findUnique({ where: { key: 'stt.routing' } })
  let order: string[] = ['gateway']
  let localUrl = 'http://127.0.0.1:8630/v1'
  let localModel = 'large-v3'
  if (row?.value) {
    try {
      const r = JSON.parse(row.value)
      if (Array.isArray(r.order) && r.order.length) order = r.order
      if (r.localUrl) localUrl = r.localUrl
      if (r.localModel) localModel = r.localModel
    } catch { /* defaults */ }
  }

  for (const backend of order) {
    if (backend === 'local') {
      try {
        const base = localUrl.replace(/\/v1$/, '')
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(STT_TIMEOUT_MS) })
        if (res.ok) {
          const h = await res.json() as { ready?: boolean; model?: string }
          return { ok: Boolean(h.ready), via: 'local whisper', hint: h.ready ? '' : 'model still loading — try again in a minute' }
        }
        return { ok: false, via: 'local whisper', hint: `server responded HTTP ${res.status}` }
      } catch {
        return { ok: false, via: 'local whisper', hint: 'not reachable — is the whisper server running?' }
      }
    }
    // gateway providers: cheap reachability = enabled openai_compatible rows exist
    const rows = await db.aiProviderConfig.findMany({
      where: { enabled: true, adapter: 'openai_compatible' },
    })
    if (rows.length) {
      const row = rows[0]
      try {
        const apiKey = row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : null
        const res = await fetch(`${(row.baseUrl ?? '').replace(/\/$/, '')}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          signal: AbortSignal.timeout(STT_TIMEOUT_MS),
        })
        return {
          ok: res.ok,
          via: row.label,
          hint: res.ok ? '' : `HTTP ${res.status} — check the API key or base URL in Settings → AI providers`,
        }
      } catch {
        return { ok: false, via: row.label, hint: 'not reachable — is the gateway service running?' }
      }
    }
  }
  return { ok: false, via: 'none', hint: 'no STT backend is enabled — pick one in Settings → Voice & audio' }
}

export async function GET() {
  // 1. database writable
  let dbOk = true
  let dbHint = ''
  try {
    await db.appSetting.upsert({
      where: { key: 'system.lastCheck' },
      update: { value: new Date().toISOString() },
      create: { key: 'system.lastCheck', value: new Date().toISOString() },
    })
  } catch (e) {
    dbOk = false
    dbHint = e instanceof Error ? e.message.slice(0, 140) : 'write failed'
  }

  // 2. AI brain — one tiny real completion through the same chain chat uses
  let aiOk = false
  let aiVia = 'none'
  let aiHint = ''
  try {
    const r = await completeChat('chat', [
      { role: 'system', content: 'Reply with exactly: OK' },
      { role: 'user', content: 'ping' },
    ])
    aiOk = r.ok
    aiVia = r.providerLabel
    if (!r.ok) aiHint = 'all configured providers failed — open Settings → AI providers and test one'
  } catch (e) {
    aiHint = e instanceof Error ? e.message.slice(0, 140) : 'AI check failed'
  }

  // 3. STT backend
  const stt = await sttReachable()

  // 4. backup freshness
  let backupHours: number | null = null
  try {
    const row = await db.appSetting.findUnique({ where: { key: 'backup.lastAt' } })
    if (row?.value) backupHours = Math.round((Date.now() - new Date(row.value).getTime()) / 3_600_000)
  } catch { /* non-fatal */ }

  const checks = [
    { id: 'db', label: 'Health database', ok: dbOk, detail: dbOk ? 'reading & writing' : dbHint },
    { id: 'ai', label: 'AI provider (the brain)', ok: aiOk, detail: aiOk ? `answering via ${aiVia}` : aiHint },
    { id: 'stt', label: 'Voice input (speech-to-text)', ok: stt.ok, detail: stt.ok ? `ready via ${stt.via}` : stt.hint },
    {
      id: 'backup',
      label: 'Automatic backups',
      ok: backupHours !== null && backupHours <= 25,
      detail: backupHours === null
        ? 'not configured — enable below to protect your health data'
        : backupHours <= 25 ? `last snapshot ${backupHours}h ago` : `last snapshot ${backupHours}h ago — check the backup job`,
    },
  ]

  const allGood = checks.every((c) => c.ok)
  const fixes = checks.filter((c) => !c.ok)

  return NextResponse.json({
    ok: allGood,
    summary: allGood
      ? 'Everything is working. Eir can hear you, think, and your data is safe.'
      : `${fixes.length} thing${fixes.length === 1 ? '' : 's'} need${fixes.length === 1 ? 's' : ''} attention: ${fixes.map((f) => f.label).join(', ')}.`,
    checks,
    checkedAt: new Date().toISOString(),
  })
}

/** POST = run a real backup snapshot now (used by the auto-backup job and the button). */
export async function POST() {
  try {
    const url = process.env.DATABASE_URL ?? 'file:../db/custom.db'
    const dbPath = url.startsWith('file:') ? url.slice(5) : url
    const resolved = path.resolve(dbPath)
    await fs.access(resolved)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = path.join(path.dirname(resolved), 'backups')
    await fs.mkdir(dir, { recursive: true })
    await fs.copyFile(resolved, path.join(dir, `openeir-${stamp}.db`))
    await db.appSetting.upsert({
      where: { key: 'backup.lastAt' },
      update: { value: new Date().toISOString() },
      create: { key: 'backup.lastAt', value: new Date().toISOString() },
    })
    return NextResponse.json({ ok: true, file: path.join(dir, `openeir-${stamp}.db`) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'backup failed' }, { status: 500 })
  }
}
