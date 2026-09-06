// OpenEir — example autonomous agent harness.
// A tiny scheduled agent that polls OpenEir's agent API, runs a weekly
// deep analysis over your data, and pushes findings back as insights.
//
// Run standalone:   OPENEIR_URL=http://localhost:3000 bun examples/agent-harness/index.ts
// Run in Docker:    docker compose --profile agent up -d

const BASE = process.env.OPENEIR_URL ?? 'http://localhost:3000'
const INTERVAL_MIN = Number(process.env.AGENT_INTERVAL_MINUTES ?? 60)
const AGENT_NAME = process.env.AGENT_NAME ?? 'homelab-analyst'

const log = (...a: unknown[]) => console.log(`[agent:${AGENT_NAME}]`, ...a)

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface EventRow { id: string; type: string; priority: string; payload: Record<string, unknown> }
interface Stats {
  bp30: { avgSys: number; avgDia: number; inTargetPct: number; stdSys: number; sysSlopePerDay: number; morningAvgSys: number; eveningAvgSys: number }
  adherence: { pct: number; consecutiveTaken: number }
  gl30: { timeInRangePct: number; avgFasting: number; estimatedHbA1c: number }
  score: { total: number }
  streakDays: number
}

async function main() {
  log(`started — polling ${BASE} every ${INTERVAL_MIN} min`)

  const runOnce = async () => {
    try {
      // 1. poll pending events
      const { pendingEvents } = await j<{ pendingEvents: EventRow[] }>('/api/agent/poll')

      // 2. fetch full health digest
      const stats = await j<Stats>('/api/stats')

      // 3. deep analysis — rule-flavored, your imagination is the limit
      const findings: { title: string; body: string; severity: string }[] = []

      const gap = stats.bp30.stdSys
      if (gap >= 14) {
        findings.push({
          title: `Deep analysis: variability is your real enemy this week (σ ${gap})`,
          body: `Across all 30-day data, your systolic swings ${gap} mmHg around an average of ${stats.bp30.avgSys}. Morning average ${stats.bp30.morningAvgSys} vs evening ${stats.bp30.eveningAvgSys}. Agent recommendation: add one evening reading on your two most stressful weekdays and compare — that pattern is the cheapest experiment you can run this month.`,
          severity: gap >= 18 ? 'high' : 'medium',
        })
      }
      if (stats.adherence.consecutiveTaken >= 3 && stats.adherence.consecutiveTaken < 7) {
        findings.push({
          title: `Streak watcher: ${stats.adherence.consecutiveTaken} perfect days`,
          body: `You are ${7 - stats.adherence.consecutiveTaken} days from a perfect week — historically the strongest predictor of a lower weekly average in your own data. Keep tonight's dose anchored to a fixed habit.`,
          severity: 'info',
        })
      }
      if (stats.gl30.avgFasting >= 6.5 && stats.gl30.timeInRangePct < 75) {
        findings.push({
          title: 'Fasting glucose above 6.5 for sustained period',
          body: `Fasting average is ${stats.gl30.avgFasting} mmol/L with ${stats.gl30.timeInRangePct}% time in range (est. HbA1c ${stats.gl30.estimatedHbA1c}%). Worth a lab conversation at your next visit. Consider a protein-forward breakfast — morning readings respond quickly in many people.`,
          severity: 'medium',
        })
      }

      // 4. push at most one finding per cycle (polite ambient behavior)
      if (findings.length) {
        const f = findings[0]
        await j('/api/agent/insights', {
          method: 'POST',
          body: JSON.stringify({ ...f, kind: 'agent', agentName: AGENT_NAME }),
        })
        log(`pushed insight: ${f.title}`)
      }

      // 5. acknowledge processed events
      if (pendingEvents.length) {
        await j('/api/agent/poll', { method: 'POST', body: JSON.stringify({ ack: pendingEvents.map((e) => e.id) }) })
        log(`acked ${pendingEvents.length} event(s)`)
      }
    } catch (e) {
      log('cycle failed:', e instanceof Error ? e.message : e)
    }
  }

  await runOnce()
  setInterval(runOnce, INTERVAL_MIN * 60_000)
}

void main()
