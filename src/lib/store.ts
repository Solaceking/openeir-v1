// OpenEir — client UI store + preferences application
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_EDGE_VOICE, type VoiceEngine } from '@/lib/voice/edge-voice'

export { DEFAULT_EDGE_VOICE }
export type { VoiceEngine }

export type ViewKey =
  | 'dashboard' | 'talk' | 'record' | 'voice' | 'readings' | 'medications'
  | 'safety' | 'trends' | 'story' | 'whatif' | 'reports' | 'settings'

interface UIState {
  view: ViewKey
  setView: (v: ViewKey) => void
  online: boolean
  setOnline: (v: boolean) => void
  // appearance preferences (also mirrored to profile.prefs)
  theme: 'light' | 'dark' | 'system'
  largeText: boolean
  highContrast: boolean
  simpleMode: boolean
  setAppearance: (p: Partial<Pick<UIState, 'theme' | 'largeText' | 'highContrast' | 'simpleMode'>>) => void
  // voice preferences (per-device: TTS voices live on the device)
  voiceAutoSpeak: boolean
  voiceRate: number
  voiceEngine: VoiceEngine
  edgeVoice: string
  setVoicePrefs: (p: Partial<Pick<UIState, 'voiceAutoSpeak' | 'voiceRate' | 'voiceEngine' | 'edgeVoice'>>) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: 'dashboard',
      setView: (view) => set({ view }),
      online: true,
      setOnline: (online) => set({ online }),
      theme: 'system',
      largeText: false,
      highContrast: false,
      simpleMode: false,
      setAppearance: (p) => set(p),
      voiceAutoSpeak: true,
      voiceRate: 1,
      voiceEngine: 'edge',
      edgeVoice: DEFAULT_EDGE_VOICE,
      setVoicePrefs: (p) => set(p),
    }),
    { name: 'openeir-ui' },
  ),
)

/** Apply a11y classes to <html>. Call on mount and whenever they change. */
export function applyA11yClasses(largeText: boolean, highContrast: boolean) {
  const html = document.documentElement
  html.classList.toggle('large-text', largeText)
  html.classList.toggle('high-contrast', highContrast)
}
