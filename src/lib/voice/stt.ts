// OpenEir — speech-to-text wrapper (Web Speech API).
// Graceful degradation by browser (the honest matrix, surfaced in the UI):
//   Chrome/Edge desktop + Android : full STT (server-backed by Google) + interim results
//   Safari macOS / iOS 14.5+      : webkitSpeechRecognition (Siri backend); iOS PWA needs a tap-gesture
//   Firefox                       : no STT — the typed fallback keeps the whole flow usable
// The parser is text-in/text-out, so typed input is a first-class citizen,
// not a crippled fallback.

export interface DictationResult {
  /** best final transcript (empty when only interim was received) */
  final: string
  interim: string
}

export interface DictationHandlers {
  onPartial?: (interim: string, final: string) => void
  onFinal: (text: string) => void
  onError: (code: DictationErrorCode, message: string) => void
  onEnd: () => void
}

export type DictationErrorCode =
  | 'unsupported' | 'not-allowed' | 'no-speech' | 'network' | 'aborted' | 'audio-capture' | 'unknown'

function SR(): (typeof SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechRecognitionSupported(): boolean {
  return SR() !== null
}

/** Browser family for the degradation notice: 'chromium' | 'safari' | 'firefox' | 'other' */
export function sttBrowserFamily(): 'chromium' | 'safari' | 'firefox' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/firefox/i.test(ua)) return 'firefox'
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg/i.test(ua)) return 'safari'
  if (/chrome|chromium|crios|edg/i.test(ua)) return 'chromium'
  return 'other'
}

/**
 * Map an app language code to a BCP-47 tag for the recognizer.
 * EN first; packs zh-CN / de / ar already carry usable codes.
 */
export function sttLocale(lang: string): string {
  switch (lang) {
    case 'en': return 'en-US'
    case 'zh-CN': return 'zh-CN'
    case 'de': return 'de-DE'
    case 'ar': return 'ar-SA'
    default: return lang.length === 2 ? `${lang}-${lang.toUpperCase()}` : lang
  }
}

/**
 * Start one dictation session (single utterance: auto-stops after a pause).
 * Returns a stop() handle. Errors arrive via handlers.onError.
 */
export function startDictation(handlers: DictationHandlers, lang = 'en'): () => void {
  const Ctor = SR()
  if (!Ctor) {
    handlers.onError('unsupported', 'This browser has no speech recognition. Chrome, Edge or Safari work; in Firefox use the text box.')
    queueMicrotask(handlers.onEnd)
    return () => {}
  }
  const rec = new Ctor()
  rec.lang = sttLocale(lang)
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  let finalText = ''
  let interim = ''
  let stopped = false

  rec.onresult = (ev: SpeechRecognitionEvent) => {
    interim = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i]
      if (res.isFinal) finalText += res[0].transcript + ' '
      else interim += res[0].transcript
    }
    handlers.onPartial?.(interim.trim(), finalText.trim())
  }
  rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
    stopped = true
    const code = ev.error as DictationErrorCode
    const messages: Record<DictationErrorCode, string> = {
      'unsupported': 'Speech recognition is not supported here.',
      'not-allowed': 'Microphone permission was blocked. Allow it in the browser bar and try again.',
      'no-speech': 'Heard nothing — tap the mic and speak a little louder.',
      'network': 'Speech service needs a connection — you can type it instead.',
      'aborted': 'Stopped.',
      'audio-capture': 'No microphone found.',
      'unknown': 'Speech recognition failed — try again or type it.',
    }
    if (code !== 'aborted') handlers.onError(code in messages ? code : 'unknown', messages[code in messages ? code : 'unknown'])
  }
  rec.onend = () => {
    const text = (finalText || interim).trim()
    if (!stopped && text) handlers.onFinal(text)
    handlers.onEnd()
  }

  try {
    rec.start()
  } catch {
    handlers.onError('unknown', 'Could not start the microphone — try again.')
    queueMicrotask(handlers.onEnd)
  }

  return () => {
    stopped = true
    try { rec.stop() } catch { /* already stopped */ }
  }
}
