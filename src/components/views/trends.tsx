'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BpTrendChart, GlucoseCurveChart, CategoryDistribution, ScoreRadar, CorrelationScatter } from '@/components/charts'
import { useStats, useBpReadings, useGlucoseReadings, useLifestyle, useProfile } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { correlateTagsWithSystolic, correlateSleepToMorningBp } from '@/lib/health/stats'
import { useT } from '@/lib/i18n'

export function TrendsView() {
  const { t } = useT()
  const [window, setWindow] = useState<'30' | '90'>('30')
  const stats = useStats()
  const bp = useBpReadings(Number(window))
  const gl = useGlucoseReadings(Number(window))
  const life = useLifestyle(Number(window))
  const profile = useProfile()
  const unit = (profile.data?.profile.glucoseUnit ?? 'mmol') as 'mmol' | 'mgdl'
  const simpleMode = useUI((st) => st.simpleMode)

  if (stats.isLoading) return <Skeleton className="h-96" />
  if (!stats.data) return <p className="text-sm text-muted-foreground">{t('trends.noData')}</p>
  const s = stats.data

  const bpRows = bp.data?.readings ?? []
  const tagCorrelations = correlateTagsWithSystolic(
    bpRows.map((r) => ({
      systolic: r.systolic, diastolic: r.diastolic, takenAt: r.takenAt,
      tags: (() => { try { return JSON.parse(r.tags) as string[] } catch { return [] } })(),
    })),
    Number(window),
  )
  const sleepCorr = correlateSleepToMorningBp(
    (life.data?.logs ?? []).map((l) => ({ date: l.date, sleepQuality: l.sleepQuality })),
    bpRows.map((r) => ({ systolic: r.systolic, diastolic: r.diastolic, takenAt: r.takenAt, label: r.label })),
  )

  const chartData = bpRows.map((r) => ({ at: r.takenAt, sys: r.systolic, dia: r.diastolic, pulse: r.pulse })).reverse()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.trends')}</h1>
        <Tabs value={window} onValueChange={(v) => setWindow(v as '30' | '90')}>
          <TabsList>
            <TabsTrigger value="30">30 {t('common.days')}</TabsTrigger>
            <TabsTrigger value="90">90 {t('common.days')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Avg BP', value: `${s.bp30.avgSys}/${s.bp30.avgDia}`, sub: `n=${s.bp30.count}` },
          { label: 'In target', value: `${s.bp30.inTargetPct}%`, sub: `goal ${s.profile.sysTarget}/${s.profile.diaTarget}` },
          { label: 'Glucose TIR', value: `${s.gl30.timeInRangePct}%`, sub: s.gl30.count ? `est. HbA1c ${s.gl30.estimatedHbA1c}%` : 'no data' },
          { label: 'Variability σ', value: `${s.bp30.stdSys} mmHg`, sub: `trend ${s.bp30.sysSlopePerDay >= 0 ? '+' : ''}${s.bp30.sysSlopePerDay}/day` },
        ].map((x) => (
          <Card key={x.label}>
            <CardContent className="p-3.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{x.label}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{x.value}</div>
              <div className="text-[10px] text-muted-foreground">{x.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">{t('trends.bpTrend')}</CardTitle></CardHeader>
          <CardContent>
            {chartData.length
              ? <BpTrendChart data={chartData} sysTarget={s.profile.sysTarget} diaTarget={s.profile.diaTarget} height={300} />
              : <p className="py-16 text-center text-sm text-muted-foreground">{t('trends.noData')}</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">{t('trends.distribution')}</CardTitle></CardHeader>
          <CardContent>
            <CategoryDistribution distribution={s.bp30.distribution} height={220} />
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>Morning avg <b className="text-foreground">{s.bp30.morningAvgSys}</b> · Evening avg <b className="text-foreground">{s.bp30.eveningAvgSys}</b></div>
              <div>Pulse avg <b className="text-foreground">{s.bp30.avgPulse} bpm</b></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {s.dailyGlucose.length > 0 && (
        <Card>
          <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">{t('trends.glucoseCurve')}</CardTitle></CardHeader>
          <CardContent>
            <GlucoseCurveChart
              data={s.dailyGlucose}
              min={s.profile.glucoseMin} max={s.profile.glucoseMax} unit={unit} height={260}
            />
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Fasting avg <b className="text-foreground">{s.gl30.avgFasting}</b></span>
              <span>Post-meal avg <b className="text-foreground">{s.gl30.avgPostMeal}</b></span>
              <span>Time in range <b className="text-foreground">{s.gl30.timeInRangePct}%</b></span>
              <span>Below <b className="text-foreground">{s.gl30.belowPct}%</b> · above <b className="text-foreground">{s.gl30.abovePct}%</b></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correlation explorer */}
      {!simpleMode && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('trends.correlations')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              {tagCorrelations.slice(0, 6).map((c) => (
                <div key={c.factor} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium capitalize">{c.factor.replace('-', ' ')}</div>
                    <div className="text-xs text-muted-foreground">{c.interpretation} · n={c.n}</div>
                  </div>
                  <Badge variant="outline" className={c.coefficient > 0.2 ? 'border-rose-300 text-rose-700 dark:text-rose-400' : c.coefficient < -0.2 ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : ''}>
                    r={c.coefficient.toFixed(2)}
                  </Badge>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium capitalize">{sleepCorr.factor}</div>
                  <div className="text-xs text-muted-foreground">{sleepCorr.interpretation} · n={sleepCorr.n}</div>
                </div>
                <Badge variant="outline">{sleepCorr.coefficient.toFixed(2)}</Badge>
              </div>
              {tagCorrelations.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">Add tags like “stress” or “exercise” when recording — the explorer will find what moves YOUR numbers.</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Sleep quality → next-morning systolic</div>
              <CorrelationScatter
                sleep={(life.data?.logs ?? []).map((l) => ({ date: l.date, sleepQuality: l.sleepQuality }))}
                bp={bpRows.map((r) => ({ at: r.takenAt, sys: r.systolic }))}
                height={230}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

