// OpenEir — Morning Briefing.
// A deterministic, spoken-friendly daily snapshot assembled from the SAME
// health context every other AI feature uses. No LLM required (reliable,
// instant, zero cost), phrased the way Eir talks: warm, precise, plain.

import type { HealthContext } from '@/lib/ai/context'

export interface BriefingSection {
  icon: 'score' | 'bp' | 'glucose' | 'meds' | 'streak' | 'warning' | 'focus'
  label: string
  text: string
}

export interface Briefing {
  headline: string
  sections: BriefingSection[]
  spoken: string // TTS-friendly plain sentences — no slashes, symbols or markdown
  focusAction: string | null
}

const hr = (n: number) => Math.round(n)

function greetingFor(hour: number, name: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name}.`
}

function bpSentence(ctx: HealthContext): string | null {
  if (!ctx.bp.count) return null
  const latest = ctx.raw.bpReadings7d[0]
  const avg = `${hr(ctx.bp.avgSys)} over ${hr(ctx.bp.avgDia)}`
  const inTarget = ctx.bp.inTargetPct
  const latestTxt = latest
    ? ` Your latest was ${latest.systolic} over ${latest.diastolic}${typeof latest.pulse === 'number' ? `, pulse ${latest.pulse}` : ''}.`
    : ''
  const trend = typeof ctx.bp.sysSlopePerDay === 'number' && Math.abs(ctx.bp.sysSlopePerDay) >= 0.15
    ? ctx.bp.sysSlopePerDay > 0
      ? ' Systolic is drifting gently upward across the month.'
      : ' Systolic is trending gently downward — keep doing what you are doing.'
    : ''
  const targetTxt = ` Your target is ${ctx.profile.sysTarget} over ${ctx.profile.diaTarget}, and ${inTarget} percent of readings hit it this month.${latestTxt}${trend}`
  return `Your average blood pressure is ${avg}.${targetTxt}`
}

function glucoseSentence(ctx: HealthContext): string | null {
  if (!ctx.glucose.count) return null
  const avg = ctx.glucose.avg
  const tir = ctx.glucose.timeInRangePct
  const a1c = ctx.glucose.estimatedHbA1c
  return `Glucose average is ${avg.toFixed(1)}, with ${tir} percent of readings in range${a1c ? ` — that estimates to an H b A one c near ${a1c.toFixed(1)} percent` : ''}.`
}

function adherenceSentence(ctx: HealthContext): string | null {
  if (!ctx.adherence.total) return null
  const pct = ctx.adherence.pct
  const missed = ctx.adherence.missed
  const streak = ctx.adherence.consecutiveTaken
  if (missed === 0) return `Medication adherence is perfect — ${pct} percent over two weeks, with a current streak of ${streak} dose${streak === 1 ? '' : 's'} taken on time.`
  return `You have taken ${pct} percent of doses over the last two weeks, with ${missed} missed. The current streak is ${streak}.`
}

const WARNING_FOCUS: Record<string, string> = {
  rising_trend: 'Keep sodium low today and log one morning and one evening reading so we can confirm the trend.',
  morning_surge: 'Sit quietly for five minutes before your morning reading, and take it before coffee.',
  adherence_drop: 'Put your pills somewhere you cannot miss — and remember I can remind you if you ask.',
  variability_spike: 'Breathe slowly for a minute before each reading, and measure at the same times as usual.',
  glucose_rising: 'A ten-minute walk after your biggest meal would blunt the spike.',
  hypo_risk: 'Do not skip meals today, and keep a fast sugar within reach.',
}

function warningSentence(ctx: HealthContext): { text: string; focus: string } | null {
  const ranked = [...ctx.warnings].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as Record<string, number>
    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5)
  })
  const top = ranked[0]
  if (!top) return null
  return { text: `${top.title}. ${top.body}`, focus: WARNING_FOCUS[top.type] ?? top.body }
}

function medsTodaySentence(todayDoses: { time: string; label: string }[], now: Date): string | null {
  if (!todayDoses.length) return null
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const upcoming = todayDoses.filter((d) => d.time > nowHM)
  const next = upcoming[0] ?? todayDoses[todayDoses.length - 1]
  return upcoming.length
    ? `You have ${upcoming.length} dose${upcoming.length === 1 ? '' : 's'} still ahead today — next is ${next.label} at ${next.time}.`
    : `All of today's doses are behind you. Next is ${next.label} tomorrow at ${next.time}.`
}

export interface BriefingInput {
  ctx: HealthContext
  todayDoses: { time: string; label: string }[]
  now?: Date
}

export function buildBriefing({ ctx, todayDoses, now = new Date() }: BriefingInput): Briefing {
  const name = ctx.profile.name || 'Friend'
  const sections: BriefingSection[] = []
  const spokenParts: string[] = [greetingFor(now.getHours(), name)]

  // Headline: score + one-line state
  const weakest = [...ctx.score.components].sort((a, b) => a.value - b.value)[0]
  const headline = `Eir score ${ctx.score.total} · grade ${ctx.score.grade}`

  // BP
  const bp = bpSentence(ctx)
  if (bp) {
    sections.push({ icon: 'bp', label: 'Blood pressure', text: bp })
    spokenParts.push(bp)
  }

  // Glucose
  const gl = glucoseSentence(ctx)
  if (gl) {
    sections.push({ icon: 'glucose', label: 'Glucose', text: gl })
    spokenParts.push(gl)
  }

  // Adherence
  const ad = adherenceSentence(ctx)
  if (ad) {
    sections.push({ icon: 'meds', label: 'Medication', text: ad })
    spokenParts.push(ad)
  }

  // Today's schedule
  const medsToday = medsTodaySentence(todayDoses, now)
  if (medsToday) {
    sections.push({ icon: 'meds', label: 'Today', text: medsToday })
    spokenParts.push(medsToday)
  }

  // Streak celebration
  if (ctx.streakDays >= 3) {
    const st = `You are on a ${ctx.streakDays}-day logging streak. That consistency is exactly what makes the trends trustworthy.`
    sections.push({ icon: 'streak', label: 'Streak', text: st })
    spokenParts.push(st)
  }

  // Warning + focus
  const warn = warningSentence(ctx)
  if (warn) {
    sections.push({ icon: 'warning', label: 'Watch', text: warn.text })
    spokenParts.push(`One thing to watch: ${warn.text}`)
    if (warn.focus) {
      sections.push({ icon: 'focus', label: 'Today’s focus', text: warn.focus })
      spokenParts.push(`Today's focus: ${warn.focus}`)
    }
  } else {
    const focus = weakest
      ? `Nothing needs an alarm bell. If you do one thing today, let it support "${weakest.label}" — it is your softest score right now.`
      : 'Nothing needs attention today. Keep logging and I will keep watching.'
    sections.push({ icon: 'focus', label: 'Today’s focus', text: focus })
    spokenParts.push(focus)
  }

  spokenParts.push('Have a good day. I am here whenever you need me.')

  return { headline, sections, focusAction: warn?.focus ?? null, spoken: spokenParts.join(' ') }
}
