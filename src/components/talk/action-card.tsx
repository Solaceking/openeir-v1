'use client'

// OpenEir — the generalized confirm-before-write card.
//
// TWO sources feed this card:
//   1. `pending` — a PendingAction row (new). The model OR the deterministic
//      parser proposed a write; the row id is the single source of truth.
//      Confirm/decline go through /api/chat/actions → optimistic-lock
//      execution → audit. Card state survives reloads (status is server-side)
//      and resolves idempotently even if the voice agent confirms it first.
//   2. `action` — the legacy ChatAction (old messages in history, no row id).
//      Kept working exactly as before: confirm posts straight to the same
//      logging endpoints the rest of the app uses.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { HeartPulse, Droplets, Pill, Check, X, Loader2, Info, Wrench, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { hapticSuccess, hapticError, hapticLight } from '@/lib/haptics'

// ---------- legacy inline action (old messages) ----------

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
  /** set when the detection was generalized into a PendingAction row */
  pendingId?: string
}

// ---------- server-backed pending action ----------

export interface PendingSnapshot {
  id: string
  tool: string
  kind: 'bp' | 'glucose' | 'med' | 'generic'
  readback: string
  risk: 'medium' | 'high'
  status: 'pending' | 'confirmed' | 'declined' | 'expired' | 'error'
  origin: string
  args: Record<string, unknown>
  confirmationPhrase?: string
}

type CardState = 'pending' | 'saving' | 'saved' | 'discarded'

