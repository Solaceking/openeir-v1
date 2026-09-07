// OpenEir — shared voice constants (safe to import from BOTH server routes
// and client code; deliberately free of 'use client' and any store wiring).

/** Default neural voice (Microsoft Edge neural via the user's own server). */
export const DEFAULT_EDGE_VOICE = 'en-US-AndrewMultilingualNeural'

export type VoiceEngine = 'edge' | 'browser'
