// THE critical suite: the AI must never write without explicit human
// confirmation, no matter what the prompt says. Covers the live-gate, the
// pending-action lifecycle, idempotent execution, permissions and the
// high-risk phrase — the generalized confirm-before-write pipeline.

import { describe, test, expect, beforeEach } from 'bun:test'
import { db } from '@/lib/db'
import {
  executeToolCall, confirmPendingAction, declinePendingAction, getPendingAction,
  createPendingAction, toolsForPrompt, getAgentPermissions, saveAgentPermissions,
  AGENT_TOOLS, HIGH_RISK_PHRASE, getTool,
} from '@/lib/ai/tools'

const LIVE: Parameters<typeof executeToolCall>[2] = { origin: 'chat', live: true, sessionId: 's-test' }
const NON_LIVE: Parameters<typeof executeToolCall>[2] = { origin: 'chat', live: false }

async function counts(table: 'bpReading' | 'glucoseReading' | 'medicationLog' | 'lifestyleLog'): Promise<number> {
  switch (table) {
    case 'bpReading': return db.bpReading.count()
    case 'glucoseReading': return db.glucoseReading.count()
    case 'medicationLog': return db.medicationLog.count()
    case 'lifestyleLog': return db.lifestyleLog.count()
  }
}

beforeEach(async () => {
  await db.pendingAction.deleteMany({})
  await db.toolAudit.deleteMany({})
  await db.bpReading.deleteMany({})
  await db.glucoseReading.deleteMany({})
  await db.medicationLog.deleteMany({})
  await db.lifestyleLog.deleteMany({})
  await db.medication.deleteMany({})
  await db.appSetting.deleteMany({ where: { key: 'agent.permissions' } })
})

describe('registry shape', () => {
  test('tools are unique, typed, and carry wire + zod schemas', () => {
    const names = AGENT_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of AGENT_TOOLS) {
      expect(t.description.length).toBeGreaterThan(10)
      expect(t.parameters.type).toBe('object')
      expect(t.input).toBeDefined()
      expect(['read', 'write', 'destructive']).toContain(t.category)
    }
  })

  test('write tools are physically separated from read tools', () => {
    for (const t of AGENT_TOOLS) {
      if (t.name.startsWith('log') || t.name.startsWith('update') || t.name.startsWith('delete')) {
        expect(t.category === 'write' || t.category === 'destructive').toBe(true)
      }
    }
  })

  test('destructive tools ship disabled by default', async () => {
    const perms = await getAgentPermissions()
    expect(perms.destructive).toBe(false)
    expect(perms.write).toBe(true)
  })
})

describe('live-gate: retrieved content can never authorize a write', () => {
  test('write tool with live:false is refused and writes nothing', async () => {
    const out = await executeToolCall('logBloodPressure', { systolic: 130, diastolic: 85 }, NON_LIVE)
    expect(out.ok).toBe(false)
    expect(out.forModel).toContain('Refused')
    expect(await counts('bpReading')).toBe(0)
    expect(out.pendingActionId).toBeUndefined()
    // and it was audited as refused
    const audit = await db.toolAudit.findFirst({ where: { tool: 'logBloodPressure' } })
    expect(audit?.status).toBe('refused')
  })

  test('destructive tool with live:false is refused', async () => {
    const out = await executeToolCall('deleteBpReading', { id: 'x' }, NON_LIVE)
    expect(out.ok).toBe(false)
  })

  test('toolsForPrompt hides writes from non-live contexts entirely', async () => {
    const names = (await toolsForPrompt(NON_LIVE)).map((t) => t.name)
    expect(names).toContain('getLatestReading')
    expect(names).not.toContain('logBloodPressure')
    expect(names).not.toContain('deleteBpReading')
  })

  test('even a direct fabricated model call cannot bypass the gate', async () => {
    // an injected document tells the model to call the tool; simulate the
    // model obeying — the executor is the last line of defense
    const out = await executeToolCall('logGlucose', { value: 5.5 }, { origin: 'realtime', live: false })
    expect(out.ok).toBe(false)
    expect(await counts('glucoseReading')).toBe(0)
  })
})

