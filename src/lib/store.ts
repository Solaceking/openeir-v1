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
  // settings drill-down (transient — feeds the breadcrumb trail, never persisted)
  settingsSection: string | null
  setSettingsSection: (v: string | null) => void
  // one-shot cross-view intent (e.g. sidebar user card → settings → auto-open change-password)
  settingsIntent: string | null
  setSettingsIntent: (v: string | null) => void
  // voice preferences (per-device: TTS voices live on the device)
  voiceAutoSpeak: boolean
  voiceRate: number
  voiceEngine: VoiceEngine
  edgeVoice: string
  /** Which ear transcribes the user: 'auto' (webspeech→server fallback) | 'webspeech' (never leaves device) | 'server' (user's own STT stack) */
  sttEar: 'auto' | 'webspeech' | 'server'
  setVoicePrefs: (p: Partial<Pick<UIState, 'voiceAutoSpeak' | 'voiceRate' | 'voiceEngine' | 'edgeVoice' | 'sttEar'>>) => void
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
      settingsSection: null,
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      settingsIntent: null,
      setSettingsIntent: (settingsIntent) => set({ settingsIntent }),
      voiceAutoSpeak: true,
      voiceRate: 1,
      voiceEngine: 'edge',
      edgeVoice: DEFAULT_EDGE_VOICE,
      sttEar: 'auto',
      setVoicePrefs: (p) => set(p),
    }),
    {
      name: 'openeir-ui',
      version: 2,
      // v0→v1: the standalone Voice view merged into Talk (voice + chat live together)
      migrate: (persisted) => {
        const p = persisted as Partial<UIState>
        if ((p.view as string) === 'voice' || p.view === undefined) p.view = 'talk'
        p.sttEar = p.sttEar === 'webspeech' || p.sttEar === 'server' ? p.sttEar : 'auto'
        return p as UIState
      },
      // transient navigation state (settingsSection) never survives a reload
      partialize: (s) => ({
        view: s.view,
        theme: s.theme,
        largeText: s.largeText,
        highContrast: s.highContrast,
        simpleMode: s.simpleMode,
        sidebarCollapsed: s.sidebarCollapsed,
        voiceAutoSpeak: s.voiceAutoSpeak,
        voiceRate: s.voiceRate,
        voiceEngine: s.voiceEngine,
        edgeVoice: s.edgeVoice,
        sttEar: s.sttEar,
      }) as UIState,
    },
  ),
)

/** Apply a11y classes to <html>. Call on mount and whenever they change. */
export function applyA11yClasses(largeText: boolean, highContrast: boolean) {
  const html = document.documentElement
  html.classList.toggle('large-text', largeText)
  html.classList.toggle('high-contrast', highContrast)
}
