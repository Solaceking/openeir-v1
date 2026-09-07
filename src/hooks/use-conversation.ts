'use client'

// OpenEir — the hands-free conversation loop.
//
// A small state machine that makes "talking to Eir" feel like talking to a
// person:
//
//   off → listening → thinking → speaking → listening → …
//                        ↑____________barge-in____________↓
//
// - Continuous speech recognition (Web Speech) with self-restarting sessions.
// - While Eir SPEAKS, the microphone stays open: sustained voice energy above
//   a gate (with echo decay + browser AEC) interrupts her mid-sentence —
//   stopSpeaking + abort of any in-flight work — then your words are processed.
// - Replies are spoken sentence-by-sentence through the NEURAL engine, with
//   the next sentence's synthesis prefetched while the current one plays.
// - The orb reacts to real signals: mic RMS while you speak, the amplitude of
//   Eir's own audio element while she speaks.
//
// Browsers without SpeechRecognition (Firefox) still get the full speaking
// side — the composer carries the input; the overlay explains the limitation.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  speak, stopSpeaking, warmSpeak, onNeuralAudio,
} from '@/lib/voice/tts'
import { speechRecognitionSupported } from '@/lib/voice/stt'
import type { OrbState } from '@/lib/voice/orb-engine'

export type ConversationState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  detected?: unknown
  provider?: { label: string; model?: string | null; latencyMs: number }
}

const BARGE_RMS = 0.055            // sustained mic energy that counts as an interruption
const BARGE_FRAMES = 14            // ~230ms of sustained voice at 60fps
const BARGE_COOLDOWN_MS = 900      // ignore the gate briefly after each interrupt (echo decay)
const MIC_FLOOR = 0.012            // noise floor — below this the orb rests

function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9"'(])/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.length <= 600) { out.push(p); continue }
    // extremely long run-on: break at commas to stay inside the TTS limit
    let cur = ''
    for (const piece of p.split(/,\s*/)) {
      if ((cur + ', ' + piece).length > 500 && cur) { out.push(cur.trim()); cur = piece }
      else cur = cur ? `${cur}, ${piece}` : piece
    }
    if (cur.trim()) out.push(cur.trim())
  }
  return out.length ? out : [text]
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

