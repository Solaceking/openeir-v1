// OpenEir — text-to-speech wrapper (SpeechSynthesis).
// Zero infrastructure: every browser ships voices; Eir speaks the readback
// through the device. Rate/voice are per-device preferences in the UI store.

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

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

export interface SpeakOptions {
  lang?: string
  rate?: number // 0.5..2 — persisted as voiceRate in the UI store
  onEnd?: () => void
  onError?: () => void
}

/** Speak a short readback. Cancels any utterance in flight first. */
export function speak(text: string, opts: SpeakOptions = {}): void {
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

export function stopSpeaking(): void {
  if (speechSynthesisSupported()) {
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
  }
}
