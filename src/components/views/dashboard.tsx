'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  HeartPulse, Droplets, Activity, Flame, Sparkles, Send, Plus,
  Check, X, Clock, AlertTriangle, ChevronRight, Loader2,
  PenLine, MessagesSquare, Pill, Siren,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { BpTrendChart, ScoreRadar } from '@/components/charts'
import { InsightFeed } from '@/components/insight-card'
import { BriefingCard } from '@/components/briefing-card'
import { PageHeader } from '@/components/page-header'
import { useStats, useInsights, useLogMedication, useAskEir } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { categorizeBp, BP_CATEGORIES } from '@/lib/health/bp'
import { useT } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { MobileHome } from '@/components/views/mobile-home'

function greetingKey(hour: number): string {
  return hour < 12 ? 'dashboard.greetingMorning' : hour < 18 ? 'dashboard.greetingAfternoon' : 'dashboard.greetingEvening'
}

export function DashboardView() {
  const { t } = useT()
  const setView = useUI((s) => s.setView)
  const stats = useStats()
  const insights = useInsights(12)
  const logMed = useLogMedication()
  const askEir = useAskEir()
  const [question, setQuestion] = useState('')
  const isMobile = useIsMobile()

  // Mobile Home is its own screen layer: one hero action, not a dashboard.
  // Desktop keeps the console-grade view below, untouched.
  if (isMobile) return <MobileHome />

  if (stats.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (!stats.data) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Could not load your data. Is the backend up?</CardContent></Card>
  }

  const s = stats.data
  const last = s.lastReading
  const lastCat = last ? categorizeBp(last.systolic, last.diastolic) : null
  const lastMeta = lastCat ? BP_CATEGORIES[lastCat] : null
  const highInsights = insights.data?.insights.filter((i) => ['high', 'critical'].includes(i.severity) && i.status === 'new') ?? []
  const hour = new Date().getHours()

  const setDose = (medId: string, time: string, status: string, medName: string) => {
    logMed.mutate({ medicationId: medId, date: new Date().toISOString().slice(0, 10), scheduledTime: time, status, actualTime: status === 'taken' || status === 'delayed' ? new Date().toTimeString().slice(0, 5) : null, medName })
  }
  const pendingDoseKey = logMed.isPending && logMed.variables ? `${logMed.variables.medicationId}-${logMed.variables.scheduledTime}` : null

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <PageHeader
        view="dashboard"
        title={t(greetingKey(hour), { name: s.profile.fullName.split(' ')[0] })}
        subtitle={
          <>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}{t('dashboard.streak')}: <b className="text-foreground">{s.streakDays} {t('dashboard.days')}</b>
          </>
        }
        actions={
          <Button onClick={() => setView('record')} className="min-h-[44px] gap-2">
            <Plus className="h-4 w-4" aria-hidden /> {t('dashboard.quickRecord')}
          </Button>
        }
      />

      {/* Quick actions — one tap to the essentials */}
      <div className="grid grid-cols-4 gap-2">
        {([
          ['record', t('nav.record'), PenLine],
          ['talk', t('nav.talk'), MessagesSquare],
          ['medications', t('nav.medications'), Pill],
          ['safety', t('nav.safety'), Siren],
        ] as const).map(([key, lbl, I]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="group flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card p-2 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            aria-label={lbl}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
              <I className="h-4 w-4" />
            </span>
            <span className="w-full truncate text-center text-[10px] font-semibold text-muted-foreground group-hover:text-foreground">{lbl}</span>
          </button>
        ))}
      </div>

      {/* Critical alerts */}
      {highInsights.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/40">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-rose-800 dark:text-rose-200">{highInsights[0].title}</div>
            <p className="mt-1 line-clamp-3 text-sm text-rose-700/90 dark:text-rose-300/90">{highInsights[0].body}</p>
          </div>
        </div>
      )}

      {/* Morning briefing */}
      <BriefingCard />

      {/* Top cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Last reading */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <HeartPulse className="h-4 w-4 text-rose-500" aria-hidden /> {t('dashboard.lastReading')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {last ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums tracking-tight">{last.systolic}/{last.diastolic}</span>
                    <span className="text-sm text-muted-foreground">mmHg</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {lastMeta && <Badge className={`${lastMeta.className} border-0`}>{lastMeta.label}</Badge>}
                    {last.pulse && <Badge variant="outline" className="gap-1"><Activity className="h-3 w-3" />{last.pulse} bpm</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(last.takenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {lastMeta && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lastMeta.advice}</p>}
                </>
              ) : (
                <div className="py-4 text-sm text-muted-foreground">No readings yet — start with a measurement.</div>
              )}
              <div className="mt-3 border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground">{t('dashboard.avg30')}</div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums">{s.bp30.avgSys}/{s.bp30.avgDia}</span>
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">{s.bp30.inTargetPct}% {t('dashboard.inTarget')}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Eir Score */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="h-full">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-600" aria-hidden /> {t('dashboard.score')}</span>
                <Badge variant="outline" className={s.score.total >= 70 ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}>
                  {s.score.gradeLabel}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-4">
              <div className="relative mt-1">
                <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`Eir Score ${s.score.total} of 100`}>
                  <circle cx="64" cy="64" r="54" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="12" />
                  <motion.circle
                    cx="64" cy="64" r="54" fill="none"
                    stroke={s.score.total >= 70 ? 'var(--chart-1)' : 'var(--metric)'} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(s.score.total / 100) * 339.3} 339.3`}
                    transform="rotate(-90 64 64)"
                    initial={{ strokeDasharray: '0 339.3' }}
                    animate={{ strokeDasharray: `${(s.score.total / 100) * 339.3} 339.3` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                  <text x="64" y="62" textAnchor="middle" className="fill-foreground text-[26px] font-bold tabular-nums">{s.score.total}</text>
                  <text x="64" y="82" textAnchor="middle" className="fill-muted-foreground text-[10px]">/ 100</text>
                </svg>
              </div>
              <p className="mt-1 text-center text-xs leading-relaxed text-muted-foreground">{s.score.spark}</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Meds today */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-teal-600" aria-hidden /> {t('dashboard.medsToday')}</span>
                <Badge variant="outline">{s.adherence.pct}%</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.schedule.length === 0 && <p className="py-3 text-sm text-muted-foreground">No medications scheduled. Add them in Medications.</p>}
              {s.schedule.map((d) => (
                <div key={`${d.medicationId}-${d.time}`} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.medicationName} <span className="text-xs font-normal text-muted-foreground">{d.dose}</span></div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.status === 'taken' ? t('dashboard.doseTaken') : d.status === 'missed' ? t('dashboard.doseMissed') : t('dashboard.dosePending', { time: d.time })}
                    </div>
                  </div>
                  {d.status === 'pending' ? (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-8 min-h-[36px] px-3" onClick={() => setDose(d.medicationId, d.time, 'taken', d.medicationName)} disabled={logMed.isPending}>
                        {pendingDoseKey === `${d.medicationId}-${d.time}`
                          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                          : <Check className="mr-1 h-3.5 w-3.5" aria-hidden />}
                        {t('dashboard.takeDose')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 min-h-[36px] px-2" aria-label="Skip dose" disabled={logMed.isPending} onClick={() => setDose(d.medicationId, d.time, 'skipped', d.medicationName)}>
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className={d.status === 'taken' ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : d.status === 'missed' ? 'border-rose-300 text-rose-700 dark:text-rose-400' : 'border-border text-muted-foreground'}>
                      {d.status}
                    </Badge>
                  )}
                </div>
              ))}
              {s.refills.filter((r) => r.urgent).length > 0 && (
                <div className="rounded-lg border border-metric/40 bg-metric/10 px-3 py-2 text-xs text-metric-foreground">
                  Refill soon: {s.refills.filter((r) => r.urgent).map((r) => r.med.name).join(', ')} — {s.refills.find((r) => r.urgent)?.daysLeft} days left
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Trend + score breakdown */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4 text-teal-600" aria-hidden /> {t('trends.bpTrend')} · 30d
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.dailyBp.length ? (
              <BpTrendChart data={s.dailyBp} sysTarget={s.profile.sysTarget} diaTarget={s.profile.diaTarget} height={230} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('trends.noData')}</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Score breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRadar components={s.score.components.map((c) => ({ label: c.label, value: c.value }))} height={190} />
            <div className="mt-1 space-y-1.5">
              {s.score.components.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{c.label}</span>
                  <Progress value={c.value} className="h-1.5" aria-label={`${c.label}: ${c.value}`} />
                  <span className="w-8 text-right text-[11px] tabular-nums">{c.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ask Eir */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <Sparkles className="hidden h-5 w-5 shrink-0 text-teal-600 sm:block" aria-hidden />
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && question.trim()) {
                askEir.mutate(question.trim())
                setQuestion('')
              }
            }}
            placeholder={t('dashboard.askPlaceholder')}
            aria-label={t('dashboard.askEir')}
            className="flex-1"
          />
          <Button
            onClick={() => { if (question.trim()) { askEir.mutate(question.trim()); setQuestion('') } }}
            disabled={askEir.isPending || !question.trim()}
            className="gap-2"
          >
            <Send className="h-4 w-4" aria-hidden /> {askEir.isPending ? 'Eir is thinking…' : t('dashboard.askEir')}
          </Button>
        </CardContent>
        {askEir.data && (
          <CardContent className="border-t bg-muted/30 pt-3 text-sm leading-relaxed">
            {askEir.data.answer}
            <div className="mt-2 text-[11px] text-muted-foreground">
              via {askEir.data.provider.label} · {askEir.data.provider.latencyMs} ms
            </div>
          </CardContent>
        )}
      </Card>

      {/* Insights */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Flame className="h-4 w-4 text-teal-600" aria-hidden /> {t('dashboard.insights')}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setView('trends')} className="gap-1 text-muted-foreground">
          Trends <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <InsightFeed insights={insights.data?.insights ?? []} />

      {insights.data && insights.data.insights.length === 0 && (
        <Button variant="outline" onClick={() => void fetch('/api/insights', { method: 'POST' })} className="w-full">
          <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Run a pattern check now
        </Button>
      )}
    </div>
  )
}
