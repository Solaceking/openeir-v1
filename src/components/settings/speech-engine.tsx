'use client'

// OpenEir — Settings → Providers → Audio → "Speech engine" (STT).
// Inspired by classic local-transcription apps: a global-model picker, an
// honest engine library (installed vs coming-soon), language choice, and a
// device configuration card with a live input meter and a test sound.
//
// Honesty rules: every "Installed" row maps to a real, working engine in this
// app. Every "Coming soon" row is a model family we intend to ship one-click
// downloads for — never a fake install button.

import { useEffect, useRef, useState } from 'react'
import {
  Mic, MonitorSpeaker, Volume2, AudioWaveform, Info,
  HardDriveDownload, Cpu, Globe, Play, Square,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUI } from '@/lib/store'
import { speechRecognitionSupported, sttBrowserFamily } from '@/lib/voice/stt'
import { SttRoutingEditor } from '@/components/settings/stt-routing'
import { toast } from 'sonner'

// ---------------- Global ear + language ----------------

const EAR_OPTIONS: { value: 'auto' | 'webspeech' | 'server'; label: string; hint: string }[] = [
  {
    value: 'auto',
    label: 'Automatic routing',
    hint: 'Browser transcribes instantly; your server takes over when it is missing or blocked.',
  },
  {
    value: 'webspeech',
    label: 'Browser only — on-device',
    hint: 'Audio never leaves this device. Firefox cannot listen — the typed fallback keeps working.',
  },
  {
    value: 'server',
    label: 'My server — self-hosted',
    hint: 'Every word goes to your own Whisper stack. Configure it below.',
  },
]

