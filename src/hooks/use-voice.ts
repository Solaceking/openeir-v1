// OpenEir — voice capture state machine:
//   idle -> listening (STT or typed) -> parsed (readback card) -> saving -> idle
// Reuses the existing reading/medication mutations so offline queueing,
// duplicate detection and inventory decrementing apply to voice for free.
// Safety invariant: EVERY voice capture (especially meds) passes the
// readback + explicit confirm gate. There is no auto-save path.

'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { useUI } from '@/lib/store'
import { usePostReading, useLogMedication, useMedications } from '@/lib/api-client'
import { parseVoiceCommand } from '@/lib/voice/parser'
import { readbackFor, type VoiceIntent, type VoiceIntentFields } from '@/lib/voice/types'
import { speechRecognitionSupported, sttBrowserFamily, startDictation } from '@/lib/voice/stt'
import { speak, stopSpeaking, ttsAvailable } from '@/lib/voice/tts'
import { toast } from 'sonner'

export type VoicePhase = 'idle' | 'listening' | 'parsed' | 'saving'

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Normalize a heard med name and a stored med name for fuzzy matching. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export interface MedLikeRow { id: string; name: string; scheduleTimes: string[] }

/** Fuzzy-match a heard medication name against the user's list (either direction, or first-token). */
export function matchMedication<M extends MedLikeRow>(heardName: string, meds: M[]): M | undefined {
  const heard = norm(heardName)
  if (!heard) return undefined
  return meds.find((m) => {
    const name = norm(m.name)
    return name === heard || name.includes(heard) || heard.includes(name) || name.split(' ')[0] === heard.split(' ')[0]
  })
}

/** Snap a heard time to the med's nearest scheduled slot (±90 min) for honest adherence stats. */
function snapToSchedule(heard: string | undefined, slots: string[]): { time: string; snapped: boolean } {
  const now = new Date()
  const t = heard ?? `${pad(now.getHours())}:${pad(now.getMinutes())}`
  if (slots.length === 0) return { time: t, snapped: false }
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  const heardMin = toMin(t)
  let best = slots[0]
  let bestDiff = Math.abs(toMin(slots[0]) - heardMin)
  for (const s of slots.slice(1)) {
    const d = Math.abs(toMin(s) - heardMin)
    if (d < bestDiff) { best = s; bestDiff = d }
  }
  if (bestDiff <= 90) return { time: best, snapped: best !== t }
  return { time: t, snapped: false }
}

