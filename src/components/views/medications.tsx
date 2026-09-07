'use client'

import { useState } from 'react'
import { Pill, Plus, Package, ShieldAlert, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useMedications, useMedicationMutations, useStats, useLogMedication } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/page-header'

const SCHEDULE_OPTIONS = ['08:00', '12:00', '20:00', '08:00+20:00']

export function MedicationsView() {
  const { t } = useT()
  const meds = useMedications()
  const stats = useStats()
  const { create, update, remove } = useMedicationMutations()
  const logMed = useLogMedication()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dose, setDose] = useState('10')
  const [unit, setUnit] = useState('mg')
  const [purpose, setPurpose] = useState('')
  const [times, setTimes] = useState('08:00+20:00')
  const [stock, setStock] = useState('60')

  const todayIso = new Date().toISOString().slice(0, 10)
  const logDose = (medId: string, medName: string, time: string, status: string) => {
    logMed.mutate({
      medicationId: medId,
      date: todayIso,
      scheduledTime: time,
      status,
      actualTime: status === 'taken' || status === 'delayed' ? new Date().toTimeString().slice(0, 5) : null,
      medName,
    })
  }

  const addMed = () => {
    if (!name.trim()) return
    create.mutate({
      name: name.trim(),
      doseValue: Number(dose) || 1,
      doseUnit: unit,
      purpose: purpose.trim() || null,
      scheduleTimes: times === 'custom' ? ['08:00'] : times.split('+'),
      stock: stock ? Number(stock) : null,
      refillThreshold: 10,
    })
    setOpen(false); setName(''); setPurpose(''); setDose('10'); setStock('60')
  }

  const adherence = stats.data?.adherence

  return (
    <div className="space-y-4">
      <PageHeader
        view="medications"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" aria-hidden />{t('meds.addMedication')}</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('meds.addMedication')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label htmlFor="med-name">{t('meds.name')}</Label>
                <Input id="med-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lisinopril" className="mt-1.5" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="med-dose">{t('meds.dose')}</Label>
                  <Input id="med-dose" type="number" value={dose} onChange={(e) => setDose(e.target.value)} className="mt-1.5" /></div>
                <div><Label>{t('meds.form')}/{t('meds.dose')}</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['mg', 'µg', 'ml', 'IU', 'units'].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              </div>
              <div><Label htmlFor="med-purpose">{t('meds.purpose')}</Label>
                <Input id="med-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Blood pressure" className="mt-1.5" /></div>
              <div><Label>{t('meds.times')}</Label>
                <Select value={times} onValueChange={setTimes}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="08:00">Once daily · 08:00</SelectItem>
                    <SelectItem value="08:00+20:00">Twice daily · 08:00 & 20:00</SelectItem>
                    <SelectItem value="08:00+12:00+20:00">Three times daily</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label htmlFor="med-stock">{t('meds.inventory')} ({t('common.optional')})</Label>
                <Input id="med-stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="mt-1.5" placeholder="tablets in box" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={addMed} disabled={!name.trim() || create.isPending}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        }
      />

      {/* Adherence + interactions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Pill className="h-4 w-4" aria-hidden />{t('meds.adherence')}</CardTitle></CardHeader>
          <CardContent>
            {adherence ? (
              <>
                <div className="text-3xl font-bold tabular-nums">{adherence.pct}%</div>
                <Progress value={adherence.pct} className="mt-2 h-2" aria-label={`Adherence ${adherence.pct}%`} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {adherence.consecutiveTaken}-day perfect streak · {adherence.missedRecent.length} misses in 14d
                </p>
              </>
            ) : <Skeleton className="h-16" />}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />{t('meds.interactions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meds.data?.interactions.length ? (
              <div className="space-y-2">
                {meds.data.interactions.map((i, idx) => (
                  <div key={idx} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${i.level === 'warning' ? 'border-rose-200 bg-rose-50/60 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200' : 'border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
                    <b>{i.pair}</b> — {i.note}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No known interactions between your current medications. This check is educational — always confirm with your pharmacist.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's timeline */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('meds.schedule')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {stats.data?.schedule.map((d) => (
            <div key={`${d.medicationId}-${d.time}`} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="tabular-nums">{d.time}</Badge>
                <div>
                  <div className="text-sm font-medium">{d.medicationName} <span className="text-xs font-normal text-muted-foreground">{d.dose}</span></div>
                </div>
              </div>
              {d.status === 'pending' ? (
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-8 px-3" disabled={logMed.isPending} onClick={() => logDose(d.medicationId, d.medicationName, d.time, 'taken')}>Take</Button>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={logMed.isPending} onClick={() => logDose(d.medicationId, d.medicationName, d.time, 'delayed')}>Late</Button>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-xs text-rose-600" disabled={logMed.isPending} onClick={() => logDose(d.medicationId, d.medicationName, d.time, 'missed')}>Missed</Button>
                </div>
              ) : (
                <Badge variant="outline" className={d.status === 'taken' ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : d.status === 'missed' ? 'border-rose-300 text-rose-700 dark:text-rose-400' : ''}>{d.status}</Badge>
              )}
            </div>
          ))}
          {stats.data && stats.data.schedule.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Nothing scheduled — add a medication to build your routine.</p>
          )}
        </CardContent>
      </Card>

      {/* Med list */}
      <div className="grid gap-3 md:grid-cols-2">
        {meds.isLoading && <Skeleton className="h-28 md:col-span-2" />}
        {meds.data?.medications.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.doseValue} {m.doseUnit} · {m.scheduleTimes.join(' & ')}{m.purpose ? ` · ${m.purpose}` : ''}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Toggle active"
                    onClick={() => update.mutate({ id: m.id, active: !m.active })}>
                    {m.active ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete medication"
                    onClick={() => remove.mutate(m.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              {m.stock !== null && m.stock !== undefined && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-xs">{t('meds.dosesLeft', { n: m.stock })}</span>
                  {m.refill.urgent && (
                    <Badge variant="outline" className="ml-auto border-amber-300 text-[10px] text-amber-700 dark:text-amber-400">
                      Refill by {m.refill.refillBy}
                    </Badge>
                  )}
                </div>
              )}
              {m.instructions && <p className="mt-2 text-[11px] italic text-muted-foreground">{m.instructions}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
