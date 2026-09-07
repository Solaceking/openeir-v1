'use client'

// OpenEir — the hands-free conversation loop.
//
// A small state machine that makes "talking to Eir" feel like talking to a
// person:
//
//   off → listening → thinking → speaking → listening → …
//                        ↑____________barge-in____________↓
//
// Two ears, one conversation:
//   · Web Speech (Chrome/Edge/Safari) — instant interim text, primary ear.
//   · Server ear — automatic fallback. When the browser speech service is
//     missing or unreachable (Firefox, blocked Google endpoints, flaky
//     networks), the mic stream is VAD-gated and captured with MediaRecorder,
//     then transcribed by the user's OWN server (`POST /api/voice/stt`).
//     The hand-off is silent — the user just keeps talking.
//
// - While Eir SPEAKS, the microphone stays open: sustained voice energy above
//   a gate interrupts her mid-sentence, then your words are processed.
// - Echo guard: finals that arrive right after Eir spoke and repeat her own
//   words are dropped — but short utterances ("yes", "okay") are NOT.
// - Replies are spoken sentence-by-sentence through the NEURAL engine, with
//   the next sentence prefetched while the current one plays.
// - Hardened against hangs: fetch timeout + thinking watchdog — the loop can
//   always recover, and every failure is visible as text.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  speak, stopSpeaking, warmSpeak, onNeuralAudio,
} from '@/lib/voice/tts'
import { speechRecognitionSupported } from '@/lib/voice/stt'
import type { OrbState } from '@/lib/voice/orb-engine'

export type ConversationState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking'
export type ConversationEar = 'webspeech' | 'server' | 'none'

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

const ECHO_WINDOW_MS = 4500        // only suspect echo right after Eir spoke
const THINK_WATCHDOG_MS = 45_000   // no provider answer for 45s → recover
const FETCH_TIMEOUT_MS = 60_000    // hard ceiling on one /api/chat call

const CAP_START_RMS = 0.05         // server ear: mic energy that opens a capture
const CAP_START_FRAMES = 6         // ~100ms of voice before the recorder rolls
const CAP_SILENCE_RMS = 0.022      // below this the utterance counts as finished
const CAP_SILENCE_FRAMES = 84      // ~1.4s of silence closes the utterance
const CAP_MIN_MS = 700             // keep recording at least this long
const CAP_MAX_MS = 12_000          // hard cap per utterance
const STT_FAILS_BEFORE_FALLBACK = 2
const DEAD_AIR_MS = 12_000         // webspeech silent this long while voice seen → server ear

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

export function mediaRecorderSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder === 'function'
    && !!navigator.mediaDevices?.getUserMedia
}

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* keep probing */ }
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result ?? '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    fr.onerror = () => reject(new Error('blob_read_failed'))
    fr.readAsDataURL(blob)
  })
}

