'use client'

import { useEffect, useRef, useState } from 'react'
import { Bluetooth, Loader2, Minus, Plus, HeartPulse, Droplets, Flame, Pill, Camera, ScanLine, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStats, usePostReading, useUpsertLifestyle, useLogMedication } from '@/lib/api-client'
import { categorizeBp, BP_CATEGORIES, KNOWN_TAGS } from '@/lib/health/bp'
import { GLUCOSE_CONTEXTS, categorizeGlucose, GLUCOSE_CATEGORIES } from '@/lib/health/glucose'
import { bluetoothSupported, syncBloodPressureMonitor, syncGlucometer, type BpMeasurement } from '@/lib/bluetooth'
import { SCAN_CONFIDENCE_THRESHOLD, type ScanResult } from '@/lib/ocr/types'
import { useT } from '@/lib/i18n'

function Stepper({ id, label, value, onChange, min, max, unit }: {
  id: string; label: string; value: number | null; onChange: (v: number | null) => void
  min: number; max: number; unit?: string
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}{unit ? ` (${unit})` : ''}</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl" aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, (value ?? 0) - 1))}>
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
        <Input
          id={id} type="number" inputMode="numeric" min={min} max={max}
          value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="h-12 rounded-xl text-center text-xl font-semibold tabular-nums"
        />
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl" aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, (value ?? 0) + 1))}>
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function TagPicker({ tags, setTags }: { tags: string[]; setTags: (t: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KNOWN_TAGS.map((tag) => {
        const active = tags.includes(tag)
        return (
          <button
            key={tag} type="button"
            onClick={() => setTags(active ? tags.filter((x) => x !== tag) : [...tags, tag])}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
            aria-pressed={active}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}

export function RecordView() {
  const { t } = useT()
  const stats = useStats()
  const post = usePostReading()
  const upsertLife = useUpsertLifestyle()
  const logMed = useLogMedication()

  // BP state
  const [sys, setSys] = useState<number | null>(null)
  const [dia, setDia] = useState<number | null>(null)
  const [pulse, setPulse] = useState<number | null>(null)
  const [bpLabel, setBpLabel] = useState('morning')
  const [bpTags, setBpTags] = useState<string[]>([])
  const [bpNotes, setBpNotes] = useState('')

  // Glucose state
  const [glVal, setGlVal] = useState<number | null>(null)
  const [glCtx, setGlCtx] = useState('fasting')
  const [carbs, setCarbs] = useState<number | null>(null)
  const [glNotes, setGlNotes] = useState('')

  // Lifestyle state
  const [mood, setMood] = useState(3)
  const [energy, setEnergy] = useState(3)
  const [sleep, setSleep] = useState(3)
  const [stress, setStress] = useState(3)
  const [weight, setWeight] = useState<number | null>(null)
  const [sodiumHigh, setSodiumHigh] = useState(false)

  // device
  const [deviceBusy, setDeviceBusy] = useState(false)
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null)

  // scan (photo -> structured reading, always human-confirmed)
  const [tab, setTab] = useState('bp')
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanApplied, setScanApplied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const todayIso = new Date().toISOString().slice(0, 10)

  const bpPreview = sys && dia ? categorizeBp(sys, dia) : null
  const glPreview = glVal && stats.data
    ? categorizeGlucose(glVal, glCtx as 'fasting', { min: stats.data.profile.glucoseMin, max: stats.data.profile.glucoseMax })
    : null

  const saveBp = async () => {
    if (!sys || !dia) return
    const res = await post.mutateAsync({ kind: 'bp', payload: { systolic: sys, diastolic: dia, pulse, label: bpLabel, tags: bpTags, notes: bpNotes || null, source: scanApplied ? 'ocr' : 'manual' } })
    if (!res.queued && res.data && typeof res.data === 'object' && 'duplicate' in res.data) {
      const existing = (res.data as { existing?: { source?: string } }).existing
      toast.message(t('record.scanAlreadyLogged', { source: existing?.source ?? 'before' }), {
        action: { label: t('record.logAnyway'), onClick: () => void post.mutateAsync({ kind: 'bp', payload: { systolic: sys, diastolic: dia, pulse, label: bpLabel, tags: bpTags, notes: bpNotes || null, source: scanApplied ? 'ocr' : 'manual', force: true } }) },
      })
      return
    }
    setSys(null); setDia(null); setPulse(null); setBpTags([]); setBpNotes('')
    setScanApplied(false)
  }

  const saveGlucose = async () => {
    if (!glVal) return
    const res = await post.mutateAsync({ kind: 'glucose', payload: { value: glVal, context: glCtx, carbs, notes: glNotes || null, source: scanApplied ? 'ocr' : 'manual' } })
    if (!res.queued && res.data && typeof res.data === 'object' && 'duplicate' in res.data) {
      const existing = (res.data as { existing?: { source?: string } }).existing
      toast.message(t('record.scanAlreadyLogged', { source: existing?.source ?? 'before' }), {
        action: { label: t('record.logAnyway'), onClick: () => void post.mutateAsync({ kind: 'glucose', payload: { value: glVal, context: glCtx, carbs, notes: glNotes || null, source: scanApplied ? 'ocr' : 'manual', force: true } }) },
      })
      return
    }
    setGlVal(null); setCarbs(null); setGlNotes('')
    setScanApplied(false)
  }

  const saveLifestyle = async () => {
    await upsertLife.mutateAsync({ date: todayIso, mood, energy, sleepQuality: sleep, stress, weightKg: weight, sodiumHigh })
  }

  // ---- scan pipeline (photo -> /api/ocr/scan -> human confirmation) ----
  const pickFile = (f: File) => {
    if (!f.type.startsWith('image/')) { toast.error('Not an image file'); return }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image too large (max 8 MB)'); return }
    setScanPreview(URL.createObjectURL(f))
    setScanResult(null)
  }

  const runScan = async () => {
    if (!scanPreview) return
    setScanBusy(true); setScanResult(null)
    try {
      const blob = await (await fetch(scanPreview)).blob()
      const fd = new FormData()
      fd.append('image', blob, 'scan.jpg')
      const res = await fetch('/api/ocr/scan', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Scan failed (${res.status})`)
      const data = (await res.json()) as ScanResult
      setScanResult(data)
      if (data.fields.kind === 'bp') toast.success(`BP ${data.fields.systolic}/${data.fields.diastolic} — ${t('record.useValues')}?`)
      else if (data.fields.kind === 'glucose') toast.success(`${data.fields.value} ${data.fields.unit} — ${t('record.useValues')}?`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanBusy(false)
    }
  }

  const applyScan = () => {
    const r = scanResult
    if (!r) return
    if (r.fields.kind === 'bp') {
      setSys(r.fields.systolic); setDia(r.fields.diastolic); setPulse(r.fields.pulse ?? null)
      setScanApplied(true); setTab('bp')
    } else if (r.fields.kind === 'glucose') {
      const v = r.fields.unit === 'mg/dL' ? Math.round((r.fields.value / 18) * 10) / 10 : r.fields.value
      if (v < 1 || v > 40) { toast.error('Value out of range (mmol/L 1–40)'); return }
      setGlVal(v)
      setScanApplied(true); setTab('glucose')
    }
  }

  // paste-to-scan on desktop
  useEffect(() => {
    if (tab !== 'scan') return
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'))
      if (f) pickFile(f)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [tab])

  const connectDevice = async (kind: 'bp' | 'glucose') => {
    if (!bluetoothSupported()) {
      setDeviceMsg(t('record.deviceUnsupported'))
      return
    }
    setDeviceBusy(true)
    setDeviceMsg(null)
    try {
      if (kind === 'bp') {
        await syncBloodPressureMonitor((m: BpMeasurement) => {
          setSys(m.systolic); setDia(m.diastolic); setPulse(m.pulse ?? null)
          setDeviceMsg(`Received ${m.systolic}/${m.diastolic}${m.pulse ? ` · ${m.pulse} bpm` : ''} — review and save.`)
        })
      } else {
        await syncGlucometer((m) => {
          const mmol = Math.round(m.kgPerL * 100000) / 100000 // kg/L → g/L/dL ≈ simplified
          const mmolL = Math.round((m.kgPerL / 0.18) * 100) / 100
          void mmol
          setGlVal(mmolL)
          setDeviceMsg(`Received ${mmolL} mmol/L — review and save.`)
        })
      }
    } catch (e) {
      setDeviceMsg(e instanceof Error ? e.message : 'Could not connect to device')
    } finally {
      setDeviceBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('record.title')}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap sm:w-auto">
          <TabsTrigger value="bp" className="gap-1.5 px-4"><HeartPulse className="h-4 w-4" aria-hidden />{t('record.bp')}</TabsTrigger>
          <TabsTrigger value="glucose" className="gap-1.5 px-4"><Droplets className="h-4 w-4" aria-hidden />{t('record.glucose')}</TabsTrigger>
          <TabsTrigger value="scan" className="gap-1.5 px-4"><ScanLine className="h-4 w-4" aria-hidden />{t('record.scan')}</TabsTrigger>
          <TabsTrigger value="lifestyle" className="gap-1.5 px-4"><Flame className="h-4 w-4" aria-hidden />{t('record.lifestyle')}</TabsTrigger>
          <TabsTrigger value="meds" className="gap-1.5 px-4"><Pill className="h-4 w-4" aria-hidden />{t('record.meds')}</TabsTrigger>
        </TabsList>

        {/* ---------------- BP ---------------- */}
        <TabsContent value="bp">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{t('record.bp')}</span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => connectDevice('bp')} disabled={deviceBusy}>
                  {deviceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Bluetooth className="h-3.5 w-3.5" aria-hidden />}
                  {deviceBusy ? t('record.scanning') : t('record.connectDevice')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deviceMsg && <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">{deviceMsg}</div>}
              <div className="grid gap-4 sm:grid-cols-3">
                <Stepper id="sys" label={t('record.systolic')} value={sys} onChange={setSys} min={60} max={260} unit="mmHg" />
                <Stepper id="dia" label={t('record.diastolic')} value={dia} onChange={setDia} min={30} max={180} unit="mmHg" />
                <Stepper id="pulse" label={t('record.pulse')} value={pulse} onChange={setPulse} min={25} max={250} unit="bpm" />
              </div>
              {bpPreview && sys && dia && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${BP_CATEGORIES[bpPreview].className}`}>
                  {BP_CATEGORIES[bpPreview].label} — {BP_CATEGORIES[bpPreview].advice}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t('record.label')}</Label>
                  <Select value={bpLabel} onValueChange={setBpLabel}>
                    <SelectTrigger className="mt-1.5 h-11" aria-label={t('record.label')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">{t('record.morning')}</SelectItem>
                      <SelectItem value="evening">{t('record.evening')}</SelectItem>
                      <SelectItem value="pre_med">{t('record.preMed')}</SelectItem>
                      <SelectItem value="post_med">{t('record.postMed')}</SelectItem>
                      <SelectItem value="general">{t('record.general')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bp-notes">{t('record.notes')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
                  <Input id="bp-notes" value={bpNotes} onChange={(e) => setBpNotes(e.target.value)} className="mt-1.5 h-11" placeholder="Felt relaxed, after a walk…" />
                </div>
              </div>
              <div>
                <Label>{t('record.tags')}</Label>
                <div className="mt-1.5"><TagPicker tags={bpTags} setTags={setBpTags} /></div>
              </div>
              <Button onClick={saveBp} disabled={!sys || !dia || post.isPending} size="lg" className="min-h-[48px] w-full text-base">
                {post.isPending ? t('common.saving') : t('record.saveReading')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Glucose ---------------- */}
        <TabsContent value="glucose">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{t('record.glucose')}</span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => connectDevice('glucose')} disabled={deviceBusy}>
                  {deviceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Bluetooth className="h-3.5 w-3.5" aria-hidden />}
                  {deviceBusy ? t('record.scanning') : t('record.connectDevice')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deviceMsg && <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">{deviceMsg}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Stepper id="gl-val" label={t('record.value')} value={glVal} onChange={setGlVal} min={1} max={40} />
                <div>
                  <Label>{t('record.context')}</Label>
                  <Select value={glCtx} onValueChange={setGlCtx}>
                    <SelectTrigger className="mt-1.5 h-12" aria-label={t('record.context')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GLUCOSE_CONTEXTS.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {glPreview && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${GLUCOSE_CATEGORIES[glPreview].className}`}>
                  {GLUCOSE_CATEGORIES[glPreview].label}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Stepper id="carbs" label={t('record.carbs')} value={carbs} onChange={setCarbs} min={0} max={500} unit="g" />
                <div>
                  <Label htmlFor="gl-notes">{t('record.notes')}</Label>
                  <Input id="gl-notes" value={glNotes} onChange={(e) => setGlNotes(e.target.value)} className="mt-1.5 h-12" placeholder="Pasta dinner…" />
                </div>
              </div>
              <Button onClick={saveGlucose} disabled={!glVal || post.isPending} size="lg" className="min-h-[48px] w-full text-base">
                {post.isPending ? t('common.saving') : t('record.saveReading')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Scan (photo -> structured reading) ---------------- */}
        <TabsContent value="scan">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t('record.scanTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">{t('record.scanHint')}</p>
              <input
                ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }}
              />
              {!scanPreview ? (
                <button
                  type="button" onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f) }}
                  className="flex min-h-[170px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 text-sm text-muted-foreground transition-colors hover:bg-accent"
                >
                  <Camera className="h-7 w-7" aria-hidden />
                  <span className="font-medium text-foreground">{t('record.choosePhoto')}</span>
                  <span className="text-[11px]">{t('record.pasteOrDrop')}</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <img src={scanPreview} alt="Scan preview" className="max-h-64 w-full rounded-xl border object-contain" />
                  <div className="flex gap-2">
                    <Button onClick={runScan} disabled={scanBusy} className="min-h-[44px] flex-1 gap-1.5">
                      {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ScanLine className="h-4 w-4" aria-hidden />}
                      {scanBusy ? t('record.scanningImage') : t('record.scanImage')}
                    </Button>
                    <Button variant="outline" className="min-h-[44px]"
                      onClick={() => { setScanPreview(null); setScanResult(null) }} aria-label="Discard image">
                      <RotateCcw className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}

              {scanResult && (
                <div className="space-y-2 rounded-xl border bg-card p-3">
                  {scanResult.kind === 'bp' && scanResult.fields.kind === 'bp' && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums">{scanResult.fields.systolic}/{scanResult.fields.diastolic}</span>
                      {scanResult.fields.pulse ? <span className="text-sm text-muted-foreground">· {scanResult.fields.pulse} bpm</span> : null}
                    </div>
                  )}
                  {scanResult.kind === 'glucose' && scanResult.fields.kind === 'glucose' && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums">{scanResult.fields.value}</span>
                      <span className="text-sm text-muted-foreground">{scanResult.fields.unit} → {Math.round((scanResult.fields.value / 18) * 10) / 10} mmol/L</span>
                    </div>
                  )}
                  {scanResult.kind === 'unknown' && (
                    <p className="text-sm text-muted-foreground">{t('record.scanUnknown')}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={scanResult.confidence >= 0.9 ? 'default' : scanResult.confidence >= SCAN_CONFIDENCE_THRESHOLD ? 'secondary' : 'destructive'}>
                      {t('record.confidence')} {Math.round(scanResult.confidence * 100)}%
                    </Badge>
                    {scanApplied && <Badge variant="outline">{t('record.scanFromPhoto')}</Badge>}
                    {scanResult.via.map((v) => <Badge key={v} variant="outline">{v}</Badge>)}
                  </div>
                  {scanResult.kind !== 'unknown' && (
                    <Button onClick={applyScan} className="min-h-[44px] w-full">{t('record.useValues')}</Button>
                  )}
                  {scanResult.notes.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {scanResult.notes.slice(0, 3).map((n, i) => <li key={i}>· {n}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Lifestyle ---------------- */}
        <TabsContent value="lifestyle">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t('record.lifestyle')} — {t('common.today')}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {([
                ['mood', t('record.mood'), mood, setMood],
                ['energy', t('record.energy'), energy, setEnergy],
                ['sleep', t('record.sleep'), sleep, setSleep],
                ['stress', t('record.stress'), stress, setStress],
              ] as const).map(([key, label, val, set]) => (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <span className="flex gap-1" aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`h-2.5 w-2.5 rounded-full ${n <= val ? 'bg-primary' : 'bg-muted'}`} />
                      ))}
                    </span>
                  </div>
                  <Slider value={[val]} min={1} max={5} step={1} onValueChange={(v) => set(v[0])} className="mt-2" aria-label={label} />
                  <div className="mt-0.5 text-[10px] text-muted-foreground">1 → 5</div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <Stepper id="weight" label={t('record.weight')} value={weight} onChange={setWeight} min={25} max={400} />
                <div className="flex items-center gap-3 pt-6">
                  <Switch id="sodium" checked={sodiumHigh} onCheckedChange={setSodiumHigh} aria-label={t('record.sodiumHigh')} />
                  <Label htmlFor="sodium">{t('record.sodiumHigh')}</Label>
                </div>
              </div>
              <Button onClick={saveLifestyle} disabled={upsertLife.isPending} size="lg" className="min-h-[48px] w-full text-base">
                {upsertLife.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Med quick log ---------------- */}
        <TabsContent value="meds">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t('meds.schedule')}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.data?.schedule.map((d) => (
                <div key={`${d.medicationId}-${d.time}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{d.medicationName} <span className="text-xs text-muted-foreground">{d.dose}</span></div>
                    <div className="text-[11px] text-muted-foreground">{d.time} · {d.status}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {['taken', 'delayed', 'missed', 'skipped'].map((st) => (
                      <Button
                        key={st} size="sm" variant={d.status === st ? 'default' : 'outline'}
                        className="h-9 min-h-[36px] px-3 text-xs capitalize" disabled={logMed.isPending || d.status === st}
                        onClick={() => logMed.mutate({ medicationId: d.medicationId, date: todayIso, scheduledTime: d.time, status: st, actualTime: st === 'taken' || st === 'delayed' ? new Date().toTimeString().slice(0, 5) : null, medName: d.medicationName })}
                      >
                        {st}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {stats.data && stats.data.schedule.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">No medications scheduled today.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
