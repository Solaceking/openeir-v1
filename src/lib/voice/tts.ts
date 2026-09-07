// OpenEir — text-to-speech, two engines:
//
//   1. "edge" (default): Microsoft Edge NEURAL voices, synthesized by the
//      user's own OpenEir server (`POST /api/voice/tts`) and cached as MP3 —
//      no API keys, no cloud accounts, no per-request cost. This is the
//      studio-quality path: the same voices Edge's Read Aloud uses.
//   2. "browser": the classic SpeechSynthesis path (OS/device voices) —
//      used by explicit preference and as the automatic fallback whenever
//      the neural engine is unreachable, so readbacks NEVER go silent.
//
// Rate/voice/engine are per-device preferences in the UI store.

import { DEFAULT_EDGE_VOICE, useUI, type VoiceEngine } from '@/lib/store'

export const EDGE_TTS_ENDPOINT = '/api/voice/tts'

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** True when any TTS path is available: neural engine always (server-side), browser engine conditionally. */
export function ttsAvailable(engine: VoiceEngine): boolean {
  return engine === 'edge' || speechSynthesisSupported()
}

// ---------------------------------------------------------------------------
// Browser engine (SpeechSynthesis)
// ---------------------------------------------------------------------------

export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSynthesisSupported()) return []
  return window.speechSynthesis.getVoices()
}

/** Prefer a voice matching the readback language; fall back to the default. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = listVoices()
  if (voices.length === 0) return null
  const base = lang.slice(0, 2).toLowerCase()
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)) ??
    null
  )
}

function browserSpeak(
  text: string,
  opts: { lang?: string; rate?: number; onEnd?: () => void; onError?: () => void },
): void {
  if (!speechSynthesisSupported() || !text.trim()) { opts.onEnd?.(); return }
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const lang = opts.lang ?? 'en'
    u.lang = lang === 'en' ? 'en-US' : lang
    const voice = pickVoice(lang)
    if (voice) u.voice = voice
    u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1))
    u.onend = () => opts.onEnd?.()
    u.onerror = () => opts.onError?.()
    window.speechSynthesis.speak(u)
  } catch {
    opts.onError?.()
  }
}

// ---------------------------------------------------------------------------
// Neural engine (Edge TTS via own server)
// ---------------------------------------------------------------------------

/** In-memory blob cache: "voice|rate|text" → object URL. Saves a round-trip on replays. */
const blobCache = new Map<string, string>()
const BLOB_CACHE_MAX = 80

let currentAudio: HTMLAudioElement | null = null

function evictOldestBlobs() {
  while (blobCache.size > BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value
    if (oldest === undefined) break
    const url = blobCache.get(oldest)
    blobCache.delete(oldest)
    if (url) URL.revokeObjectURL(url)
  }
}

function stopCurrentAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.currentTime = 0
    } catch { /* already gone */ }
    currentAudio = null
  }
}

/** Synthesize (or fetch from server cache) and play. Resolves when playback ends. */
async function edgeSpeak(
  text: string,
  opts: { edgeVoice: string; rate: number },
): Promise<void> {
  const body = JSON.stringify({ text, voice: opts.edgeVoice, rate: opts.rate })
  const key = `${opts.edgeVoice}|${opts.rate}|${text}`
  let url = blobCache.get(key)
  if (!url) {
    const res = await fetch(EDGE_TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) throw new Error(`tts_${res.status}`)
    const blob = await res.blob()
    if (!blob.type.startsWith('audio')) throw new Error('tts_bad_payload')
    url = URL.createObjectURL(blob)
    blobCache.set(key, url)
    evictOldestBlobs()
  }
  stopCurrentAudio()
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url!)
    currentAudio = audio
    audio.onended = () => { if (currentAudio === audio) currentAudio = null; resolve() }
    audio.onerror = () => { if (currentAudio === audio) currentAudio = null; reject(new Error('tts_playback')) }
    audio.play().catch(() => {
      if (currentAudio === audio) currentAudio = null
      reject(new Error('tts_autoplay'))
    })
  })
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export interface SpeakOptions {
  lang?: string
  rate?: number // 0.5..2 — persisted as voiceRate in the UI store
  engine?: VoiceEngine // override the store preference
  edgeVoice?: string // override the store's neural voice
  onEnd?: () => void
  onError?: () => void
}

/**
 * Speak a short readback through the preferred engine. If the neural engine
 * fails for any reason (offline, server restart, autoplay blocked) the call
 * transparently degrades to the browser voice — the user still hears it.
 * Cancels any utterance in flight first.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text.trim()) { opts.onEnd?.(); return }
  const ui = useUI.getState()
  const engine = opts.engine ?? ui.voiceEngine ?? 'edge'
  const rate = Math.min(1.6, Math.max(0.6, opts.rate ?? ui.voiceRate ?? 1))

  if (engine === 'edge') {
    edgeSpeak(text, { edgeVoice: opts.edgeVoice ?? ui.edgeVoice ?? DEFAULT_EDGE_VOICE, rate })
      .then(() => opts.onEnd?.())
      .catch(() => browserSpeak(text, { ...opts })) // graceful degrade — never silent
    return
  }
  browserSpeak(text, opts)
}

export function stopSpeaking(): void {
  stopCurrentAudio()
  if (speechSynthesisSupported()) {
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
  }
}
