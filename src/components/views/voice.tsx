'use client'

// OpenEir — Voice view. Speak a reading or a dose; Eir parses it locally,
// reads it back aloud, and waits for an explicit confirm. Firefox (no STT)
// and unsupported browsers degrade to the same parser via the text box —
// identical flow, zero second-class paths.

import { useState } from 'react'
import {
  Mic, Square, AudioLines, Loader2, Copy, Check,
  HeartPulse, Droplets, Pill, StickyNote, CircleHelp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useVoice, matchMedication } from '@/hooks/use-voice'
import { useMedications } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { VOICE_CONFIDENCE_THRESHOLD, type VoiceIntentFields } from '@/lib/voice/types'

const EXAMPLES = [
  'Blood pressure 120 over 80',
  'BP one twenty-two over eighty, pulse 71',
  'Glucose 6.4 fasting',
  'Blood sugar 105 after breakfast',
  'I took my metformin at 8',
  'I skipped my lisinopril this morning',
]

const KIND_ICON = {
  bp: HeartPulse, glucose: Droplets, med_taken: Pill, med_skipped: Pill, note: StickyNote, unknown: CircleHelp,
} as const

export function VoiceView() {
  const { t } = useT()
  const medsQ = useMedications()
  const { voiceAutoSpeak, voiceRate, setVoicePrefs } = useUI()
  const v = useVoice()
  const [typed, setTyped] = useState('')

  const meds = medsQ.data?.medications ?? []
  const matchedMed = v.intent && (v.intent.fields.kind === 'med_taken' || v.intent.fields.kind === 'med_skipped')
    ? matchMedication(v.intent.fields.nameHeard, meds)
    : undefined

  const parseTyped = () => {
    if (!typed.trim()) return
    v.reset()
    v.adopt(typed.trim())
    setTyped('')
  }

  const patchBp = (patch: Partial<Extract<VoiceIntentFields, { kind: 'bp' }>>) => {
    if (v.intent?.fields.kind === 'bp') v.setFields({ ...v.intent.fields, ...patch })
  }
  const patchGl = (patch: Partial<Extract<VoiceIntentFields, { kind: 'glucose' }>>) => {
    if (v.intent?.fields.kind === 'glucose') v.setFields({ ...v.intent.fields, ...patch })
  }
  const patchMed = (patch: Partial<Extract<VoiceIntentFields, { kind: 'med_taken' | 'med_skipped' }>>) => {
    if (v.intent?.fields.kind === 'med_taken' || v.intent?.fields.kind === 'med_skipped') v.setFields({ ...v.intent.fields, ...patch })
  }

  const sttNotice = !v.sttSupported
    ? t('voice.sttFirefox')
    : v.family === 'safari' ? t('voice.sttSafari') : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('voice.title')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('voice.subtitle')}</p>
      </div>

      {/* capability notice */}
      {(sttNotice || !v.ttsSupported) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {sttNotice}
          {!v.ttsSupported && <span className="block">{t('voice.ttsMissing')}</span>}
        </div>
      )}

      {/* mic stage */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="relative">
            {v.phase === 'listening' && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" aria-hidden />
                <span className="absolute inset-2 animate-ping rounded-full bg-primary/15 [animation-delay:300ms]" aria-hidden />
              </>
            )}
            <button
              type="button"
              onClick={() => (v.phase === 'listening' ? v.stop() : v.start())}
              disabled={!v.sttSupported || v.phase === 'parsed' || v.phase === 'saving'}
              className={`relative flex h-28 w-28 items-center justify-center rounded-full shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 ${
                v.phase === 'listening' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground hover:scale-[1.03]'
              }`}
              aria-label={v.phase === 'listening' ? t('voice.stop') : t('voice.tapToSpeak')}
            >
              {v.phase === 'listening'
                ? <Square className="h-9 w-9" aria-hidden />
                : v.phase === 'saving'
                  ? <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
                  : <Mic className="h-12 w-12" aria-hidden />}
            </button>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {v.phase === 'listening' ? t('voice.listening') : v.phase === 'saving' ? t('common.saving') : t('voice.tapToSpeak')}
          </p>
          {(v.interim || v.finalText) && (
            <div className="w-full max-w-md rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('voice.heard')}</span>
              <p className="mt-0.5">
                <span>{v.finalText}</span>
                {v.interim && <span className="italic text-muted-foreground"> {v.interim}…</span>}
              </p>
            </div>
          )}
          {v.error && (
            <div className="w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{v.error}</div>
          )}
        </CardContent>
      </Card>

      {/* confirm card */}
      {v.intent && v.phase !== 'listening' && (
        <Card className={v.intent.needsConfirm || v.intent.confidence < VOICE_CONFIDENCE_THRESHOLD ? 'border-amber-300 dark:border-amber-800' : 'border-teal-300 dark:border-teal-800'}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                {(() => { const I = KIND_ICON[v.intent!.kind]; return <I className="h-4.5 w-4.5 text-primary" aria-hidden /> })()}
                {t('voice.readbackTitle')}
              </span>
              <Badge variant={v.intent.confidence >= VOICE_CONFIDENCE_THRESHOLD ? 'secondary' : 'destructive'}>
                {v.intent.confidence >= VOICE_CONFIDENCE_THRESHOLD ? t('voice.confOk') : `${t('voice.confLow')} · ${Math.round(v.intent.confidence * 100)}%`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* --- editable fields per kind --- */}
            {v.intent.fields.kind === 'bp' && (
              <div className="grid gap-3 sm:grid-cols-4">
                <div><Label htmlFor="v-sys">{t('record.systolic')}</Label><Input id="v-sys" type="number" inputMode="numeric" value={v.intent.fields.systolic} onChange={(e) => patchBp({ systolic: Number(e.target.value) })} className="mt-1 h-11 text-center font-semibold" /></div>
                <div><Label htmlFor="v-dia">{t('record.diastolic')}</Label><Input id="v-dia" type="number" inputMode="numeric" value={v.intent.fields.diastolic} onChange={(e) => patchBp({ diastolic: Number(e.target.value) })} className="mt-1 h-11 text-center font-semibold" /></div>
                <div><Label htmlFor="v-pulse">{t('record.pulse')}</Label><Input id="v-pulse" type="number" inputMode="numeric" value={v.intent.fields.pulse ?? ''} onChange={(e) => patchBp({ pulse: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 h-11 text-center font-semibold" /></div>
                <div>
                  <Label htmlFor="v-bplabel">{t('record.label')}</Label>
                  <Select value={v.intent.fields.label} onValueChange={(x) => patchBp({ label: x as 'morning' })}>
                    <SelectTrigger id="v-bplabel" className="mt-1 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">{t('record.morning')}</SelectItem>
                      <SelectItem value="evening">{t('record.evening')}</SelectItem>
                      <SelectItem value="pre_med">{t('record.preMed')}</SelectItem>
                      <SelectItem value="post_med">{t('record.postMed')}</SelectItem>
                      <SelectItem value="general">{t('record.general')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {v.intent.fields.kind === 'glucose' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="v-gl">{t('record.value')}</Label>
                  <Input id="v-gl" type="number" step="0.1" inputMode="decimal" value={v.intent.fields.value} onChange={(e) => patchGl({ value: Number(e.target.value) })} className="mt-1 h-11 text-center font-semibold" />
                  <p className="mt-1 text-[11px] text-muted-foreground">mmol/L · heard {v.intent.fields.heardUnit === 'mg/dL' ? `${Math.round(v.intent.fields.value * 18)} mg/dL` : `${v.intent.fields.value} mmol/L`}</p>
                </div>
                <div>
                  <Label htmlFor="v-glctx">{t('record.context')}</Label>
                  <Select value={v.intent.fields.context} onValueChange={(x) => patchGl({ context: x as 'fasting' })}>
                    <SelectTrigger id="v-glctx" className="mt-1 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fasting">{t('record.fasting')}</SelectItem>
                      <SelectItem value="pre_meal">{t('record.preMeal')}</SelectItem>
                      <SelectItem value="post_meal">{t('record.postMeal')}</SelectItem>
                      <SelectItem value="bedtime">{t('record.bedtime')}</SelectItem>
                      <SelectItem value="random">{t('record.random')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {(v.intent.fields.kind === 'med_taken' || v.intent.fields.kind === 'med_skipped') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t('meds.name')}</Label>
                  <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm font-medium">
                    {matchedMed ? matchedMed.name : v.intent.fields.nameHeard}
                  </div>
                  {matchedMed ? (
                    <Badge variant="outline" className="mt-1.5">{t('voice.medMatched', { name: matchedMed.name })}</Badge>
                  ) : (
                    <Badge variant="destructive" className="mt-1.5">{t('voice.medUnmatched', { name: v.intent.fields.nameHeard })}</Badge>
                  )}
                </div>
                <div>
                  <Label htmlFor="v-medtime">{t('voice.timeLabel')}</Label>
                  <Input id="v-medtime" type="time" value={v.intent.fields.time ?? new Date().toTimeString().slice(0, 5)} onChange={(e) => patchMed({ time: e.target.value })} className="mt-1 h-11" />
                  <div className="mt-2 flex gap-1.5">
                    {(['med_taken', 'med_skipped'] as const).map((k) => (
                      <Button key={k} size="sm" variant={v.intent!.fields.kind === k ? 'default' : 'outline'} className="h-8 px-3 text-xs" onClick={() => patchMed({ kind: k })}>
                        {k === 'med_taken' ? t('dashboard.takeDose') : t('dashboard.skipDose')}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {v.intent.fields.kind === 'note' && (
              <div>
                <Label htmlFor="v-note">{t('voice.noteTitle')}</Label>
                <Textarea id="v-note" value={v.intent.fields.text} onChange={(e) => v.setFields({ kind: 'note', text: e.target.value })} className="mt-1 min-h-[72px]" />
                <p className="mt-1 text-[11px] text-muted-foreground">{t('voice.noteHint')}</p>
              </div>
            )}

            {v.intent.fields.kind === 'unknown' && (
              <p className="text-sm text-muted-foreground">{v.intent.notes.join(' ')}</p>
            )}

            {/* parser notes */}
            {v.intent.notes.length > 0 && v.intent.fields.kind !== 'unknown' && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {v.intent.notes.slice(0, 3).map((n, i) => <li key={i}>· {n}</li>)}
              </ul>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => void v.confirm()}
                disabled={v.phase === 'saving' || v.intent.fields.kind === 'unknown' || ((v.intent.fields.kind === 'med_taken' || v.intent.fields.kind === 'med_skipped') && !matchedMed)}
                className="min-h-[46px] flex-1 gap-1.5"
                size="lg"
              >
                {v.phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {v.intent.fields.kind === 'note' ? t('voice.copyNote') : t('voice.confirm')}
              </Button>
              <Button variant="outline" onClick={v.reset} className="min-h-[46px]" size="lg">{t('voice.discard')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* typed fallback + examples */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><AudioLines className="h-4.5 w-4.5 text-primary" aria-hidden />{t('voice.typedTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') parseTyped() }}
              placeholder={t('voice.typedPlaceholder')}
              aria-label={t('voice.typedTitle')}
              className="h-11"
            />
            <Button variant="outline" onClick={parseTyped} disabled={!typed.trim()} className="h-11 shrink-0">{t('voice.parseTyped')}</Button>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('voice.examplesTitle')}</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex} type="button"
                  onClick={() => { v.reset(); v.adopt(ex) }}
                  className="min-h-[36px] rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  “{ex}”
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* voice settings */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('voice.settingsTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="v-autospeak" className="text-sm">{t('voice.autoSpeak')}</Label>
            <Switch id="v-autospeak" checked={voiceAutoSpeak} onCheckedChange={(c) => setVoicePrefs({ voiceAutoSpeak: c })} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t('voice.rate')}</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{voiceRate.toFixed(1)}×</span>
            </div>
            <Slider value={[voiceRate]} min={0.6} max={1.6} step={0.1} onValueChange={(x) => setVoicePrefs({ voiceRate: x[0] })} className="mt-2 max-w-xs" aria-label={t('voice.rate')} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('voice.privacyNote')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
