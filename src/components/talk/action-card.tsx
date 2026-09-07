'use client'

// OpenEir — in-chat action card. When the deterministic parser detects a
// loggable health intent inside a chat message, the UI gates the save behind
// this card (same philosophy as voice readbacks and OCR scans: never
// auto-log). Confirm posts to the same endpoints the rest of the app uses.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { HeartPulse, Droplets, Pill, Check, X, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

export interface ChatAction {
  kind: 'bp' | 'glucose' | 'med'
  confidence: number
  readback: string
  systolic?: number
  diastolic?: number
  pulse?: number | null
  label?: string
  takenAt?: string
  value?: number
  context?: string
  heardUnit?: string
  medicationId?: string
  medName?: string
  medStatus?: 'taken' | 'skipped'
  scheduledTime?: string
  doseText?: string
}

type CardState = 'pending' | 'saving' | 'saved' | 'discarded'

export function ActionCard({ action, id }: { action: ChatAction; id: string }) {
  const { t } = useT()
  const [cardState, setCardState] = useState<CardState>('pending')

  const confirm = async () => {
    setCardState('saving')
    try {
      if (action.kind === 'bp') {
        const res = await fetch('/api/readings/bp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systolic: action.systolic,
            diastolic: action.diastolic,
            pulse: action.pulse ?? null,
            label: action.label ?? 'general',
            ...(action.takenAt ? { takenAt: action.takenAt } : {}),
            source: 'chat',
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } else if (action.kind === 'glucose') {
        const res = await fetch('/api/readings/glucose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: action.value,
            context: action.context ?? 'random',
            ...(action.takenAt ? { takenAt: action.takenAt } : {}),
            source: 'chat',
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } else if (action.kind === 'med' && action.medicationId) {
        const now = new Date()
        const res = await fetch('/api/medications/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            medicationId: action.medicationId,
            date: now.toISOString().slice(0, 10),
            scheduledTime: action.scheduledTime ?? '08:00',
            status: action.medStatus ?? 'taken',
            actualTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
      }
      setCardState('saved')
      toast(t('talk.cardSaved'))
    } catch {
      setCardState('pending')
      toast.error(t('talk.cardFailed'))
    }
  }

  const icon =
    action.kind === 'bp' ? <HeartPulse className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />
    : action.kind === 'glucose' ? <Droplets className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />
    : <Pill className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      data-action-id={id}
      className={`mt-2 w-full rounded-2xl border bg-card/90 p-3 shadow-sm backdrop-blur ${
        cardState === 'saved' || cardState === 'discarded' ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 ring-1 ring-teal-500/20" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {action.kind === 'bp' && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-bold tabular-nums tracking-tight">
                {action.systolic}<span className="text-muted-foreground">/</span>{action.diastolic}
              </span>
              <span className="text-xs font-medium text-muted-foreground">mmHg</span>
              {action.pulse ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">{action.pulse} bpm</span>
              ) : null}
              {action.label && action.label !== 'general' ? (
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-teal-700 dark:text-teal-300">{action.label}</span>
              ) : null}
            </div>
          )}
          {action.kind === 'glucose' && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-bold tabular-nums tracking-tight">{action.value}</span>
              <span className="text-xs font-medium text-muted-foreground">mmol/L{action.heardUnit === 'mg/dL' ? ` (from mg/dL)` : ''}</span>
              {action.context && action.context !== 'random' ? (
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-teal-700 dark:text-teal-300">{action.context.replace('_', ' ')}</span>
              ) : null}
            </div>
          )}
          {action.kind === 'med' && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-base font-bold tracking-tight">{action.medName}</span>
              <span className="text-xs font-medium text-muted-foreground">{action.doseText}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${action.medStatus === 'skipped' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300'}`}>
                {action.medStatus === 'skipped' ? 'skipped' : 'taken'} · {action.scheduledTime}
              </span>
            </div>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={action.readback}>{action.readback}</p>

          {cardState === 'pending' && (
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" className="h-8 rounded-full px-4" onClick={() => void confirm()}>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('talk.confirmSave')}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-muted-foreground" onClick={() => setCardState('discarded')}>
                <X className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('talk.discard')}
              </Button>
              {action.confidence < 0.75 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <Info className="h-3 w-3" aria-hidden /> {t('talk.lowConfidence')}
                </span>
              )}
            </div>
          )}
          {cardState === 'saving' && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t('talk.saving')}
            </div>
          )}
          {cardState === 'saved' && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-300">
              <Check className="h-3.5 w-3.5" aria-hidden /> {t('talk.cardSaved')}
            </div>
          )}
          {cardState === 'discarded' && (
            <div className="mt-2.5 text-xs text-muted-foreground">{t('talk.discarded')}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
