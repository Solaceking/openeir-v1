// OpenEir — i18n engine.
// Core English strings live in code; community packs are plain JSON files in
// /public/language-packs/<code>.json, fetched on demand and cached. Missing
// keys gracefully fall back to English. RTL packs declare dir: 'rtl'.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface LanguagePackMeta {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  version: string
  authors?: string[]
}

type Dict = Record<string, unknown>

export const BUILTIN_PACKS: LanguagePackMeta[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', version: '1.0.0', authors: ['OpenEir core'] },
]

function deepMerge<T extends Dict>(base: T, override: Dict): T {
  const out: Dict = { ...base }
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k] as Dict, v as Dict)
    } else {
      out[k] = v
    }
  }
  return out as T
}

export function lookup(dict: Dict, path: string): string | undefined {
  let node: unknown = dict
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as Dict)) node = (node as Dict)[part]
    else return undefined
  }
  return typeof node === 'string' ? node : undefined
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

// ---------- core English dictionary (fallback for everything) ----------
import { en } from './en'

interface I18nState {
  lang: string
  meta: LanguagePackMeta
  dict: Dict
  setLanguage: (code: string) => Promise<void>
}

const packCache = new Map<string, { meta: LanguagePackMeta; dict: Dict }>()

export async function fetchPack(code: string): Promise<{ meta: LanguagePackMeta; dict: Dict }> {
  if (code === 'en') return { meta: BUILTIN_PACKS[0], dict: en as Dict }
  if (packCache.has(code)) return packCache.get(code)!
  const res = await fetch(`/language-packs/${code}.json`)
  if (!res.ok) throw new Error(`language pack ${code} not found`)
  const json = await res.json()
  const meta: LanguagePackMeta = {
    code, name: json.name ?? code, nativeName: json.nativeName ?? code,
    dir: json.dir === 'rtl' ? 'rtl' : 'ltr', version: json.version ?? '0.0.0',
    authors: json.authors,
  }
  const entry = { meta, dict: deepMerge(en as Dict, json.strings ?? {}) }
  packCache.set(code, entry)
  return entry
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: 'en',
      meta: BUILTIN_PACKS[0],
      dict: en as Dict,
      setLanguage: async (code: string) => {
        if (code === 'en') {
          set({ lang: 'en', meta: BUILTIN_PACKS[0], dict: en as Dict })
          document.documentElement.lang = 'en'
          document.documentElement.dir = 'ltr'
          return
        }
        try {
          const { meta, dict } = await fetchPack(code)
          set({ lang: code, meta, dict })
          document.documentElement.lang = code
          document.documentElement.dir = meta.dir
        } catch (e) {
          console.error('failed to load language pack', e)
        }
      },
    }),
    { name: 'openeir-i18n' },
  ),
)

/** Translation hook: const { t, lang } = useT() */
export function useT() {
  const { dict, lang, meta } = useI18n()
  const t = (path: string, vars?: Record<string, string | number>): string => {
    const raw = lookup(dict, path) ?? lookup(en as Dict, path) ?? path
    return vars ? interpolate(raw, vars) : raw
  }
  return { t, lang, meta, dir: meta.dir }
}
