// OpenEir — the read-only toolset this instance EXPOSES over MCP.
// Each tool returns a compact, dispatcher-safe summary of the household's
// own data. Every call is audit-logged as an EventRecord (type MCP_TOOL_CALL).

import { db } from '@/lib/db'
import { parseSchedule } from '@/lib/health/meds'

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'get_today_summary',
    description: 'One-paragraph summary of the user\'s day: latest blood pressure & glucose, medications due/taken, logging streak.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recent_readings',
    description: 'Recent blood pressure and/or glucose readings, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['bp', 'glucose', 'all'], description: 'Which readings to return (default all)' },
        limit: { type: 'number', description: 'How many (1-20, default 5)' },
      },
    },
  },
  {
    name: 'get_medications_now',
    description: 'Active medications with today\'s dose status (taken/skipped/pending).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_profile_summary',
    description: 'Profile summary: name, age band, conditions, clinical targets, GP contact.',
    inputSchema: { type: 'object', properties: {} },
  },
]

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function tool_getTodaySummary(): Promise<string> {
  const [bp, glucose, meds, logs] = await Promise.all([
    db.bpReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.glucoseReading.findFirst({ orderBy: { takenAt: 'desc' } }),
    db.medication.findMany({ where: { active: true } }),
    db.medicationLog.findMany({ where: { date: today() } }),
  ])
  const taken = logs.filter((l) => l.status === 'taken').length
  const skipped = logs.filter((l) => l.status === 'skipped').length
  const missed = logs.filter((l) => l.status === 'missed').length
  const parts = [
    bp ? `Latest BP ${bp.systolic}/${bp.diastolic}${bp.pulse ? ` pulse ${bp.pulse}` : ''} at ${bp.takenAt.toISOString().slice(0, 16).replace('T', ' ')}` : 'No BP readings yet',
    glucose ? `Latest glucose ${glucose.value} mmol/L (${glucose.context})` : 'No glucose readings yet',
    meds.length ? `${meds.length} active medication${meds.length === 1 ? '' : 's'}; today: ${taken} taken, ${skipped} skipped, ${missed} missed` : 'No medications configured',
  ]
  return parts.join('. ') + '.'
}

async function tool_getRecentReadings(args: { kind?: string; limit?: number }): Promise<string> {
  const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 5)))
  const kind = args.kind ?? 'all'
  const out: string[] = []
  if (kind === 'bp' || kind === 'all') {
    const rows = await db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: limit })
    out.push(...rows.map((r) => `BP ${r.systolic}/${r.diastolic}${r.pulse ? ` pulse ${r.pulse}` : ''} (${r.label}) at ${r.takenAt.toISOString().slice(0, 16).replace('T', ' ')}`))
  }
  if (kind === 'glucose' || kind === 'all') {
    const rows = await db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: limit })
    out.push(...rows.map((r) => `Glucose ${r.value} mmol/L (${r.context}) at ${r.takenAt.toISOString().slice(0, 16).replace('T', ' ')}`))
  }
  return out.length ? out.join('\n') : 'No readings found.'
}

async function tool_getMedicationsNow(): Promise<string> {
  const meds = await db.medication.findMany({ where: { active: true } })
  if (!meds.length) return 'No active medications.'
  const logs = await db.medicationLog.findMany({ where: { date: today() } })
  const lines = meds.map((m) => {
    const slots = parseSchedule(m.scheduleTimes)
    const statuses = slots.map((s) => {
      const log = logs.find((l) => l.medicationId === m.id && l.scheduledTime === s)
      return `${s}:${log?.status ?? 'pending'}`
    })
    return `${m.name} ${m.doseValue}${m.doseUnit} — ${statuses.join(', ') || 'no schedule'}`
  })
  return lines.join('\n')
}

async function tool_getProfileSummary(): Promise<string> {
  const p = await db.profile.findFirst()
  if (!p) return 'Profile not set up yet.'
  const conditions = (JSON.parse(p.conditions || '[]') as string[]).join(', ') || 'none recorded'
  const age = p.birthYear ? ` (born ${p.birthYear})` : ''
  const gp = p.gpName ? ` GP: ${p.gpName}${p.gpOrg ? ` (${p.gpOrg})` : ''}${p.gpPhone ? `, ${p.gpPhone}` : ''}` : ''
  return `${p.fullName}${age}. Conditions: ${conditions}. Targets: BP ${p.bpSystolicTarget}/${p.bpDiastolicTarget} mmHg, glucose ${p.glucoseTargetMin}–${p.glucoseTargetMax} ${p.glucoseUnit === 'mgdl' ? 'mg/dL' : 'mmol/L'}.${gp}`
}

/** Dispatch one tools/call. Returns plain text content. */
export async function callMcpTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  try {
    let text: string
    switch (name) {
      case 'get_today_summary': text = await tool_getTodaySummary(); break
      case 'get_recent_readings': text = await tool_getRecentReadings(args as { kind?: string; limit?: number }); break
      case 'get_medications_now': text = await tool_getMedicationsNow(); break
      case 'get_profile_summary': text = await tool_getProfileSummary(); break
      default: return { ok: false, text: `Unknown tool: ${name}` }
    }
    return { ok: true, text }
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : 'Tool call failed' }
  }
}

/** Audit trail — best-effort, never blocks the tool response. */
export async function auditMcpCall(tool: string, argsSummary: string): Promise<void> {
  try {
    await db.eventRecord.create({
      data: {
        type: 'MCP_TOOL_CALL',
        priority: 'low',
        payload: JSON.stringify({ tool, args: argsSummary.slice(0, 200), at: new Date().toISOString() }),
      },
    })
  } catch { /* auditing must never break the call */ }
}
