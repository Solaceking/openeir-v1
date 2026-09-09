'use client'

// OpenEir — "Live conversation" card (Settings → Providers → Audio).
// The opt-in switch for the Pipecat realtime agent. Deliberately OFF by
// default: push-to-talk stays the primary, predictable experience — this is
// a deliberate power-user/caregiver decision, not a default behavior change.
// Engine choice mirrors the SttRouting philosophy: pluggable, configured
// once, read by the voice container through the internal RPC.

import { useCallback, useEffect, useState } from 'react'
import { AudioLines, Loader2, Server } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n'

interface LiveState {
  enabled: boolean
  sttEngine: 'local_whisper' | 'deepgram_selfhosted'
  ttsEngine: 'edge' | 'piper' | 'openai_compat' | 'deepgram'
  rate?: number
}

const STT_ENGINES: Array<{ id: LiveState['sttEngine']; label: string; hint: string }> = [
  { id: 'local_whisper', label: 'Local Whisper', hint: 'Your own whisper server or in-container — private' },
  { id: 'deepgram_selfhosted', label: 'Deepgram (self-hosted)', hint: 'Lower latency; needs the Deepgram engine + DEEPGRAM_URL' },
]

const TTS_ENGINES: Array<{ id: LiveState['ttsEngine']; label: string; hint: string }> = [
  { id: 'edge', label: 'Edge neural voice (via OpenEir)', hint: 'Same voice the rest of the app uses — free' },
  { id: 'piper', label: 'Piper (offline)', hint: 'Fully offline voices running in the voice container' },
  { id: 'openai_compat', label: 'OpenAI-compatible server', hint: 'Any compatible speech server (LOCAL_TTS_URL)' },
  { id: 'deepgram', label: 'Deepgram Aura', hint: 'Self-hosted or cloud endpoint' },
]

export function LiveVoiceCard() {
  const { t } = useT()
  const [live, setLive] = useState<LiveState | null>(null)
  const [serviceAvailable, setServiceAvailable] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/voice/live')
      const j = await res.json()
      if (j?.live) setLive(j.live)
      setServiceAvailable(Boolean(j?.serviceAvailable))
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { void load() }, [load])

  const put = async (patch: Partial<LiveState>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/voice/live', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) void load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><AudioLines className="h-4 w-4 text-primary" aria-hidden /> {t('settings.liveVoiceTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!live && <Skeleton className="h-20" />}
        {live && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('settings.liveVoiceEnable')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('settings.liveVoiceHint')}</p>
              </div>
              <Switch
                checked={live.enabled}
                disabled={saving}
                onCheckedChange={(v) => void put({ enabled: v })}
                aria-label={t('settings.liveVoiceEnable')}
              />
            </div>

            {live.enabled && (
              <div className="space-y-3 rounded-xl border bg-background/60 p-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold">{t('settings.liveStt')}</p>
                  <div className="space-y-1.5">
                    {STT_ENGINES.map((e) => (
                      <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:border-primary/40">
                        <input
                          type="radio" name="live-stt" className="mt-0.5"
                          checked={live.sttEngine === e.id}
                          onChange={() => void put({ sttEngine: e.id })}
                        />
                        <span>
                          <span className="block text-xs font-medium">{e.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{e.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold">{t('settings.liveTts')}</p>
                  <div className="space-y-1.5">
                    {TTS_ENGINES.map((e) => (
                      <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:border-primary/40">
                        <input
                          type="radio" name="live-tts" className="mt-0.5"
                          checked={live.ttsEngine === e.id}
                          onChange={() => void put({ ttsEngine: e.id })}
                        />
                        <span>
                          <span className="block text-xs font-medium">{e.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{e.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!serviceAvailable && live.enabled && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                <Server className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {t('settings.liveServiceMissing')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
