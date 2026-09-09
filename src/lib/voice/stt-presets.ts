// OpenEir — curated STT (speech-to-text) provider presets.
// The preset grid in Settings → Voice & audio → Speech-to-text. Mirrors the
// LLM provider presets (src/lib/ai/presets.ts): each preset pre-fills the
// connection form (base URL + model) so setup is paste-key-and-go.
//
// Every preset speaks the OpenAI /audio/transcriptions dialect (multipart
// form: file + model). Audio is sent as one short utterance per request —
// nothing is stored by OpenEir, and the provider's own retention policy
// applies after that (documented in docs/VOICE_AND_TALK.md).
//
// kind:
//   'api-key'       — paste a key from the provider console
//   'keyless-local' — runs on the user's machine, no key at all

export type SttPresetKind = 'api-key' | 'keyless-local'

export interface SttProviderPreset {
  id: string
  label: string
  tagline: string
  baseUrl: string
  model: string
  kind: SttPresetKind
  keyUrl?: string
  /** price hint shown in the card, e.g. "$0.04/hr audio" */
  price?: string
  note?: string
}

export const STT_PROVIDER_PRESETS: SttProviderPreset[] = [
  {
    id: 'groq',
    label: 'Groq',
    tagline: 'Whisper v3 Turbo — fastest, free tier',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3-turbo',
    kind: 'api-key',
    keyUrl: 'https://console.groq.com/keys',
    price: '~$0.04/hr audio · free tier',
    note: 'An hour of audio transcribes in seconds on Groq LPUs. The default recommendation for voice.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    tagline: 'Whisper & GPT-4o transcribe',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    kind: 'api-key',
    keyUrl: 'https://platform.openai.com/api-keys',
    price: '~$0.006/min audio',
    note: 'Switch the model to gpt-4o-mini-transcribe for cheaper/faster on the same key.',
  },
  {
    id: 'mistral',
    label: 'Mistral (Voxtral)',
    tagline: 'Voxtral Mini — EU-hosted option',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'voxtral-mini-latest',
    kind: 'api-key',
    keyUrl: 'https://console.mistral.ai/api-keys',
    price: '~€0.001/min audio (approx)',
    note: 'OpenAI-compatible endpoint; good pick if you prefer EU data processing.',
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    tagline: 'Nova-3 — enterprise STT',
    baseUrl: 'https://api.deepgram.com/v1/listen',
    model: 'nova-3',
    kind: 'api-key',
    keyUrl: 'https://console.deepgram.com',
    price: '~$0.0043/min (pay-as-you-go) · $200 free credits',
    note: 'Uses Deepgram\'s own JSON API (not the OpenAI form dialect) — works via the custom preset with this base URL.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    tagline: 'One key, any whisper-hosting model',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/whisper-large-v3',
    kind: 'api-key',
    keyUrl: 'https://openrouter.ai/settings/keys',
    price: 'varies by model',
    note: 'Reuses your existing OpenRouter key if you already have one for chat.',
  },
  {
    id: 'local-whisper',
    label: 'Local Whisper',
    tagline: 'Self-hosted — audio never leaves your box',
    baseUrl: 'http://localhost:8630/v1',
    model: 'large-v3',
    kind: 'keyless-local',
    note: 'Any OpenAI-compatible whisper server (faster-whisper, speaches, LM Studio). On CPU expect tens of seconds per clip; fine as a fallback ear.',
  },
  {
    id: 'custom',
    label: 'Custom / gateway',
    tagline: 'Any OpenAI-compatible transcription URL',
    baseUrl: '',
    model: '',
    kind: 'api-key',
    note: 'OmniRoute, LiteLLM proxy, corporate gateway — anything that answers /audio/transcriptions.',
  },
] as SttProviderPreset[]

export function sttPresetById(id: string): SttProviderPreset | undefined {
  return STT_PROVIDER_PRESETS.find((p) => p.id === id)
}
