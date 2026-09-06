'use client'

import { useMemo, useState } from 'react'
import { Download, Trash2, HeartPulse, Droplets } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBpReadings, useGlucoseReadings, useDeleteReading, useProfile } from '@/lib/api-client'
import { categorizeBp, BP_CATEGORIES } from '@/lib/health/bp'
import { categorizeGlucose, GLUCOSE_CATEGORIES, toMgdl } from '@/lib/health/glucose'
import { useT } from '@/lib/i18n'

export function ReadingsView() {
  const { t } = useT()
  const [days, setDays] = useState('30')
  const bp = useBpReadings(Number(days))
  const gl = useGlucoseReadings(Number(days))
  const del = useDeleteReading()
  const profile = useProfile()
  const unit = (profile.data?.profile.glucoseUnit ?? 'mmol') as 'mmol' | 'mgdl'

  const bpRows = useMemo(() => bp.data?.readings ?? [], [bp.data])
  const glRows = useMemo(() => gl.data?.readings ?? [], [gl.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.readings')}</h1>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32" aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>
          <a href={`/api/export?type=bp&format=csv`} download>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />CSV</Button>
          </a>
          <a href={`/api/export?format=json`} download>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />JSON</Button>
          </a>
        </div>
      </div>

      <Tabs defaultValue="bp">
        <TabsList>
          <TabsTrigger value="bp" className="gap-1.5"><HeartPulse className="h-4 w-4" aria-hidden />{t('record.bp')} ({bpRows.length})</TabsTrigger>
          <TabsTrigger value="glucose" className="gap-1.5"><Droplets className="h-4 w-4" aria-hidden />{t('record.glucose')} ({glRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bp">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[65vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Sys</TableHead>
                      <TableHead className="text-right">Dia</TableHead>
                      <TableHead className="text-right">Pulse</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bpRows.map((r) => {
                      const cat = categorizeBp(r.systolic, r.diastolic)
                      const meta = BP_CATEGORIES[cat]
                      let tags: string[] = []
                      try { tags = JSON.parse(r.tags) } catch { /* ignore */ }
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(r.takenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {r.source === 'bluetooth' && <span className="ml-1.5 text-[10px] text-teal-600">BT</span>}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{r.systolic}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{r.diastolic}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{r.pulse ?? '—'}</TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">{r.label.replace('_', '-')}</TableCell>
                          <TableCell><Badge className={`${meta.className} border-0 text-[11px]`}>{meta.label}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{tags.join(', ') || '—'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete reading"
                              onClick={() => del.mutate({ kind: 'bp', id: r.id })}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {bpRows.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">{t('trends.noData')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="glucose">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[65vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">{unit === 'mgdl' ? 'mg/dL' : 'mmol/L'}</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead className="text-right">Carbs</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glRows.map((r) => {
                      const cat = categorizeGlucose(r.value, r.context as 'fasting', { min: 4.4, max: 7.2 })
                      const meta = GLUCOSE_CATEGORIES[cat]
                      const display = unit === 'mgdl' ? toMgdl(r.value) : r.value
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">{new Date(r.takenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{display}</TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">{r.context.replace('_', ' ')}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{r.carbs ?? '—'}</TableCell>
                          <TableCell><Badge className={`${meta.className} border-0 text-[11px]`}>{meta.label}</Badge></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete reading"
                              onClick={() => del.mutate({ kind: 'glucose', id: r.id })}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {glRows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t('trends.noData')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
