// Default model id for the built-in AI provider (z-ai SDK).
// Users can override it per provider in Settings → AI providers.
export const DEFAULT_BUILTIN_MODEL = 'glm-5.3-flash'

// The gateway's text chat endpoint rejects image content, so vision requests
// route to the dedicated vision endpoint + a vision-capable model id.
export const DEFAULT_BUILTIN_VISION_MODEL = 'glm-4.5v'

/** True when a model id looks vision-capable (glm-4.5v, *-v, *vision*). */
export function isVisionModelId(model: string): boolean {
  return /vision|(^|[^a-z0-9])v$|\d+(\.\d+)?v($|[^a-z0-9])/i.test(model)
}