export function useVoice() {
  const { t, lang } = useT()
  const { voiceAutoSpeak, voiceRate } = useUI()
  const voiceEngine = useUI((s) => s.voiceEngine)
  const post = usePostReading()
  const logMed = useLogMedication()
  const medsQ = useMedications()

  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [interim, setInterim] = useState('')
  const [finalText, setFinalText] = useState('')
  const [intent, setIntent] = useState<VoiceIntent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  const sttSupported = useMemo(() => speechRecognitionSupported(), [])
  // Neural engine speaks server-side — even Firefox gets voice-outs now.
  const ttsSupported = useMemo(() => ttsAvailable(voiceEngine), [voiceEngine])
  const family = useMemo(() => sttBrowserFamily(), [])

  const reset = useCallback(() => {
    stopSpeaking()
    setPhase('idle')
    setInterim('')
    setFinalText('')
    setIntent(null)
    setError(null)
  }, [])

  /** Parse text (typed or final transcript) into a confirmable intent. */
  const adopt = useCallback((text: string) => {
    const parsed = parseVoiceCommand(text)
    setIntent(parsed)
    setFinalText(text)
    setInterim('')
    setPhase('parsed')
    if (voiceAutoSpeak && ttsSupported && parsed.kind !== 'unknown') {
      speak(`${readbackFor(parsed)} ${t('voice.confirmPrompt')}`, { lang, rate: voiceRate })
    }
  }, [lang, t, ttsSupported, voiceAutoSpeak, voiceRate])

  const start = useCallback(() => {
    if (phase === 'listening') return
    stopSpeaking()
    setError(null)
    setIntent(null)
    setFinalText('')
    setInterim('')
    setPhase('listening')
    stopRef.current = startDictation(
      {
        onPartial: (i, f) => { setInterim(i); if (f) setFinalText(f) },
        onFinal: (text) => adopt(text),
        onError: (code, message) => { setError(message); if (code !== 'aborted') setPhase('idle') },
        onEnd: () => { stopRef.current = null },
      },
      lang,
    )
  }, [adopt, lang, phase])

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
  }, [])

  /** The confirm card edits fields inline before saving. */
  const setFields = useCallback((fields: VoiceIntentFields) => {
    setIntent((prev) => (prev ? { ...prev, fields } : prev))
  }, [])

  const confirm = useCallback(async () => {
    if (!intent) return
    const f = intent.fields
    setPhase('saving')
    try {
      if (f.kind === 'bp') {
        const res = await post.mutateAsync({
          kind: 'bp',
          payload: { systolic: f.systolic, diastolic: f.diastolic, pulse: f.pulse ?? null, label: f.label, takenAt: f.takenAt, source: 'voice' },
        })
        if (!res.queued && res.data && typeof res.data === 'object' && 'duplicate' in res.data) {
          setPhase('parsed')
          toast.message(t('record.scanAlreadyLogged', { source: 'before' }), {
            action: {
              label: t('record.logAnyway'),
              onClick: () => void post.mutateAsync({
                kind: 'bp',
                payload: { systolic: f.systolic, diastolic: f.diastolic, pulse: f.pulse ?? null, label: f.label, takenAt: f.takenAt, source: 'voice', force: true },
              }),
            },
          })
          return
        }
      } else if (f.kind === 'glucose') {
        const res = await post.mutateAsync({
          kind: 'glucose',
          payload: { value: f.value, context: f.context, takenAt: f.takenAt, source: 'voice' },
        })
        if (!res.queued && res.data && typeof res.data === 'object' && 'duplicate' in res.data) {
          setPhase('parsed')
          toast.message(t('record.scanAlreadyLogged', { source: 'before' }), {
            action: {
              label: t('record.logAnyway'),
              onClick: () => void post.mutateAsync({
                kind: 'glucose',
                payload: { value: f.value, context: f.context, takenAt: f.takenAt, source: 'voice', force: true },
              }),
            },
          })
          return
        }
      } else if (f.kind === 'med_taken' || f.kind === 'med_skipped') {
        const meds = medsQ.data?.medications ?? []
        const med = matchMedication(f.nameHeard, meds)
        if (!med) {
          setPhase('parsed')
          setError(t('voice.medNotFound'))
          return
        }
        const slots = Array.isArray(med.scheduleTimes) ? med.scheduleTimes : []
        const { time, snapped } = snapToSchedule(f.time ?? undefined, slots)
        logMed.mutate({
          medicationId: med.id,
          date: todayIso(),
          scheduledTime: time,
          status: f.kind === 'med_taken' ? 'taken' : 'skipped',
          actualTime: f.kind === 'med_taken' ? (f.time ?? new Date().toTimeString().slice(0, 5)) : null,
          note: snapped ? `Logged by voice (“${f.nameHeard}”) — snapped to ${time} schedule` : `Logged by voice (“${f.nameHeard}”)`,
          medName: med.name,
        })
      } else if (f.kind === 'note') {
        try {
          await navigator.clipboard.writeText(f.text)
          toast.success(t('voice.noteCopied'))
        } catch {
          toast.message(t('voice.noteCopied'))
        }
        reset()
        return
      }
      if (voiceAutoSpeak && ttsSupported) speak(t('voice.savedSpoken'), { lang, rate: voiceRate })
      reset()
    } catch (e) {
      setPhase('parsed')
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }, [intent, lang, logMed, medsQ.data, post, reset, t, ttsSupported, voiceAutoSpeak, voiceRate])

  return {
    // state
    phase, interim, finalText, intent, error,
    // capabilities
    sttSupported, ttsSupported, family,
    // actions
    start, stop, reset, adopt, setFields, confirm,
    // derived
    readback: intent ? readbackFor(intent) : null,
  }
}
