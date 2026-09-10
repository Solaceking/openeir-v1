'use client'

// OpenEir — mobile Home. One hero action, not a dashboard.
// The large circular "Talk to Eir" entry owns first load; manual logging is
// a clear but subordinate second action; a compact two-line status strip
// (last reading, next dose) closes the screen. Everything else is one tap
// away — never zero taps away, never competing with the hero.
// Desktop keeps the console-grade dashboard; this layer is mobile's own.

import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, HeartPulse, Mic, PenLine, Pill, Siren } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { useStats, useInsights } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { hapticLight, hapticMedium } from '@/lib/haptics'
import { heroTapSpring, riseIn, springScreen } from '@/lib/motion'
import { categorizeBp, BP_CATEGORIES } from '@/lib/health/bp'

const R = 86
const C = 2 * Math.PI * R

function greetingKey(hour: number): string {
  return hour < 12 ? 'dashboard.greetingMorning' : hour < 18 ? 'dashboard.greetingAfternoon' : 'dashboard.greetingEvening'
}

function shortTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MobileHome() {
  const { t } = useT()
  const setView = useUI((s) => s.setView)
  const stats = useStats()
  const insights = useInsights(12)
  const qc = useQueryClient()

  const onRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['stats'] }),
      qc.invalidateQueries({ queryKey: ['insights'] }),
    ])
  }, [qc])

  const s = stats.data
  const last = s?.lastReading ?? null
  const lastCat = last ? categorizeBp(last.systolic, last.diastolic) : null
  const lastMeta = lastCat ? BP_CATEGORIES[lastCat] : null

  // next dose = soonest pending scheduled dose today
  const pending = (s?.schedule ?? []).filter((d) => d.status === 'pending')
  const nextDose = pending.length ? pending.reduce((a, b) => (a.time <= b.time ? a : b)) : null
  const dosesToday = (s?.schedule ?? []).length > 0

  const critical = insights.data?.insights.find(
    (i) => ['high', 'critical'].includes(i.severity) && i.status === 'new',
  )
  const hour = new Date().getHours()

  const goTalk = () => { hapticMedium(); setView('talk') }
  const go = (v: 'record' | 'readings' | 'medications' | 'safety') => { hapticLight(); setView(v) }

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="flex min-h-[calc(100dvh-13.5rem)] flex-col items-center pt-4">
        {/* greeting — the serif voice, quiet against the hero */}
        <motion.h1 {...riseIn} className="font-display truncate px-4 text-center text-[1.35rem] leading-snug">
          {s ? t(greetingKey(hour), { name: s.profile.fullName.split(' ')[0] }) : <span className="opacity-40">…</span>}
        </motion.h1>

        {/* ---- the hero: one large circular voice-first entry ---- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springScreen, delay: 0.05 }}
          className="relative mt-9"
        >
          {/* living ring — same register as the splash: rolling arc, amber spark */}
          <svg viewBox="0 0 200 200" className="pointer-events-none absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]" aria-hidden>
            <circle cx="100" cy="100" r={R} fill="none" className="stroke-primary/15" strokeWidth="1.5" />
            <circle
              cx="100" cy="100" r={R} fill="none"
              className="eir-ring-main stroke-primary"
              strokeWidth="2" strokeLinecap="round"
              strokeDasharray={`${C * 0.2} ${C * 0.8}`}
            />
            <circle cx="100" cy="100" r={R} fill="none" className="eir-ring-echo stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={`${C * 0.08} ${C * 0.92}`} />
          </svg>
          <svg viewBox="0 0 200 200" className="eir-ring-orbit pointer-events-none absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]" aria-hidden>
            <circle cx="100" cy="7" r="3.4" fill="#F2A65A" />
          </svg>

          <motion.button
            {...heroTapSpring}
            onClick={goTalk}
            aria-label={t('home.heroTitle')}
            className="eir-orb-btn eir-breathe relative flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full shadow-[var(--shadow-eir-float)]"
          >
            <Mic className="h-11 w-11" aria-hidden strokeWidth={2.1} />
            <span className="px-4 text-center text-[0.95rem] font-bold leading-tight tracking-tight">{t('home.heroTitle')}</span>
          </motion.button>
        </motion.div>
        <motion.p {...riseIn} transition={{ ...springScreen, delay: 0.12 }} className="mt-4 px-8 text-center text-[0.85rem] leading-relaxed text-muted-foreground">
          {t('home.heroSub')}
        </motion.p>

        {/* ---- secondary: manual logging, clear but subordinate ---- */}
        <motion.button
          {...riseIn}
          transition={{ ...springScreen, delay: 0.16 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => go('record')}
          className="eir-elevated mt-7 flex min-h-[48px] items-center gap-2 rounded-full border border-border/80 bg-card px-5 text-[0.9rem] font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <PenLine className="h-4 w-4 text-primary" aria-hidden />
          {t('home.logReading')}
        </motion.button>

        {/* ---- compact two-line status strip ---- */}
        <motion.div
          {...riseIn}
          transition={{ ...springScreen, delay: 0.2 }}
          className="eir-glass-soft mt-8 w-full max-w-sm rounded-3xl p-1.5"
        >
          {stats.isLoading ? (
            <div className="space-y-2 p-3" aria-busy>
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-3/4" />
            </div>
          ) : (
            <>
              <button
                onClick={() => go('readings')}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-[1.25rem] px-3.5 py-2 text-left transition-colors active:bg-accent"
                aria-label={last ? `${t('home.lastReading')}: ${last.systolic}/${last.diastolic}` : t('home.noReadingsYet')}
              >
                <HeartPulse className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
                {last ? (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('home.lastReading')}</span>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <span className="font-data text-xl tabular-nums">{last.systolic}/{last.diastolic}</span>
                      <span className="text-[0.7rem] text-muted-foreground">{shortTime(last.takenAt)}</span>
                      {lastMeta && <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none ${lastMeta.className}`}>{lastMeta.label}</span>}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-[0.85rem] font-medium text-muted-foreground">
                    {t('home.noReadingsYet')}
                  </span>
                )}
                <PenLine className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
              </button>

              <div className="mx-3.5 h-px bg-border/70" aria-hidden />

              <button
                onClick={() => go('medications')}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-[1.25rem] px-3.5 py-2 text-left transition-colors active:bg-accent"
                aria-label={nextDose ? `${t('home.nextDose')}: ${nextDose.medicationName} ${nextDose.time}` : t('nav.medications')}
              >
                <Pill className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
                {nextDose ? (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('home.nextDose')}</span>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <span className="max-w-[9rem] truncate text-[0.95rem] font-semibold">{nextDose.medicationName}</span>
                      <span className="font-data text-[0.95rem] tabular-nums">{nextDose.time}</span>
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-[0.85rem] font-medium text-muted-foreground">
                    {dosesToday ? t('home.dosesDone') : t('home.noDoses')}
                  </span>
                )}
                <Activity className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
              </button>

              {/* safety rides in the strip only when something needs attention */}
              {critical && (
                <>
                  <div className="mx-3.5 h-px bg-border/70" aria-hidden />
                  <button
                    onClick={() => go('safety')}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-[1.25rem] px-3.5 py-2 text-left transition-colors active:bg-accent"
                  >
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                      <AlertTriangle className="h-5 w-5 text-metric" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold text-metric-foreground">{critical.title}</span>
                    <Siren className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  </button>
                </>
              )}
            </>
          )}
        </motion.div>
      </div>
    </PullToRefresh>
  )
}
