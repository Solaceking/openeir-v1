'use client'

// OpenEir — live conversation client for the opt-in Pipecat voice agent.
//
// WebRTC straight from the browser into the voice container (via the
// /voice-agent/ rewrite): mic in, Eir's voice out, server-side VAD barge-in.
// While the session is open, pending write confirmations poll into this modal
// as the SAME ActionCard used in chat — the visual fallback for a spoken
// yes/no, and the only confirmation path for high-risk actions (which always
// need the typed phrase).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Loader2, MicOff, PhoneOff, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionCard, type PendingSnapshot } from '@/components/talk/action-card'
import { useT } from '@/lib/i18n'

type LiveState = 'idle' | 'connecting' | 'live' | 'error'

export function LiveAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [state, setState] = useState<LiveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingSnapshot[]>([])
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    pcRef.current?.close()
    pcRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setState('idle')
  }, [])

  const connect = useCallback(async () => {
    setState('connecting')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.ontrack = (ev) => {
        if (audioRef.current) {
          audioRef.current.srcObject = ev.streams[0]
          void audioRef.current.play().catch(() => { /* autoplay resumed by gesture */ })
        }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('live')
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError(t('talk.liveDropped'))
          setState('error')
          stop()
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const res = await fetch('/voice-agent/api/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.detail ?? `voice agent HTTP ${res.status}`)
      }
      const answer = await res.json()
      await pc.setRemoteDescription({ type: answer.type ?? 'answer', sdp: answer.sdp })
      // connectionState flips to 'live' via onconnectionstatechange
    } catch (e) {
      setError(e instanceof Error ? e.message : t('talk.liveError'))
      setState('error')
      stop()
    }
  }, [stop, t])

  // visual fallback: poll pending actions while the session is open —
  // the same audited cards, confirmed from the app if speech fails
  useEffect(() => {
    if (!open || state !== 'live') return
    let alive = true
    const poll = () => {
      fetch('/api/agent-governance?pending=1')
        .then((r) => r.json())
        .then((j) => { if (alive && j?.pending) setPending(j.pending) })
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 4000)
    return () => { alive = false; window.clearInterval(id) }
  }, [open, state])

  // mic + audio are ALWAYS released when the modal closes
  useEffect(() => {
    if (!open) stop()
    return () => stop()
  }, [open, stop])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={t('talk.live')}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
      <div className="relative m-0 w-full max-w-md space-y-3 rounded-t-3xl border bg-card p-5 shadow-xl sm:m-4 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AudioLines className="h-4 w-4 text-primary" aria-hidden /> {t('talk.live')}
          </h2>
          <button onClick={onClose} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent">
            {t('common.close')}
          </button>
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />

        {state === 'idle' && (
          <div className="space-y-3 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">{t('talk.liveIntro')}</p>
            <Button className="rounded-full px-6" onClick={() => void connect()}>
              <AudioLines className="mr-1.5 h-4 w-4" aria-hidden /> {t('talk.liveStart')}
            </Button>
          </div>
        )}

        {state === 'connecting' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('talk.liveConnecting')}
          </div>
        )}

        {state === 'live' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-teal-500/25 bg-teal-500/5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
                <AudioLines className="eir-breathe h-4 w-4" aria-hidden /> {t('talk.liveListening')}
              </span>
              <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={stop}>
                <PhoneOff className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('talk.liveEnd')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('talk.liveBargeHint')}</p>
            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600" aria-hidden /> {t('agent.pendingHeading')}
                </p>
                {pending.map((p) => (
                  <ActionCard key={p.id} pending={p} id={`live:${p.id}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-3 text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-destructive">
              <MicOff className="h-4 w-4" aria-hidden /> {error ?? t('talk.liveError')}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('settings.liveServiceMissing')}</p>
            <Button variant="outline" size="sm" onClick={() => { setState('idle'); setError(null) }}>
              {t('talk.retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
