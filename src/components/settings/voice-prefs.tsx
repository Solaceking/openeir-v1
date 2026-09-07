'use client'

// OpenEir — voice preferences (Settings → Voice & audio).
// Per-device TTS engine, neural voice catalog, speaking rate, auto-readbacks.

import { useEffect, useRef, useState } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useMedications } from '@/lib/api-client'
import { DEFAULT_EDGE_VOICE, useUI } from '@/lib/store'
import { speak, stopSpeaking } from '@/lib/voice/tts'
import { useT } from '@/lib/i18n'
import { SttRoutingEditor } from '@/components/settings/stt-routing'

const PREVIEW_TEXT = 'Blood pressure one twenty-two over seventy-eight, pulse sixty-four. Everything looks steady today.'

interface CatalogVoice { id: string; label: string; gender: 'Female' | 'Male'; accent: string; note?: string }

export function VoicePrefsSection() {
  const { t } = useT()
  useMedications() // kept warm so the capture sheet opens instantly
  const { voiceAutoSpeak, voiceRate, voiceEngine, edgeVoice, sttEar, setVoicePrefs } = useUI()
  const [voices, setVoices] = useState<CatalogVoice[]>([])
  const [previewing, setPreviewing] = useState(false)
  const previewRef = useRef(false)

  useEffect(() => {
    let alive = true
    fetch('/api/voice/tts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { voices?: CatalogVoice[] } | null) => { if (alive && d?.voices) setVoices(d.voices) })
      .catch(() => { /* picker stays empty; engine falls back to browser voice */ })
    return () => { alive = false; stopSpeaking() }
  }, [])

  const accents = [...new Set(voices.map((x) => x.accent))]

  const preview = () => {
    if (previewRef.current) { stopSpeaking(); previewRef.current = false; setPreviewing(false); return }
    previewRef.current = true
    setPreviewing(true)
    speak(PREVIEW_TEXT, {
      engine: 'edge',
      edgeVoice: edgeVoice ?? DEFAULT_EDGE_VOICE,
      rate: voiceRate,
      onEnd: () => { previewRef.current = false; setPreviewing(false) },
      onError: () => { previewRef.current = false; setPreviewing(false) },
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="v-autospeak" className="text-sm">{t('voice.autoSpeak')}</Label>
          <Switch id="v-autospeak" checked={voiceAutoSpeak} onCheckedChange={(c) => setVoicePrefs({ voiceAutoSpeak: c })} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="v-engine" className="text-sm">{t('voice.engine')}</Label>
            <Select value={voiceEngine} onValueChange={(x) => setVoicePrefs({ voiceEngine: x as 'edge' })}>
              <SelectTrigger id="v-engine" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="edge">{t('voice.engineEdge')}</SelectItem>
                <SelectItem value="browser">{t('voice.engineBrowser')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {voiceEngine === 'edge' ? t('voice.engineEdgeHint') : t('voice.engineBrowserHint')}
            </p>
          </div>
          <div>
            <Label htmlFor="v-edgevoice" className="text-sm">{t('voice.voiceName')}</Label>
            <Select
              value={edgeVoice || DEFAULT_EDGE_VOICE}
              onValueChange={(x) => setVoicePrefs({ edgeVoice: x })}
              disabled={voiceEngine !== 'edge' || voices.length === 0}
            >
              <SelectTrigger id="v-edgevoice" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {accents.map((accent) => (
                  <SelectGroup key={accent}>
                    <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{accent}</SelectLabel>
                    {voices.filter((x) => x.accent === accent).map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label} · {x.gender}{x.note ? ` — ${x.note}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {voiceEngine === 'edge' && (
              <Button variant="outline" size="sm" onClick={preview} className="mt-2 gap-1.5">
                {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
                {previewing ? t('voice.previewing') : t('voice.preview')}
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('voice.rate')}</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{voiceRate.toFixed(1)}×</span>
          </div>
          <Slider value={[voiceRate]} min={0.6} max={1.6} step={0.1} onValueChange={(x) => setVoicePrefs({ voiceRate: x[0] })} className="mt-2 max-w-xs" aria-label={t('voice.rate')} />
        </div>

        {/* ---- Speech recognition (STT) provider selection ---- */}
        <div className="rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Speech recognition</Label>
            <span className="text-[11px] text-muted-foreground">which engine types your words</span>
          </div>
          <Select value={sttEar} onValueChange={(x) => setVoicePrefs({ sttEar: x as 'auto' | 'webspeech' | 'server' })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic — browser first, server as backup</SelectItem>
              <SelectItem value="webspeech">Browser only — audio never leaves this device</SelectItem>
              <SelectItem value="server">My server — self-hosted Whisper / own STT stack</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {sttEar === 'auto' && 'Best of both: the browser engine (if available) transcribes instantly; your server takes over when it is missing or blocked.'}
            {sttEar === 'webspeech' && 'Maximum privacy: transcription runs in the browser (Chrome/Edge/Safari). Firefox will not be able to listen.'}
            {sttEar === 'server' && 'Everything you say is sent to your own speech stack (Settings → AI providers route it). Pick the backend under "Transcription order" below.'}
          </p>

          <div className="mt-3 border-t border-border/60 pt-3">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Transcription order (server side)</Label>
            <SttRoutingEditor />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">{t('voice.privacyNote')}</p>
      </CardContent>
    </Card>
  )
}