export function useConversation(onTurn: (turn: ConversationTurn) => void) {
  const [state, setState] = useState<ConversationState>('off')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)   // soft, non-blocking hint
  const [canListen, setCanListen] = useState(true)
  const [ear, setEar] = useState<ConversationEar>('webspeech')
  const [capturing, setCapturing] = useState(false)
  // Eir's latest reply, shown as text in the overlay. Voice must NEVER be the
  // only channel: if audio is blocked (autoplay policy, no device volume), the
  // user still sees every word.
  const [lastReply, setLastReply] = useState<string | null>(null)

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
  const listenDisabledRef = useRef(false) // no mic at all — session continues without listening
  const abortRef = useRef<AbortController | null>(null)
  const rafRef = useRef(0)
  const interimRef = useRef('')
  const lastFinalRef = useRef('')
  const lastReplyRef = useRef('')
  const spokeAtRef = useRef(0)           // Date.now() of the last TTS activity (echo window)
  const onTurnRef = useRef(onTurn)
  onTurnRef.current = onTurn

  // server-ear capture machinery
  const fallbackRef = useRef(false)      // server ear engaged
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const captureRef = useRef(false)       // recorder currently rolling
  const captureStartRef = useRef(0)
  const speechFramesRef = useRef(0)
  const silenceFramesRef = useRef(0)
  const sttFailRef = useRef(0)           // consecutive webspeech hard/soft failures
  const lastSttAtRef = useRef(0)         // last onresult activity
  const voiceSeenAtRef = useRef(0)       // last time the mic saw real voice energy

  const setBoth = useCallback((s: ConversationState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const softEar = useCallback((msg: string) => {
    fallbackRef.current = true
    setEar('server')
    setNotice(msg)
    try { recRef.current?.stop() } catch { /* already gone */ }
    recRef.current = null                  // onend sees null → never restarts
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

  // ---- interrupt ----------------------------------------------------------
  const interrupt = useCallback(() => {
    stopSpeaking()
    abortRef.current?.abort()
    abortRef.current = null
    genRef.current++
    spokeAtRef.current = Date.now()
    if (sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
  }, [setBoth])
  const interruptRef = useRef(interrupt)
  interruptRef.current = interrupt

  /** True when a final transcript looks like the recognizer hearing Eir's own
   *  voice (echo on machines without acoustic echo cancellation). Only suspect
   *  within a few seconds of her speaking, and ONLY if the text actually
   *  repeats her words — "yes", "no", "tell me more" always pass. */
  const isEcho = useCallback((text: string): boolean => {
    const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    if (t.length < 2) return true                       // noise / single keystrokes
    if (Date.now() - spokeAtRef.current > ECHO_WINDOW_MS) return false
    const reply = lastReplyRef.current
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140)
    if (!reply) return false                            // greeting etc. is tracked too
    return reply.includes(t)
  }, [])

  // ---- send a user turn and speak the reply -------------------------------
  const sendText = useCallback(async (text: string, channel: 'text' | 'voice') => {
    const clean = text.trim()
    if (!clean || !sessionRef.current) return
    // echo of Eir's own voice (no AEC on some devices) must not become a turn
    if (isEcho(clean)) { setInterim(''); interimRef.current = ''; return }
    const myGen = ++genRef.current
    setInterim('')
    interimRef.current = ''
    lastFinalRef.current = clean
    setError(null)
    setNotice(null)
    setBoth('thinking')
    onTurnRef.current({ role: 'user', content: clean })

    // thinking watchdog — a hung provider must never wedge the loop
    const watchdog = window.setTimeout(() => {
      if (myGen !== genRef.current || !sessionRef.current || stateRef.current !== 'thinking') return
      genRef.current++                    // invalidate the late answer
      setError('Eir did not hear back from her AI in time. Try again in a moment — or check Settings → AI.')
      setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    }, THINK_WATCHDOG_MS)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    const abortTimer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, channel }),
        signal: ctrl.signal,
      })
      window.clearTimeout(abortTimer)
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
      setLastReply(reply)
      lastReplyRef.current = reply
      spokeAtRef.current = Date.now()
      const sentences = splitSentences(reply)
      let failedSentences = 0
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
          failedSentences++
        }).finally(() => { spokeAtRef.current = Date.now() })
        if (myGen !== genRef.current) return
      }
      // BOTH engines failed for every sentence: audio is blocked on this device.
      // The reply is already visible as text — say so instead of failing silently.
      if (failedSentences >= sentences.length && reply) {
        setError("Audio couldn't play on this device — Eir's reply is shown as text. (Check volume, or the browser's autoplay block.)")
      }
      if (myGen === genRef.current && sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    } catch (err) {
      window.clearTimeout(abortTimer)
      if ((err as Error)?.name === 'AbortError') return
      setError('The conversation hit a snag — try again.')
      if (sessionRef.current) setBoth(listenDisabledRef.current ? 'idle' : 'listening')
    } finally {
      window.clearTimeout(watchdog)
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }, [isEcho, setBoth])

  // ---- server ear: capture one VAD-gated utterance ------------------------
  const submitCapture = useCallback(async (blob: Blob) => {
    if (!sessionRef.current || blob.size < 1400) return    // < ~60ms of audio → noise
    const myGen = ++genRef.current
    setBoth('thinking')
    try {
      const audio = await blobToBase64(blob)
      const res = await fetch('/api/voice/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime: blob.type || 'audio/webm' }),
      })
      if (myGen !== genRef.current) return
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.text?.trim()) {
        setNotice('Heard something, but could not make out the words — try again a little closer to the mic.')
        setBoth(sessionRef.current && !listenDisabledRef.current ? 'listening' : 'idle')
        return
      }
      void sendTextRef.current(json.text.trim(), 'voice')
    } catch {
      if (myGen === genRef.current && sessionRef.current) {
        setNotice('Transcription failed — check the server connection.')
        setBoth(listenDisabledRef.current ? 'idle' : 'listening')
      }
    }
  }, [setBoth])
  const submitCaptureRef = useRef(submitCapture)
  submitCaptureRef.current = submitCapture

  const startCapture = useCallback(() => {
    const stream = streamRef.current
    if (!stream || !mediaRecorderSupported() || captureRef.current) return
    try {
      const mime = pickRecorderMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        captureRef.current = false
        setCapturing(false)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (sessionRef.current) void submitCaptureRef.current(blob)
      }
      recorderRef.current = rec
      rec.start()
      captureRef.current = true
      setCapturing(true)
      captureStartRef.current = Date.now()
      silenceFramesRef.current = 0
      speechFramesRef.current = 0
    } catch { /* recorder refused — stay listening, retry on next voice burst */ }
  }, [])

  // ---- continuous recognition ---------------------------------------------
  const startRecognition = useCallback(() => {
    if (!speechRecognitionSupported()) {
      if (mediaRecorderSupported() && streamRef.current) softEar('Browser speech service unavailable — using your server as the ear.')
      else setCanListen(false)
      return
    }
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
      sttFailRef.current = 0
      lastSttAtRef.current = Date.now()
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
        // lose Web Speech, not the conversation — the server ear takes over,
        // but ONLY if the raw mic stream itself is alive (VAD capture needs it)
        if (mediaRecorderSupported() && streamRef.current && !listenDisabledRef.current) {
          softEar('Microphone blocked for browser speech — switched to the server ear.')
        } else {
          listenDisabledRef.current = true
          setCanListen(false)
          if (sessionRef.current) setBoth('idle')
        }
        setError(
          ev.error === 'audio-capture'
            ? 'No microphone was found on this device.'
            : 'Microphone permission is blocked — allow it in the browser bar.',
        )
        try { recRef.current?.stop() } catch { /* noop */ }
        return
      }
      if (ev.error === 'network' || ev.error === 'unknown') {
        // Chrome's recognizer phones home — when that path is broken it fails
        // FOREVER and silently. Count failures and switch to the server ear.
        sttFailRef.current++
        if (sttFailRef.current >= STT_FAILS_BEFORE_FALLBACK && mediaRecorderSupported() && streamRef.current) {
          softEar('Browser speech service unreachable — your server is the ear now. Just keep talking.')
        }
      }
      // 'no-speech' and friends are normal in continuous mode — onend restarts
    }
    rec.onend = () => {
      if (!sessionRef.current || fallbackRef.current || listenDisabledRef.current) return
      setTimeout(() => {
        if (!sessionRef.current || fallbackRef.current) return
        try { recRef.current?.start() } catch { /* already started */ }
      }, 300)
    }
    recRef.current = rec
    try { rec.start() } catch { /* race — onend will restart */ }
  }, [setBoth, softEar])
  const sendTextRef = useRef(sendText)
  sendTextRef.current = sendText

  // ---- mic RMS → orb + barge-in gate + server-ear VAD ---------------------
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

      // server ear: VAD-gated capture of one utterance while listening
      if (fallbackRef.current && stateRef.current === 'listening' && !listenDisabledRef.current) {
        if (!captureRef.current) {
          if (rms > CAP_START_RMS) speechFramesRef.current++
          else speechFramesRef.current = Math.max(0, speechFramesRef.current - 1)
          if (speechFramesRef.current >= CAP_START_FRAMES) startCapture()
        } else {
          if (rms > CAP_SILENCE_RMS) silenceFramesRef.current = 0
          else silenceFramesRef.current++
          const spoken = Date.now() - captureStartRef.current
          if ((spoken > CAP_MIN_MS && silenceFramesRef.current >= CAP_SILENCE_FRAMES) || spoken > CAP_MAX_MS) {
            try { recorderRef.current?.stop() } catch { /* onstop still fires */ }
          }
        }
      }

      // dead-air watchdog: Web Speech hears the mic energy but never returns
      // text → swap to the server ear instead of listening into the void
      if (!fallbackRef.current && recRef.current && streamRef.current && stateRef.current === 'listening' && rms > CAP_START_RMS) {
        if (!voiceSeenAtRef.current) voiceSeenAtRef.current = now
        else if (now - voiceSeenAtRef.current > DEAD_AIR_MS && now - lastSttAtRef.current > DEAD_AIR_MS) {
          voiceSeenAtRef.current = 0
          if (mediaRecorderSupported()) {
            softEar('Speech service is not returning words — your server is the ear now.')
            try { recRef.current?.stop() } catch { /* noop */ }
            recRef.current = null
          }
        }
      } else if (rms <= CAP_START_RMS) {
        voiceSeenAtRef.current = 0
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [startCapture, softEar])

  /** Speak a line AND remember it — so the echo guard recognizes it coming
   *  back through the speakers. Used for the session greeting. */
  const announce = useCallback((text: string) => {
    lastReplyRef.current = text
    spokeAtRef.current = Date.now()
    speak(text)
  }, [])

  // ---- session lifecycle ---------------------------------------------------
  const start = useCallback(async () => {
    if (sessionRef.current) return
    sessionRef.current = true
    genRef.current++
    listenDisabledRef.current = false
    fallbackRef.current = false
    sttFailRef.current = 0
    lastSttAtRef.current = 0
    voiceSeenAtRef.current = 0
    lastReplyRef.current = ''
    spokeAtRef.current = 0
    canListenRef.current = speechRecognitionSupported() || mediaRecorderSupported()
    setEar('webspeech')
    setNotice(null)
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
    try { if (recorderRef.current?.state === 'recording') recorderRef.current.stop() } catch { /* noop */ }
    recorderRef.current = null
    captureRef.current = false
    setCapturing(false)
    try { recRef.current?.stop() } catch { /* noop */ }
    recRef.current = null
    fallbackRef.current = false
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
    setNotice(null)
    setBoth('off')
  }, [setBoth])

  // track listen capability once
  useEffect(() => { canListenRef.current = speechRecognitionSupported() || mediaRecorderSupported() }, [])
  useEffect(() => () => { if (sessionRef.current) stop() }, [stop])

  return {
    state,
    orbState: state as OrbState,
    interim,
    error,
    notice,
    canListen,
    canListenRef,
    ear,
    capturing,
    lastReply,
    levelRef,
    ampRef,
    start,
    stop,
    interrupt,
    announce,
    sendText: (t: string) => void sendText(t, 'voice'),
    sendTyped: (t: string) => void sendText(t, 'text'),
  }
}
