// OpenEir — client UI store + preferences application
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_EDGE_VOICE, type VoiceEngine } from '@/lib/voice/edge-voice'
import type { ViewKey } from '@/lib/nav'

export { DEFAULT_EDGE_VOICE }
export type { ViewKey, VoiceEngine }

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
  sidebarCollapsed: boolean
  setAppearance: (p: Partial<Pick<UIState, 'theme' | 'largeText' | 'highContrast' | 'simpleMode'>>) => void
  setSidebarCollapsed: (v: boolean) => void
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
      sidebarCollapsed: false,
      setAppearance: (p) => set(p),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      voiceAutoSpeak: true,
      voiceRate: 1,
      voiceEngine: 'edge',
      edgeVoice: DEFAULT_EDGE_VOICE,
      setVoicePrefs: (p) => set(p),
    }),
    {
      name: 'openeir-ui',
      version: 1,
      // v0→v1: the standalone Voice view merged into Talk (voice + chat live together)
      migrate: (persisted) => {
        const p = persisted as Partial<UIState>
        if ((p.view as string) === 'voice' || p.view === undefined) p.view = 'talk'
        return p as UIState
      },
    },
  ),
)

/** Apply a11y classes to <html>. Call on mount and whenever they change. */
export function applyA11yClasses(largeText: boolean, highContrast: boolean) {
  const html = document.documentElement
  html.classList.toggle('large-text', largeText)
  html.classList.toggle('high-contrast', highContrast)
}
