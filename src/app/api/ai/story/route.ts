// OpenEir — "Blood Pressure Story": AI turns a week of data into narrative.
// Cached per ISO-week; regeneration allowed with ?force=1.
import { db } from '@/lib/db'
import { ok, fail, rateLimit, clientKey } from '@/lib/api-utils'
import { buildHealthContext, contextForPrompt } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function mondayOf(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - diff)
  return date.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  if (!rateLimit(clientKey(req, 'story'), 6, 60_000)) return fail('Slow down a moment — stories take a few seconds to write.', 429)

  const weekStart = mondayOf(new Date())
  const cached = await db.storyEntry.findUnique({ where: { weekStart_period: { weekStart, period: 'week' } } })
  if (cached && !force) {
    return ok({ story: cached.content, weekStart, cached: true, createdAt: cached.createdAt })
  }

  const ctx = await buildHealthContext()
  if (!ctx) return fail('Complete setup first', 400)

  const result = await completeChat('story', [
    {
      role: 'system',
      content: `You are Eir, the narrative voice of the OpenEir app. Write "The Blood Pressure Story" — a warm, honest, 180–260 word narrative of the user's WEEK in second person. Structure it as flowing prose (no headers, no bullets): how the week went, what drove the highs and lows, one specific pattern worth noticing (use their real numbers), and one gentle suggestion for next week. Never invent numbers. Never diagnose. End with a single encouraging sentence.`,
    },
    {
      role: 'user',
      content: `Week starting ${weekStart}.\n\nHealth context (30-day window, last 7 days are "this week"):\n${contextForPrompt(ctx, 'full')}`,
    },
  ])

  if (!result.ok) {
    return fail('No AI provider reachable. Check Settings → AI providers.', 502, { attempted: result.attempted })
  }

  const statsSnapshot = {
    avgSys: ctx.bp.avgSys, avgDia: ctx.bp.avgDia, inTargetPct: ctx.bp.inTargetPct,
    adherence: ctx.adherence.pct, score: ctx.score.total, streak: ctx.streakDays,
  }
  const story = await db.storyEntry.upsert({
    where: { weekStart_period: { weekStart, period: 'week' } },
    create: { weekStart, period: 'week', content: result.text.trim(), statsJson: JSON.stringify(statsSnapshot) },
    update: { content: result.text.trim(), statsJson: JSON.stringify(statsSnapshot) },
  })
  return ok({ story: story.content, weekStart, cached: false, provider: result.providerLabel, createdAt: story.createdAt })
}