describe('propose → confirm: the write is never model-executed', () => {
  test('write tool creates a PendingAction, not a row; confirm writes exactly once', async () => {
    const out = await executeToolCall('logBloodPressure', { systolic: 118, diastolic: 76, pulse: 64 }, LIVE)
    expect(out.ok).toBe(true)
    expect(out.pendingActionId).toBeDefined()
    expect(await counts('bpReading')).toBe(0) // NOTHING saved yet

    const first = await confirmPendingAction({ id: out.pendingActionId!, via: 'card' })
    expect(first.ok).toBe(true)
    expect(await counts('bpReading')).toBe(1)

    // idempotent: double-tap / voice-card race resolves safely — the second
    // confirm reports the original outcome and writes NOTHING more
    const second = await confirmPendingAction({ id: out.pendingActionId!, via: 'card' })
    if (!second.ok) throw new Error('repeat confirm should be idempotent-ok')
    expect(second.result).toContain('Already confirmed')
    expect(await counts('bpReading')).toBe(1)

    const row = await db.bpReading.findFirst()
    expect(row?.systolic).toBe(118)
    expect(row?.source).toBe('agent')
  })

  test('decline never writes', async () => {
    const out = await executeToolCall('logGlucose', { value: 6.1, context: 'fasting' }, LIVE)
    const dec = await declinePendingAction(out.pendingActionId!, 'card')
    expect(dec.ok).toBe(true)
    expect(await counts('glucoseReading')).toBe(0)
    const dto = await getPendingAction(out.pendingActionId!)
    expect(dto?.status).toBe('declined')
  })

  test('model proposing a write is told NEVER to claim it saved', async () => {
    const out = await executeToolCall('logBloodPressure', { systolic: 120, diastolic: 80 }, LIVE)
    expect(out.ok).toBe(true)
    expect(out.forModel).toContain('nothing is saved yet')
    expect(out.forModel.toLowerCase()).toContain('never claim')
    expect(out.forModel.toLowerCase()).toContain('confirm')
  })

  test('medication proposal resolves name → id and snaps the slot', async () => {
    const med = await db.medication.create({
      data: { name: 'Lisinopril', doseValue: 10, doseUnit: 'mg', scheduleTimes: JSON.stringify(['08:00', '20:00']) },
    })
    const out = await executeToolCall('logMedicationTaken', { medication: 'lisinopril', scheduledTime: '07:40' }, LIVE)
    expect(out.ok).toBe(true)
    expect(out.pendingActionId).toBeDefined()
    const dto = await getPendingAction(out.pendingActionId!)
    expect(dto?.kind).toBe('med')
    expect((dto?.args.medicationId as string) ?? '').toBe(med.id)
    expect(dto?.args.scheduledTime).toBe('08:00') // snapped to the real slot

    const conf = await confirmPendingAction({ id: out.pendingActionId!, via: 'voice' })
    expect(conf.ok).toBe(true)
    expect(await counts('medicationLog')).toBe(1)
  })

  test('unknown medication name fails the proposal with a helpful error', async () => {
    const out = await executeToolCall('logMedicationTaken', { medication: 'Vitamin Zeta-9' }, LIVE)
    expect(out.ok).toBe(false)
    expect(out.forModel).toContain('getMedicationSchedule')
  })

  test('invalid args are rejected at proposal time (zod gate)', async () => {
    const out = await executeToolCall('logGlucose', { value: 999 }, LIVE)
    expect(out.ok).toBe(false)
    expect(out.pendingActionId).toBeUndefined()
    expect(await counts('glucoseReading')).toBe(0)
  })

  test('expired confirmations cannot be executed', async () => {
    const a = await createPendingAction({
      tool: 'logGlucose',
      args: { value: 5.5, source: 'chat' },
      readback: 'Log glucose 5.5',
      risk: 'medium',
      origin: 'chat',
    })
    await db.pendingAction.update({
      where: { id: a.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const out = await confirmPendingAction({ id: a.id, via: 'card' })
    if (out.ok) throw new Error('expired confirm must not execute')
    expect(out.reason).toContain('expired')
    expect(await counts('glucoseReading')).toBe(0)
  })

  test('every proposal and execution lands in the audit trail', async () => {
    const out = await executeToolCall('logBloodPressure', { systolic: 122, diastolic: 79, reason: 'user reported a reading' }, LIVE)
    await confirmPendingAction({ id: out.pendingActionId!, via: 'card' })
    const rows = await db.toolAudit.findMany({ where: { tool: 'logBloodPressure' }, orderBy: { createdAt: 'asc' } })
    const statuses = rows.map((r) => r.status)
    expect(statuses).toContain('pending') // proposal
    expect(statuses).toContain('executed') // confirmed execution
    expect(rows[0]?.reason).toBe('user reported a reading')
  })
})

describe('permission categories gate the agent', () => {
  test('disabling write category refuses proposals even on a live turn', async () => {
    await saveAgentPermissions({ write: false })
    const out = await executeToolCall('logBloodPressure', { systolic: 120, diastolic: 80 }, LIVE)
    expect(out.ok).toBe(false)
    expect(out.forModel).toContain('disabled')
    expect(await db.pendingAction.count()).toBe(0)
    // toolsForPrompt hides them too
    const names = (await toolsForPrompt(LIVE)).map((x) => x.name)
    expect(names).not.toContain('logBloodPressure')
    await saveAgentPermissions({ write: true })
  })

  test('confirm re-checks permissions — category disabled between propose and confirm cancels', async () => {
    const out = await executeToolCall('logBloodPressure', { systolic: 120, diastolic: 80 }, LIVE)
    await saveAgentPermissions({ write: false })
    const conf = await confirmPendingAction({ id: out.pendingActionId!, via: 'card' })
    expect(conf.ok).toBe(false)
    expect(await counts('bpReading')).toBe(0)
    await saveAgentPermissions({ write: true })
  })

  test('destructive tools require the category AND the typed phrase', async () => {
    const reading = await db.bpReading.create({
      data: { systolic: 130, diastolic: 85, takenAt: new Date() },
    })
    await saveAgentPermissions({ destructive: true })
    const out = await executeToolCall('deleteBpReading', { id: reading.id }, LIVE)
    expect(out.ok).toBe(true)
    const dto = await getPendingAction(out.pendingActionId!)
    expect(dto?.risk).toBe('high')
    expect(dto?.confirmationPhrase).toBe(HIGH_RISK_PHRASE)

    // wrong / missing phrase → refused
    const noPhrase = await confirmPendingAction({ id: out.pendingActionId!, via: 'card' })
    expect(noPhrase.ok).toBe(false)
    const badPhrase = await confirmPendingAction({ id: out.pendingActionId!, via: 'card', phrase: 'please' })
    expect(badPhrase.ok).toBe(false)
    expect(await db.bpReading.count()).toBe(1)

    // correct phrase → executed
    const good = await confirmPendingAction({ id: out.pendingActionId!, via: 'card', phrase: HIGH_RISK_PHRASE })
    expect(good.ok).toBe(true)
    expect(await db.bpReading.count()).toBe(0)
    await saveAgentPermissions({ destructive: false })
  })

  test('destructive category disabled → refused outright', async () => {
    const out = await executeToolCall('deleteGlucoseReading', { id: 'whatever' }, LIVE)
    expect(out.ok).toBe(false)
    expect(out.forModel).toContain('disabled')
  })
})

describe('read tools execute immediately (and are audited)', () => {
  test('getLatestReading returns real data', async () => {
    await db.bpReading.create({ data: { systolic: 118, diastolic: 76, takenAt: new Date() } })
    const out = await executeToolCall('getLatestReading', { kind: 'bp' }, NON_LIVE) // reads work even non-live
    expect(out.ok).toBe(true)
    expect(out.forModel).toContain('118/76')
    const audit = await db.toolAudit.findFirst({ where: { tool: 'getLatestReading' } })
    expect(audit?.status).toBe('executed')
  })

  test('unknown tool is reported honestly to the model', async () => {
    const out = await executeToolCall('deleteEverythingAndEmailStranger', {}, LIVE)
    expect(out.ok).toBe(false)
    expect(out.forModel).toContain('Unknown tool')
  })

  test('every registered tool name maps through the registry', () => {
    for (const t of AGENT_TOOLS) expect(getTool(t.name)?.name).toBe(t.name)
  })
})
