// OpenEir — the AI Orchestrator.
// Decides WHEN to think (event-driven, priority-gated), WHETHER rules are
// enough (they usually are), WHICH provider to use (fallback chain), and HOW
// to present the result (ambient insight cards, never chatbot-first).

import { db } from '@/lib/db'
import { buildHealthContext, contextForPrompt, type HealthContext } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'
import { publishRealtime } from '@/lib/events'
import { categorizeBp } from '@/lib/health/bp'
import { missedDoseRecovery } from '@/lib/health/meds'

type Autonomy = 'off' | 'gentle' | 'proactive'

const parse = <T,>(s: string | null | undefined, fallback: T): T => {
  try { return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}

function inQuietHours(prefs: { quietHours?: { start?: string; end?: string; enabled?: boolean } }): boolean {
  const qh = prefs.quietHours
  if (!qh?.enabled) return false
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = (qh.start ?? '22:00').split(':').map(Number)
  const [eh, em] = (qh.end ?? '07:00').split(':').map(Number)
  const start = sh * 60 + sm, end = eh * 60 + em
  return start > end ? mins >= start || mins < end : mins >= start && mins < end
}

async function getAutonomy(): Promise<Autonomy> {
  const profile = await db.profile.findFirst()
  const prefs = parse<{ aiAutonomy?: Autonomy }>(profile?.prefs, {})
  return prefs.aiAutonomy ?? 'proactive'
}

/** Create an insight with de-duplication (same title within 6h → skip). */
async function createInsight(input: {
  kind: string; severity: string; title: string; body: string
  dataJson?: Record<string, unknown>; sourceEvent?: string; origin?: string
}) {
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000)
  const dupe = await db.insight.findFirst({
    where: { title: input.title, createdAt: { gte: sixHoursAgo } },
  })
  if (dupe) return null
  const insight = await db.insight.create({
    data: {
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body,
      dataJson: input.dataJson ? JSON.stringify(input.dataJson) : null,
      sourceEvent: input.sourceEvent,
      origin: input.origin ?? 'rule',
    },
  })
  publishRealtime('insight:new', {
    id: insight.id, kind: insight.kind, severity: insight.severity,
    title: insight.title, body: insight.body, origin: insight.origin,
    createdAt: insight.createdAt,
  })
  return insight
}

// ---------------------------------------------------------------
// Rule engine — instant, free, deterministic insights. AI enriches later.
// ---------------------------------------------------------------
async function ruleEngine(ctx: HealthContext, event: string): Promise<void> {
  const cat = categorizeBp(
    ctx.bp.avgSys, ctx.bp.avgDia,
  )

  // celebrations first — momentum matters
  if (ctx.adherence.consecutiveTaken >= 7 && event === 'MEDICATION_TAKEN') {
    await createInsight({
      kind: 'celebration', severity: 'info',
      title: `${ctx.adherence.consecutiveTaken}-day perfect streak`,
      body: `Every scheduled dose taken for ${ctx.adherence.consecutiveTaken} days straight. Adherence is the strongest lever you have on your numbers — this is exactly how winning weeks look.`,
    })
  }
  if (ctx.streakDays >= 7 && ['READING_LOGGED', 'PATTERN_CHECK'].includes(event) && ctx.streakDays % 7 === 0) {
    await createInsight({
      kind: 'celebration', severity: 'info',
      title: `${ctx.streakDays} days of consistent logging`,
      body: `You have logged readings ${ctx.streakDays} days in a row. Consistent data is what makes every insight in this app possible — and what makes your doctor's job easier.`,
    })
  }

  // crisis-stage single reading handled by the reading path; here: window-level warnings
  for (const w of ctx.warnings) {
    if (event === 'PATTERN_CHECK' || event === 'READING_LOGGED') {
      await createInsight({
        kind: w.type === 'adherence_drop' ? 'warning' : 'pattern',
        severity: w.severity,
        title: w.title,
        body: w.body,
        dataJson: w.data,
        sourceEvent: event,
      })
    }
  }

  // glucose low/high single-reading guard
  if (event === 'READING_LOGGED' && ctx.glucose.count > 0 && ctx.glucose.avgFasting >= 7.0) {
    await createInsight({
      kind: 'pattern', severity: 'medium',
      title: 'Fasting glucose is running high',
      body: `Your 30-day fasting average is ${ctx.glucose.avgFasting} mmol/L (estimated HbA1c ≈ ${ctx.glucose.estimatedHbA1c}%). Bedtime carbs and dinner portion size are worth a look — your post-meal average is ${ctx.glucose.avgPostMeal} mmol/L.`,
    })
  }

  void cat
}