export function useConversation(onTurn: (turn: ConversationTurn) => void) {
  const [state, setState] = useState<ConversationState>('off')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [canListen, setCanListen] = useState(true)

  const stateRef = useRef<ConversationState>('off')
  const genRef = useRef(0)               // invalidates async loops on stop/interrupt
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const sessionRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null)
  const micBufRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const voiceBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const levelRef = useRef(0)             // smoothed mic RMS → orb
  const ampRef = useRef(0)               // smoothed Eir-audio RMS → orb
  const bargeFramesRef = useRef(0)
  const bargeCooldownRef = useRef(0)
  const listenDisabledRef = useRef(false) // mic/SR permanently gone — session continues without listening
  const abortRef = useRef<AbortController | null>(null)
  const rafRef = useRef(0)
  const interimRef = useRef('')
  const lastFinalRef = useRef('')
  const onTurnRef = useRef(onTurn)
  onTurnRef.current = onTurn

  const setBoth = useCallback((s: ConversationState) => {
    stateRef.current = s
    setState(s)
  }, [])

  // ---- orb amplitude from Eir's own audio --------------------------------
  useEffect(() => {
    return onNeuralAudio((audio) => {
      const ctx = ctxRef.current
      if (!ctx || voiceAnalyserRef.current) return
      try {
        const src = ctx.createMediaElementSource(audio)
        const an = ctx.createAnalyser()
        an.fftSize = 512
        src.connect(an)
        an.connect(ctx.destination)
        voiceAnalyserRef.current = an
        voiceBufRef.current = new Uint8Array(an.fftSize)
      } catch { /* analyser is cosmetic — never block audio */ }
    })
  }, [])

  // ---- mic RMS → orb + barge-in gate --------------------------------------
  const startRaf = useCallback(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const ctx = ctxRef.current
      const mic = micAnalyserRef.current
      if (!ctx || !mic) return
      const buf = micBufRef.current ?? (micBufRef.current = new Float32Array(mic.fftSize))
      mic.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      // attack fast, release slow — the orb breathes instead of flickering
      levelRef.current = rms > levelRef.current
        ? levelRef.current + (rms - levelRef.current) * 0.55
        : levelRef.current + (rms - levelRef.current) * 0.12

      const van = voiceAnalyserRef.current
      if (van && voiceBufRef.current) {
        van.getByteTimeDomainData(voiceBufRef.current)
        let vs = 0
        for (let i = 0; i < voiceBufRef.current.length; i++) {
          const d = (voiceBufRef.current[i] - 128) / 128
          vs += d * d
        }
        const vrms = Math.sqrt(vs / voiceBufRef.current.length)
        ampRef.current = vrms > ampRef.current
          ? ampRef.current + (vrms - ampRef.current) * 0.6
          : ampRef.current + (vrms - ampRef.current) * 0.15
      }

      // barge-in: sustained voice while Eir speaks cuts her off
      const now = Date.now()
      if (stateRef.current === 'speaking' && now > bargeCooldownRef.current) {
        if (rms > BARGE_RMS) bargeFramesRef.current++
        else bargeFramesRef.current = Math.max(0, bargeFramesRef.current - 2)
        if (bargeFramesRef.current >= BARGE_FRAMES) {
          bargeFramesRef.current = 0
          bargeCooldownRef.current = Date.now() + BARGE_COOLDOWN_MS
          interruptRef.current()
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const interrupt = useCallback(() => {
    stopSpeaking()
    abortRef.current?.abort()
    abortRef.current = null
    genRef.current++
    if (sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
  }, [setBoth])
  const interruptRef = useRef(interrupt)
  interruptRef.current = interrupt

  // ---- send a user turn and speak the reply -------------------------------
  const sendText = useCallback(async (text: string, channel: 'text' | 'voice') => {
    const clean = text.trim()
    if (!clean || !sessionRef.current) return
    const myGen = ++genRef.current
    setInterim('')
    interimRef.current = ''
    lastFinalRef.current = clean
    setError(null)
    setBoth('thinking')
    onTurnRef.current({ role: 'user', content: clean })

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, channel }),
        signal: ctrl.signal,
      })
      if (myGen !== genRef.current) return
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = json?.error ?? 'Eir could not reach her AI provider.'
        setError(msg)
        setBoth(sessionRef.current && !listenDisabledRef.current ? 'listening' : sessionRef.current ? 'idle' : 'off')
        return
      }
      const reply: string = json.reply ?? ''
      const detected = json.detected ?? undefined
      const provider = json.provider ?? undefined
      onTurnRef.current({ role: 'assistant', content: reply, detected, provider })
      if (myGen !== genRef.current) return

      setBoth('speaking')
      const sentences = splitSentences(reply)
      for (let i = 0; i < sentences.length; i++) {
        if (myGen !== genRef.current || !sessionRef.current) return
        if (sentences[i + 1]) warmSpeak(sentences[i + 1])
        await new Promise<void>((resolve, reject) => {
          speak(sentences[i], {
            onEnd: () => resolve(),
            onError: () => reject(new Error('tts_failed')),
          })
        }).catch((err: Error) => {
          if (err.message === 'tts_stopped') throw Object.assign(err, { interrupted: true })
          // a single failed sentence must not kill the loop — but it did not
          // play, so keep going to the next one
        })
        if (myGen !== genRef.current) return
      }
      if (myGen === genRef.current && sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError('The conversation hit a snag — try again.')
      if (sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }, [setBoth])

  // ---- continuous recognition ---------------------------------------------
  const startRecognition = useCallback(() => {
    if (!speechRecognitionSupported()) { setCanListen(false); return }
    const Ctor = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = navigator.language?.startsWith('en') ? 'en-US' : (navigator.language || 'en-US')
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (ev) => {
      let final = ''
      let partial = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) final += r[0].transcript + ' '
        else partial += r[0].transcript
      }
      if (partial) { interimRef.current = partial; setInterim(partial) }
      const f = final.trim()
      if (f.length > 1 && f !== lastFinalRef.current) {
        // a final result while speaking = explicit barge-in with words
        void sendTextRef.current(f, 'voice')
      }
    }
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
        // lose the mic, not the conversation — typed input + spoken replies live on
        listenDisabledRef.current = true
        setCanListen(false)
        if (sessionRef.current) setBoth('idle')
        setError(
          ev.error === 'audio-capture'
            ? 'No microphone was found on this device.'
            : 'Microphone permission is blocked — allow it in the browser bar.',
        )
        try { recRef.current?.stop() } catch { /* noop */ }
      }
      // 'no-speech' and friends are normal in continuous mode — onend restarts
    }
    rec.onend = () => {
      if (!sessionRef.current || listenDisabledRef.current) return
      setTimeout(() => {
        if (!sessionRef.current) return
        try { recRef.current?.start() } catch { /* already started */ }
      }, 300)
    }
    recRef.current = rec
    try { rec.start() } catch { /* race — onend will restart */ }
  }, [setBoth])
  const sendTextRef = useRef(sendText)
  sendTextRef.current = sendText

  // ---- session lifecycle ---------------------------------------------------
  const start = useCallback(async () => {
    if (sessionRef.current) return
    sessionRef.current = true
    genRef.current++
    listenDisabledRef.current = false
    canListenRef.current = speechRecognitionSupported()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      micAnalyserRef.current = analyser
      ctx.createMediaStreamSource(stream).connect(analyser)
      startRaf()
    } catch {
      // no mic / denied — the session still works for speaking + text input
      listenDisabledRef.current = true
      setCanListen(false)
    }
    setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    startRecognition()
  }, [setBoth, startRaf, startRecognition])
  const canListenRef = useRef(true)

  const stop = useCallback(() => {
    sessionRef.current = false
    genRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    stopSpeaking()
    try { recRef.current?.stop() } catch { /* noop */ }
    recRef.current = null
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    micAnalyserRef.current = null
    voiceAnalyserRef.current = null
    levelRef.current = 0
    ampRef.current = 0
    setInterim('')
    setBoth('off')
  }, [setBoth])

  // track listen capability once
  useEffect(() => { canListenRef.current = speechRecognitionSupported() }, [])
  useEffect(() => () => { if (sessionRef.current) stop() }, [stop])

  return {
    state,
    orbState: state as OrbState,
    interim,
    error,
    canListen,
    levelRef,
    ampRef,
    start,
    stop,
    interrupt,
    sendText: (t: string) => void sendText(t, 'voice'),
    sendTyped: (t: string) => void sendText(t, 'text'),
  }
}