export function ActionCard({ action, pending, id }: { action?: ChatAction; pending?: PendingSnapshot; id: string }) {
  const { t } = useT()
  const [cardState, setCardState] = useState<CardState>('pending')
  const [serverStatus, setServerStatus] = useState<PendingSnapshot['status'] | null>(pending?.status ?? null)
  const [phrase, setPhrase] = useState('')
  const phraseRef = useRef('')
  useEffect(() => {
    phraseRef.current = phrase
  }, [phrase])

  // Refresh server state on mount for pending rows — covers reloads and
  // concurrent confirmations from another device or a spoken "yes".
  useEffect(() => {
    if (!pending || pending.status !== 'pending') return
    let alive = true
    fetch(`/api/chat/actions?id=${encodeURIComponent(pending.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.action) return
        setServerStatus(j.action.status)
        if (j.action.status === 'confirmed') setCardState('saved')
        if (j.action.status === 'declined' || j.action.status === 'expired') setCardState('discarded')
      })
      .catch(() => {})
    return () => { alive = false }
  }, [pending])

  const confirm = async () => {
    setCardState('saving')
    try {
      if (pending) {
        const res = await fetch('/api/chat/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pending.id, decision: 'confirm', ...(pending.risk === 'high' ? { phrase: phraseRef.current.trim() } : {}) }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok) {
          if (j?.action?.status) setServerStatus(j.action.status)
          setCardState('pending')
          toast.error(j?.error ?? t('talk.cardFailed'))
          hapticError()
          return
        }
        setServerStatus('confirmed')
      } else if (action) {
        await legacyConfirm(action)
      } else {
        return
      }
      setCardState('saved')
      // Same confirmation language as manual writes: drawn-check toast + haptic.
      hapticSuccess()
      toast.success(t('talk.cardSaved'))
    } catch {
      setCardState('pending')
      toast.error(t('talk.cardFailed'))
    }
  }

  const decline = async () => {
    setCardState('discarded')
    hapticLight()
    if (pending) {
      await fetch('/api/chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pending.id, decision: 'decline' }),
      }).catch(() => {})
    }
  }

  // ---------- render data (from either source) ----------
  const a = pending ? pendingArgsView(pending) : action
  const kind = pending ? pending.kind : (action?.kind ?? 'generic')
  const confidence = action?.confidence ?? 1
  const readback = pending ? pending.readback : (action?.readback ?? '')
  const highRiskLocked = Boolean(pending?.risk === 'high') && cardState === 'pending'
  const phraseOk = !highRiskLocked || phrase.trim().toUpperCase() === (pending?.confirmationPhrase ?? 'CONFIRM')
  const resolvedElsewhere = serverStatus === 'confirmed' || serverStatus === 'declined' || serverStatus === 'expired'

  const icon =
    kind === 'bp' ? <HeartPulse className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />
    : kind === 'glucose' ? <Droplets className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />
    : kind === 'med' ? <Pill className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />
    : <Wrench className="h-4.5 w-4.5 text-teal-600 dark:text-teal-300" aria-hidden />

  const showButtons = cardState === 'pending' && !resolvedElsewhere

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      data-action-id={id}
      className={`mt-2 w-full rounded-2xl border bg-card/90 p-3 ${
        cardState === 'saved' || cardState === 'discarded' ? 'opacity-70' : ''
      } ${pending?.risk === 'high' && showButtons ? 'border-destructive/40' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 ring-1 ring-teal-500/20" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {kind === 'bp' && a && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-bold tabular-nums tracking-tight">
                {a.systolic}<span className="text-muted-foreground">/</span>{a.diastolic}
              </span>
              <span className="text-xs font-medium text-muted-foreground">mmHg</span>
              {a.pulse ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">{a.pulse} bpm</span>
              ) : null}
              {a.label && a.label !== 'general' ? (
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-teal-700 dark:text-teal-300">{a.label}</span>
              ) : null}
            </div>
          )}
          {kind === 'glucose' && a && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-bold tabular-nums tracking-tight">{a.value}</span>
              <span className="text-xs font-medium text-muted-foreground">mmol/L{a.heardUnit === 'mg/dL' ? ` (from mg/dL)` : ''}</span>
              {a.context && a.context !== 'random' ? (
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-teal-700 dark:text-teal-300">{a.context.replace('_', ' ')}</span>
              ) : null}
            </div>
          )}
          {kind === 'med' && a && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-base font-bold tracking-tight">{a.medName}</span>
              <span className="text-xs font-medium text-muted-foreground">{a.doseText}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.medStatus === 'skipped' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300'}`}>
                {a.medStatus === 'skipped' ? 'skipped' : 'taken'} · {a.scheduledTime}
              </span>
            </div>
          )}
          {kind === 'generic' && pending && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold tracking-tight">{pending.tool}</span>
              {pending.risk === 'high' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  <ShieldAlert className="h-3 w-3" aria-hidden /> {t('talk.highRisk')}
                </span>
              )}
            </div>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={readback}>{readback}</p>

          {highRiskLocked && showButtons && (
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={pending?.confirmationPhrase ?? 'CONFIRM'}
              aria-label={t('talk.typeToConfirm')}
              className="mt-2 w-full max-w-[220px] rounded-lg border border-destructive/40 bg-background px-2.5 py-1.5 text-xs uppercase tracking-widest outline-none focus:ring-2 focus:ring-destructive/30"
            />
          )}

          {showButtons && (
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" className="h-8 rounded-full px-4" disabled={!phraseOk} onClick={() => void confirm()}>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('talk.confirmSave')}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-muted-foreground" onClick={() => void decline()}>
                <X className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('talk.discard')}
              </Button>
              {!pending && confidence < 0.75 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <Info className="h-3 w-3" aria-hidden /> {t('talk.lowConfidence')}
                </span>
              )}
              {pending && pending.origin === 'realtime' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Info className="h-3 w-3" aria-hidden /> {t('talk.fromVoice')}
                </span>
              )}
            </div>
          )}
          {cardState === 'saving' && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t('talk.saving')}
            </div>
          )}
          {(cardState === 'saved' || (serverStatus === 'confirmed' && cardState !== 'discarded')) && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-300">
              <Check className="h-3.5 w-3.5" aria-hidden /> {t('talk.cardSaved')}
            </div>
          )}
          {(cardState === 'discarded' || serverStatus === 'declined' || serverStatus === 'expired') && (
            <div className="mt-2.5 text-xs text-muted-foreground">{t('talk.discarded')}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ---------- legacy execution path (messages without a PendingAction row) ----

async function legacyConfirm(action: ChatAction): Promise<void> {
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
}

/** Project a PendingSnapshot's args into the legacy view shape for rich cards. */
function pendingArgsView(p: PendingSnapshot): {
  systolic?: number; diastolic?: number; pulse?: number | null; label?: string
  value?: number; context?: string; heardUnit?: string
  medName?: string; medStatus?: string; scheduledTime?: string; doseText?: string
} {
  const args = p.args ?? {}
  if (p.kind === 'bp') {
    return {
      systolic: typeof args.systolic === 'number' ? args.systolic : undefined,
      diastolic: typeof args.diastolic === 'number' ? args.diastolic : undefined,
      pulse: typeof args.pulse === 'number' ? args.pulse : null,
      label: typeof args.label === 'string' ? args.label : undefined,
    }
  }
  if (p.kind === 'glucose') {
    return { value: typeof args.value === 'number' ? args.value : undefined, context: typeof args.context === 'string' ? args.context : undefined }
  }
  if (p.kind === 'med') {
    return {
      medName: typeof args.medName === 'string' ? args.medName : (typeof args.medication === 'string' ? args.medication : undefined),
      medStatus: typeof args.status === 'string' ? args.status : undefined,
      scheduledTime: typeof args.scheduledTime === 'string' ? args.scheduledTime : undefined,
    }
  }
  return {}
}