// ---------------------------------------------------------------
// AI enrichment — batched, polite, skippable
// ---------------------------------------------------------------
async function aiEnrich(ctx: HealthContext, event: string, detail: Record<string, unknown>): Promise<void> {
  const autonomy = await getAutonomy()
  if (autonomy === 'off') return
  const profile = await db.profile.findFirst()
  const prefs = parse<{ quietHours?: { enabled?: boolean } }>(profile?.prefs, {})
  if (inQuietHours(prefs)) return
  if (autonomy === 'gentle' && !['READING_LOGGED', 'MANUAL_QUERY'].includes(event)) return

  const recentTitles = ctx.recentInsights.map((i) => i.title)
  const result = await completeChat('insight', [
    {
      role: 'system',
      content: `You are Eir, the ambient health intelligence inside the OpenEir app. You write ONE short, warm, specific observation (max 90 words) for the user based on their data. Rules: reference concrete numbers from the data; never invent numbers; never give emergency instructions; never diagnose; suggest at most one concrete next step; do not repeat any of these recent insights: ${JSON.stringify(recentTitles)}. End with nothing else — no preamble, no markdown headers.`,
    },
    {
      role: 'user',
      content: `Event: ${event}\nEvent detail: ${JSON.stringify(detail)}\nHealth context: ${contextForPrompt(ctx, 'light')}\n\nWrite the insight now.`,
    },
  ])
  if (!result.ok) return
  const title = result.text.trim().split('\n')[0].slice(0, 80).replace(/["*]/g, '') || 'A pattern worth noticing'
  await createInsight({
    kind: 'coach', severity: 'info', title, body: result.text.trim(),
    sourceEvent: event, origin: 'ai',
  })
}

// ---------------------------------------------------------------
// Event router
// ---------------------------------------------------------------
export async function processEvent(eventId: string): Promise<void> {
  const record = await db.eventRecord.findUnique({ where: { id: eventId } })
  if (!record || record.processed) return
  const payload = parse<Record<string, unknown>>(record.payload, {})
  const ctx = await buildHealthContext()

  try {
    if (!ctx) return

    switch (record.type) {
      case 'READING_LOGGED': {
        const kind = payload.kind as 'bp' | 'glucose'
        if (kind === 'bp') {
          const sys = payload.systolic as number
          const dia = payload.diastolic as number
          const cat = categorizeBp(sys, dia)
          if (cat === 'crisis') {
            await createInsight({
              kind: 'warning', severity: 'critical',
              title: 'Crisis-level reading — re-measure now',
              body: `A reading of ${sys}/${dia} is in the hypertensive crisis range (≥180/≥120). Rest quietly for five minutes and measure again. If the second reading confirms it, contact your doctor or local emergency number — do not wait for the next scheduled reading.`,
              sourceEvent: 'READING_LOGGED',
            })
          } else if (cat === 'stage2') {
            await createInsight({
              kind: 'warning', severity: 'high',
              title: `That reading was ${sys}/${dia} — Stage 2 range`,
              body: `Rest for five minutes with your back supported and feet flat, then take a second reading. Isolated spikes happen (stress, caffeine, a rushed morning) — a pattern is what matters. Your 30-day average is ${ctx.bp.avgSys}/${ctx.bp.avgDia}.`,
              dataJson: { reading: { sys, dia }, avg: `${ctx.bp.avgSys}/${ctx.bp.avgDia}` },
              sourceEvent: 'READING_LOGGED',
            })
          } else if (cat === 'normal' && ctx.bp.avgSys > 0 && sys < ctx.bp.avgSys - 8) {
            await createInsight({
              kind: 'celebration', severity: 'info',
              title: `Nice reading: ${sys}/${dia}`,
              body: `That is ${Math.round(ctx.bp.avgSys - sys)} mmHg below your 30-day average of ${ctx.bp.avgSys}. Whatever you did today — rest, movement, less salt — your vessels noticed.`,
              sourceEvent: 'READING_LOGGED',
            })
          }
        }
        if (kind === 'glucose') {
          const value = payload.value as number
          if (value < 3.9) {
            await createInsight({
              kind: 'warning', severity: 'high',
              title: 'Low glucose reading',
              body: `A value of ${value} mmol/L is below the hypoglycemia threshold (3.9). Have a fast-acting carbohydrate now (glucose tablets, juice) and re-check in 15 minutes. If readings like this repeat, tell your doctor — especially if you are not on insulin or sulfonylureas.`,
              sourceEvent: 'READING_LOGGED',
            })
          }
        }
        await ruleEngine(ctx, 'READING_LOGGED')
        void aiEnrich(ctx, 'READING_LOGGED', payload).catch(() => {})
        break
      }

      case 'MEDICATION_MISSED': {
        const time = (payload.scheduledTime as string) ?? 'unknown'
        const med = (payload.medicationName as string) ?? 'your medication'
        const recovery = missedDoseRecovery(time)
        await createInsight({
          kind: 'warning', severity: ctx.adherence.pct < 80 ? 'medium' : 'low',
          title: `Missed dose: ${med} at ${time}`,
          body: `${recovery.action}. ${recovery.rationale} Your 14-day adherence is ${ctx.adherence.pct}%.${ctx.adherence.pct < 85 ? ' A recurring pattern like this is worth a conversation with your prescriber — dose timing can usually be redesigned to fit your day.' : ''}`,
          dataJson: { medication: med, scheduledTime: time, adherence: ctx.adherence.pct },
          sourceEvent: 'MEDICATION_MISSED',
        })
        await ruleEngine(ctx, 'MEDICATION_MISSED')
        break
      }

      case 'MEDICATION_TAKEN': {
        await ruleEngine(ctx, 'MEDICATION_TAKEN')
        break
      }

      case 'PATTERN_CHECK': {
        await ruleEngine(ctx, 'PATTERN_CHECK')
        // engagement drop check
        const lastReading = ctx.raw.bpReadings7d[0]?.takenAt
        if (lastReading && Date.now() - new Date(lastReading).getTime() > 3 * 86400000) {
          await createInsight({
            kind: 'tip', severity: 'low',
            title: 'It has been a few days since your last reading',
            body: 'Gaps make trends harder to read — and trends are where the real answers live. A 30-second morning reading is enough to keep the picture sharp.',
            sourceEvent: 'PATTERN_CHECK',
          })
        }
        break
      }

      case 'MILESTONE_REACHED': {
        await createInsight({
          kind: 'celebration', severity: 'info',
          title: String(payload.title ?? 'Milestone reached'),
          body: String(payload.body ?? 'Keep the momentum going.'),
          sourceEvent: 'MILESTONE_REACHED',
        })
        break
      }

      case 'BLUETOOTH_SYNCED': {
        await createInsight({
          kind: 'tip', severity: 'info',
          title: 'Device data synced',
          body: `Imported ${payload.count ?? 'new'} reading(s) from your Bluetooth device. Everything landed in your history — check Trends to see how today fits the week.`,
          sourceEvent: 'BLUETOOTH_SYNCED',
        })
        break
      }

      case 'MANUAL_QUERY': {
        const question = String(payload.question ?? '')
        if (!question.trim()) break
        const result = await completeChat('chat', [
          {
            role: 'system',
            content: `You are Eir, the health intelligence in the self-hosted OpenEir app. Answer the user's question about THEIR OWN data in under 140 words, warm and specific, citing their actual numbers. Never diagnose, never emergency-triage beyond advising them to contact their doctor, never invent numbers. Plain text only.`,
          },
          {
            role: 'user',
            content: `Question: ${question}\n\nHealth context: ${contextForPrompt(ctx, 'full')}`,
          },
        ])
        if (result.ok) {
          await createInsight({
            kind: 'coach', severity: 'info', origin: 'ai',
            title: `Re: ${question.slice(0, 60)}`,
            body: result.text.trim(),
            sourceEvent: 'MANUAL_QUERY',
          })
        } else {
          await createInsight({
            kind: 'tip', severity: 'low', origin: 'rule',
            title: 'Eir could not answer right now',
            body: `No AI provider is currently reachable (tried: ${result.attempted.join('; ') || 'none configured'}). Your data is unaffected — try again after checking Settings → AI Providers.`,
            sourceEvent: 'MANUAL_QUERY',
          })
        }
        break
      }

      default:
        break
    }
  } finally {
    await db.eventRecord.update({ where: { id: eventId }, data: { processed: true } })
  }
}
