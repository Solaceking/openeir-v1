// OpenEir — client UI store + preferences application
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewKey =
  | 'dashboard' | 'record' | 'voice' | 'readings' | 'medications'
  | 'trends' | 'story' | 'whatif' | 'reports' | 'settings'

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
  setVoicePrefs: (p: Partial<Pick<UIState, 'voiceAutoSpeak' | 'voiceRate'>>) => void
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
