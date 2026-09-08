// OpenEir — curated AI provider presets.
// The preset grid in Settings → AI. Each preset pre-fills the connection form:
// adapter, base URL, and (via modelsDevId) the live model catalog from
// https://models.dev — so users never type a model id by hand and never see
// a stale list: the catalog is fetched and cached server-side, newest first.
//
// kind:
//   'api-key'       — paste a key from the provider console
//   'keyless-local' — runs on the user's machine, no key at all
//   'harness'       — agent CLI on this machine (subscription auth, e.g. Claude
//                     Pro via Claude Code) — configured in the harness panel

export type PresetKind = 'api-key' | 'keyless-local' | 'harness'

export interface ProviderPreset {
  id: string
  label: string
  tagline: string
  adapter: 'openai_compatible' | 'anthropic' | 'ollama' | 'cli'
  baseUrl: string | null
  /** provider key in the models.dev catalog (drives the model dropdown) */
  modelsDevId?: string
  kind: PresetKind
  keyUrl?: string
  /** where to create the key, as a display string */
  keyHint?: string
  note?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    tagline: 'One key, hundreds of models',
    adapter: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsDevId: 'openrouter',
    kind: 'api-key',
    keyUrl: 'https://openrouter.ai/settings/keys',
    note: 'Unified access to OpenAI, Anthropic, Google, Meta, Qwen, DeepSeek and more — including free tiers of some models.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    tagline: 'GPT models, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    modelsDevId: 'openai',
    kind: 'api-key',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Prefer your ChatGPT subscription? Use the Codex CLI harness instead (Agent harness panel below).',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    tagline: 'Claude models, direct',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelsDevId: 'anthropic',
    kind: 'api-key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Prefer your Claude Pro/Max subscription? Use the Claude Code harness instead — subscription auth, no API key.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    tagline: 'Gemini models, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsDevId: 'google',
    kind: 'api-key',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'AI Studio keys have a free tier. The Gemini CLI harness can also use your Google account login.',
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    tagline: 'GLM open platform',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    modelsDevId: 'zai',
    kind: 'api-key',
    keyUrl: 'https://z.ai/model-api',
    note: 'Direct API access to the GLM family. Coding-plan subscribers get better rates on the dedicated Coding Plan preset.',
  },
  {
    id: 'zai-coding-plan',
    label: 'Z.ai Coding Plan',
    tagline: 'GLM subscription endpoint',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    modelsDevId: 'zai-coding-plan',
    kind: 'api-key',
    keyUrl: 'https://z.ai/model-api',
    note: 'Uses your GLM Coding Plan key — subscription pricing, direct from OpenEir. The same key can also drive Claude Code (see the recipe in the harness panel).',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    tagline: 'Grok models, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.x.ai/v1',
    modelsDevId: 'xai',
    kind: 'api-key',
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    tagline: 'V4 family, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsDevId: 'deepseek',
    kind: 'api-key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    tagline: 'Kimi models, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelsDevId: 'moonshotai',
    kind: 'api-key',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    tagline: 'Nemotron, Qwen, Llama + 100 more',
    adapter: 'openai_compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelsDevId: 'nvidia',
    kind: 'api-key',
    keyUrl: 'https://build.nvidia.com',
    note: 'Free credits on signup; huge hosted open-model catalog.',
  },
  {
    id: 'groq',
    label: 'Groq',
    tagline: 'Extremely fast open models',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsDevId: 'groq',
    kind: 'api-key',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Llama, Qwen and friends at absurd tokens/sec. Free tier available.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    tagline: 'Mistral family, direct',
    adapter: 'openai_compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsDevId: 'mistral',
    kind: 'api-key',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    tagline: 'Local — fully offline',
    adapter: 'openai_compatible',
    baseUrl: 'http://localhost:1234/v1',
    modelsDevId: 'lmstudio',
    kind: 'keyless-local',
    note: 'Start the LM Studio local server (Developer tab). Nothing ever leaves your machine.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    tagline: 'Local — fully offline',
    adapter: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    kind: 'keyless-local',
    note: 'Type the model tag shown by `ollama ls` (e.g. llama3.1:8b). Nothing ever leaves your machine.',
  },
  {
    id: 'custom',
    label: 'Custom / self-hosted',
    tagline: 'Any OpenAI-compatible URL',
    adapter: 'openai_compatible',
    baseUrl: '',
    kind: 'api-key',
    note: 'vLLM, llama.cpp server, LiteLLM proxy, Open WebUI, corporate gateways — anything speaking /chat/completions.',
  },
]

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

/** Provider ids we keep in the local models.dev cache slice. */
export const CATALOG_PROVIDER_IDS = [
  ...new Set(PROVIDER_PRESETS.map((p) => p.modelsDevId).filter((x): x is string => Boolean(x))),
]