const LANG_CHOICES = [
  { value: 'auto', label: 'Auto — follow app language' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'de-DE', label: 'Deutsch (German)' },
  { value: 'fr-FR', label: 'Français (French)' },
  { value: 'es-ES', label: 'Español (Spanish)' },
  { value: 'pt-BR', label: 'Português (Brazil)' },
  { value: 'it-IT', label: 'Italiano (Italian)' },
  { value: 'nl-NL', label: 'Nederlands (Dutch)' },
  { value: 'pl-PL', label: 'Polski (Polish)' },
  { value: 'tr-TR', label: 'Türkçe (Turkish)' },
  { value: 'ru-RU', label: 'Русский (Russian)' },
  { value: 'ar-SA', label: 'العربية (Arabic)' },
  { value: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { value: 'zh-CN', label: '中文 (Mandarin)' },
  { value: 'ja-JP', label: '日本語 (Japanese)' },
  { value: 'ko-KR', label: '한국어 (Korean)' },
]

function EarPicker() {
  const { sttEar, setVoicePrefs } = useUI()
  const family = sttBrowserFamily()
  const supported = speechRecognitionSupported()
  const best = !supported ? 'your server' : family === 'chromium' ? 'Browser (on-device)' : 'Automatic routing'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label className="text-sm">Global model — who transcribes your audio</Label>
        <span className="text-[11px] text-muted-foreground">Best for this device: {best}</span>
      </div>
      <div className="grid gap-2">
        {EAR_OPTIONS.map((opt) => {
          const active = sttEar === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVoicePrefs({ sttEar: opt.value })}
              aria-pressed={active}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                active ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-accent/50'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? 'border-primary' : 'border-muted-foreground/40'
                }`}
                aria-hidden
              >
                {active && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {opt.label}
                  {opt.value === 'webspeech' && (supported
                    ? <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">Built-in · detected</Badge>
                    : <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">Not in this browser</Badge>)}
                  {opt.value === 'auto' && <Badge variant="outline" className="text-[10px] text-primary">Recommended</Badge>}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------- Engine library ----------------

interface FamilyRow {
  key: string
  family: string
  note: string
  size: string
  speed: string
  accuracy: string
  state: 'installed' | 'soon' | 'configure'
}

/** Installed engines first, then the road-mapped local-download families. */
function libraryRows(serverConfigured: boolean): FamilyRow[] {
  return [
    { key: 'webspeech', family: 'Web Speech (your browser)', note: 'Instant transcription built into Chrome, Edge and Safari. Nothing to install.', size: '0 MB', speed: 'Very fast', accuracy: 'Good', state: 'installed' },
    { key: 'server-whisper', family: 'Whisper — self-hosted server', note: 'Point OpenEir at any OpenAI-compatible Whisper server (faster-whisper, whisper.cpp server, Groq…).', size: 'your model', speed: 'Fast', accuracy: 'Very high', state: serverConfigured ? 'installed' : 'configure' },
    { key: 'moonshine-tiny', family: 'Moonshine Tiny', note: 'Smallest and quickest to start — on-device ONNX.', size: '26 MB', speed: 'Very fast', accuracy: 'Good', state: 'soon' },
    { key: 'moonshine-base', family: 'Moonshine Base', note: 'The sweet spot for always-on listening.', size: '60 MB', speed: 'Very fast', accuracy: 'Very high', state: 'soon' },
    { key: 'parakeet', family: 'Parakeet CTC 0.6B', note: 'NVIDIA Conformer CTC, English-only.', size: '583 MB', speed: 'Fast', accuracy: 'Very high', state: 'soon' },
    { key: 'nemotron', family: 'Nemotron 3.5 ASR Streaming', note: 'NVIDIA FastConformer-RNNT, real streaming, multilingual.', size: '793 MB', speed: 'Fast', accuracy: 'High', state: 'soon' },
    { key: 'distil-small', family: 'Distil-Whisper Small EN', note: 'Compressed Whisper, near-equal accuracy.', size: '164 MB', speed: 'Very fast', accuracy: 'High', state: 'soon' },
    { key: 'distil-medium', family: 'Distil-Whisper Medium EN', note: 'Compressed Whisper, near-equal accuracy.', size: '383 MB', speed: 'Fast', accuracy: 'Very high', state: 'soon' },
    { key: 'distil-large', family: 'Distil-Whisper Large v3', note: 'Compressed Whisper, near-equal accuracy.', size: '731 MB', speed: 'Medium', accuracy: 'Very high', state: 'soon' },
  ]
}

function EngineLibrary({ serverConfigured, onSetupServer }: { serverConfigured: boolean; onSetupServer: () => void }) {
  const rows = libraryRows(serverConfigured)
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium"><HardDriveDownload className="h-4 w-4 text-primary" aria-hidden /> Model library</div>
        <span className="text-[11px] text-muted-foreground">2 engines work today · local downloads are on the roadmap</span>
      </div>
      <div className="mt-2 divide-y divide-border/40">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.family}
                {r.state === 'installed' && <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">Installed</Badge>}
                {r.state === 'configure' && <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">Not configured</Badge>}
                {r.state === 'soon' && <Badge variant="outline" className="text-[10px] text-muted-foreground">Coming soon</Badge>}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.note}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 inline-flex items-center gap-1"><HardDriveDownload className="h-3 w-3" aria-hidden />{r.size}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 inline-flex items-center gap-1"><AudioWaveform className="h-3 w-3" aria-hidden />{r.speed}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 inline-flex items-center gap-1"><Cpu className="h-3 w-3" aria-hidden />{r.accuracy}</span>
              </div>
            </div>
            {r.state === 'configure' && (
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={onSetupServer}>Set up</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- Speech recognition card ----------------

export function SpeechEngineSection() {
  const { sttEar, sttLang, setVoicePrefs } = useUI()
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null)
  const [showRouting, setShowRouting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/voice/stt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { routing?: { order?: string[]; localUrl?: string } } | null) => {
        if (alive && d?.routing) {
          const configured = Boolean(d.routing.localUrl)
          setServerConfigured(configured)
          if (configured) setShowRouting(true)
        }
      })
      .catch(() => { if (alive) setServerConfigured(false) })
    return () => { alive = false }
  }, [])

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold">Speech engine — how Eir hears you</span>
        </div>

        <EarPicker />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="stt-lang" className="flex items-center gap-1.5 text-sm"><Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Language</Label>
            <Select value={sttLang} onValueChange={(v) => setVoicePrefs({ sttLang: v })}>
              <SelectTrigger id="stt-lang" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {LANG_CHOICES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {sttLang === 'auto' ? 'Auto follows the app language (English today).' : 'Applies to the browser ear; your Whisper server can also force its own model language.'}
            </p>
          </div>
        </div>

        <EngineLibrary
          serverConfigured={serverConfigured === true}
          onSetupServer={() => { setShowRouting(true); setVoicePrefs({ sttEar: 'server' }) }}
        />

        {(showRouting || sttEar === 'server') && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Server ear — transcription order</Label>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowRouting(false)}>hide</Button>
            </div>
            <SttRoutingEditor />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Audio configuration (devices) ----------------

/** Tiny WAV blob (16-bit PCM, 8 kHz mono) — two soft tones, ~0.4 s. */
function makeChimeDataUri(): string {
  const rate = 8000
  const dur = 0.4
  const n = Math.floor(rate * dur)
  const bytes = new Uint8Array(44 + n * 2)
  const dv = new DataView(bytes.buffer)
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  writeStr(36, 'data'); dv.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const freq = t < 0.2 ? 880 : 660
    const env = Math.min(1, i / 200) * Math.max(0, 1 - t / dur)
    const s = Math.round(Math.sin(2 * Math.PI * freq * t) * env * 0.6 * 32767)
    dv.setInt16(44 + i * 2, s, true)
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return `data:audio/wav;base64,${btoa(bin)}`
}

const SINK_SUPPORTED = typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

export function AudioDevicesCard() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [inputId, setInputId] = useState<string>('default')
  const [outputId, setOutputId] = useState<string>('default')
  const [level, setLevel] = useState(0)
  const [metering, setMetering] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [granted, setGranted] = useState(false)

  const stopMeter = () => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setMetering(false)
    setLevel(0)
  }

  const startMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: inputId === 'default' ? undefined : { exact: inputId } } })
      setGranted(true)
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices(list.filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput'))
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      let raf = 0
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128)
        setLevel(Math.round(peak * 100))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      setMetering(true)
      cleanupRef.current = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close().catch(() => {})
      }
    } catch {
      toast.error('Microphone unavailable', { description: 'Allow mic access in the browser bar to use the level meter and device labels.' })
      setMetering(false)
    }
  }

  useEffect(() => () => { cleanupRef.current?.() }, [])

  const testSound = async () => {
    try {
      if (!audioRef.current) audioRef.current = new Audio()
      const el = audioRef.current
      el.src = makeChimeDataUri()
      if (SINK_SUPPORTED && outputId !== 'default') {
        try { await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(outputId) } catch { /* falls back to system default */ }
      }
      await el.play()
    } catch {
      toast.error('Could not play the test sound')
    }
  }

  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MonitorSpeaker className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold">Audio configuration</span>
          </div>
          <span className="text-[11px] text-muted-foreground">manage input & output devices</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dev-in" className="text-sm">Input device</Label>
            <Select value={inputId} onValueChange={setInputId}>
              <SelectTrigger id="dev-in"><SelectValue placeholder="Default microphone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default microphone</SelectItem>
                {inputs.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}…`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Input level {metering ? '— speak now' : ''}</span>
                <span className="tabular-nums">{metering ? `${level}%` : ''}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${metering ? level : 0}%` }} />
              </div>
              {metering ? (
                <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={stopMeter}>
                  <Square className="h-3 w-3" aria-hidden /> Stop level test
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => void startMeter()}>
                  <Mic className="h-3 w-3" aria-hidden /> Start level test
                </Button>
              )}
            </div>
            {!granted && (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                Device labels appear after you allow microphone access — the level test asks once and never records.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dev-out" className="text-sm">Output device</Label>
            <Select value={outputId} onValueChange={setOutputId}>
              <SelectTrigger id="dev-out"><SelectValue placeholder="System default speaker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default speaker</SelectItem>
                {outputs.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 6)}…`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!SINK_SUPPORTED && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This browser cannot pick a specific speaker — Eir plays on the system default. Chrome and Edge can.
              </p>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void testSound()}>
              <Volume2 className="h-3.5 w-3.5" aria-hidden /> <Play className="h-3 w-3" aria-hidden /> Test sound
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
