'use client'

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FlaskConical, Loader2, Sparkles, ArrowRight, Scale, Moon, Dumbbell, Leaf, Wine, Pill, Brain, Footprints, Wheat } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useStats } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import type { WhatIfParams, WhatIfProjection } from '@/lib/health/whatif'

interface ApiResult { projection: WhatIfProjection; narrative: string | null }

const LEVERS: { key: keyof WhatIfParams; label: string; icon: typeof Scale; kind: 'slider' | 'toggle'; max?: number; unit?: string }[] = [
  { key: 'weightDeltaKg', label: 'Body weight', icon: Scale, kind: 'slider', max: 12, unit: 'kg lost' },
  { key: 'addedExerciseDays', label: 'Aerobic exercise days/week', icon: Dumbbell, kind: 'slider', max: 7, unit: 'days' },
  { key: 'addedSleepHours', label: 'Extra sleep per night', icon: Moon, kind: 'slider', max: 2, unit: 'h' },
  { key: 'reducedCarbsPerMealG', label: 'Fewer carbs per meal', icon: Wheat, kind: 'slider', max: 60, unit: 'g' },
  { key: 'sodiumReduction', label: 'Low-sodium / DASH eating', icon: Leaf, kind: 'toggle' },
  { key: 'alcoholReduction', label: 'Cut back alcohol', icon: Wine, kind: 'toggle' },
  { key: 'stressPractice', label: 'Daily relaxation practice', icon: Brain, kind: 'toggle' },
  { key: 'addedPostMealWalks', label: '15-min walks after meals', icon: Footprints, kind: 'toggle' },
  { key: 'adherenceImprovementPct', label: 'Improve med adherence', icon: Pill, kind: 'slider', max: 30, unit: '% points' },
]

export function WhatIfView() {
  const { t } = useT()
  const stats = useStats()
  const [params, setParams] = useState<WhatIfParams>({
    weightDeltaKg: 0, sodiumReduction: false, addedExerciseDays: 0, alcoholReduction: false,
    adherenceImprovementPct: 0, addedSleepHours: 0, stressPractice: false,
    reducedCarbsPerMealG: 0, addedPostMealWalks: false,
  })

  const run = useMutation<ApiResult, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/ai/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, narrative: true }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        throw new Error(b?.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ApiResult>
    },
  })

  const active = useMemo(
    () => Object.entries(params).filter(([, v]) => (typeof v === 'boolean' ? v : Number(v) > 0)),
    [params],
  )

  if (stats.isLoading) return <Skeleton className="h-96" />
  if (!stats.data) return <p className="text-sm text-muted-foreground">Load your data first.</p>
  const s = stats.data

  const p = run.data?.projection
  const anyChange = active.length > 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FlaskConical className="h-6 w-6 text-teal-600" aria-hidden />{t('whatif.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('whatif.subtitle')} · {t('whatif.weeksNote')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Levers */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Choose your changes</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {LEVERS.map((lever) => {
              const Icon = lever.icon
              const val = params[lever.key]
              return (
                <div key={lever.key} className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></div>
                    <span className="truncate text-sm font-medium">{lever.label}</span>
                  </div>
                  {lever.kind === 'toggle' ? (
                    <Switch
                      checked={Boolean(val)}
                      onCheckedChange={(v) => setParams((prev) => ({ ...prev, [lever.key]: v }))}
                      aria-label={lever.label}
                    />
                  ) : (
                    <div className="flex w-44 shrink-0 items-center gap-2">
                      <Slider
                        value={[Number(val)]} min={0} max={lever.max ?? 10} step={1}
                        onValueChange={(v) => setParams((prev) => ({ ...prev, [lever.key]: v[0] }))}
                        aria-label={lever.label}
                      />
                      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                        {Number(val) > 0 ? `${val}${lever.unit ? ` ${lever.unit}` : ''}` : '—'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
            <Button onClick={() => run.mutate()} disabled={!anyChange || run.isPending} className="w-full gap-2" size="lg">
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {run.isPending ? 'Simulating…' : 'Simulate my future'}
            </Button>
          </CardContent>
        </Card>

        {/* Projection */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('whatif.current')} → {t('whatif.projected')}</CardTitle></CardHeader>
            <CardContent>
              {!p ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Pick some changes and run the simulation.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 rounded-xl border bg-muted/20 py-4">
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{t('whatif.current')}</div>
                      <div className="text-2xl font-bold tabular-nums">{p.currentAvgSys}/{p.currentAvgDia}</div>
                    </div>
                    <ArrowRight className={`h-5 w-5 ${p.totalDeltaSys < 0 ? 'text-emerald-600' : p.totalDeltaSys > 0 ? 'text-rose-600' : 'text-muted-foreground'}`} aria-hidden />
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{t('whatif.projected')}</div>
                      <div className={`text-2xl font-bold tabular-nums ${p.totalDeltaSys < 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{p.projectedAvgSys}/{p.projectedAvgDia}</div>
                    </div>
                  </div>
                  {s.gl30.count > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Avg glucose</span>
                      <span className="font-semibold tabular-nums">
                        {p.currentAvgGlucose} → {p.projectedAvgGlucose} mmol/L
                        {p.totalDeltaGlucose > 0.05 && <span className="ml-1 text-emerald-600">({p.totalDeltaGlucose.toFixed(2)})</span>}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">In-target estimate</span>
                    <span className="font-semibold tabular-nums">{s.bp30.inTargetPct}% → {p.newInTargetPctEstimate}%</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">Where it comes from</div>
                    <div className="space-y-1">
                      {p.contributions.map((c) => (
                        <div key={c.label} className="flex items-center justify-between text-xs">
                          <span className="min-w-0 truncate text-muted-foreground">{c.label}</span>
                          <span className={`ml-2 shrink-0 font-semibold tabular-nums ${c.deltaSys < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                            {c.deltaSys > 0 ? '+' : ''}{c.deltaSys} mmHg
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t pt-1.5 text-xs font-semibold">
                        <span>Total effect</span>
                        <Badge variant="outline" className={p.totalDeltaSys < 0 ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : ''}>
                          {p.totalDeltaSys > 0 ? '+' : ''}{p.totalDeltaSys} mmHg
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {run.isPending && (
            <Card><CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Eir is interpreting your simulation…
            </CardContent></Card>
          )}

          {run.data?.narrative && (
            <Card className="border-teal-200/60 bg-teal-50/30 dark:border-teal-900 dark:bg-teal-950/20">
              <CardContent className="p-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Eir says
                </div>
                <p className="text-sm leading-relaxed">{run.data.narrative}</p>
              </CardContent>
            </Card>
          )}

          {run.error && (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">{(run.error as Error).message}</CardContent></Card>
          )}
        </div>
      </div>
    </div>
  )
}
