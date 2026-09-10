'use client'

// OpenEir — "Talk" view: one persistent conversation with Eir, grounded in the
// user's full health data. Voice and chat live here together:
//   · the composer carries dictation (mic) and quick sends
//   · "+" opens "Log by voice" — the reading/dose capture flow, in place
//   · the orb opens the immersive hands-free conversation
// Deterministic health intents surface as in-chat confirmation cards.

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import {
  SendHorizontal, Mic, MicOff, AudioLines, Eraser, RefreshCcw, Sparkles,
  Settings2, Plus, TrendingUp, Activity, HeartPulse, Pill, X, MessageSquarePlus, History, FileText, ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResponsiveConfirm } from '@/components/ui/bottom-sheet'
import { MessageBubble, type ChatBubbleMessage } from '@/components/talk/message-bubble'
import type { ChatAction, PendingSnapshot } from '@/components/talk/action-card'
import { VoiceMode } from '@/components/talk/voice-mode'
import { LiveAgentModal } from '@/components/talk/live-agent'
import { AttachSheet, AttachmentChips, type PendingImage, type PendingFile } from '@/components/talk/attach-sheet'
import { PageHeader } from '@/components/page-header'
import { OpenEirLogo } from '@/components/logo'
import { startDictation, speechRecognitionSupported } from '@/lib/voice/stt'
import { useT } from '@/lib/i18n'
import { useUI } from '@/lib/store'
import type { ConversationTurn } from '@/hooks/use-conversation'

interface WireMessage {
  id: string
  role: string
  content: string
  meta: string
  channel: string
  createdAt: string
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today'
  if (dayKey(iso) === dayKey(yest.toISOString())) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

const SUG_ICONS = [TrendingUp, Activity, HeartPulse, Pill]

function parseMeta(raw: string): { detected?: ChatAction; pending?: PendingSnapshot[]; toolEvents?: ChatBubbleMessage['toolEvents']; provider?: ChatBubbleMessage['provider'] } {
  try { return JSON.parse(raw ?? '{}') } catch { return {} }
}

export function TalkView() {
  const { t } = useT()
  const SUGGESTIONS = [t('talk.sug1'), t('talk.sug2'), t('talk.sug3'), t('talk.sug4')]
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [liveAgentOpen, setLiveAgentOpen] = useState(false)
  const [liveAgentAvailable, setLiveAgentAvailable] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessions, setSessions] = useState<Array<{ id: string; count: number; lastAt: string; title: string | null }>>([])
  const [dictating, setDictating] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [voiceAgentRefresh, setVoiceAgentRefresh] = useState(0)
  const stopDictationRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastFailedRef = useRef<string | null>(null)
  const setView = useUI((s) => s.setView)

  // ---- load history --------------------------------------------------------
  useEffect(() => {
    let alive = true
    fetch('/api/chat')
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.messages) { setLoaded(true); return }
        const rows: ChatBubbleMessage[] = (j.messages as WireMessage[]).map((row) => {
          const meta = parseMeta(row.meta)
          return {
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            content: row.content,
            channel: row.channel === 'voice' ? 'voice' : 'text',
            createdAt: row.createdAt,
            status: 'sent' as const,
            detected: row.role === 'assistant' ? (meta.detected ?? null) : null,
            pending: row.role === 'assistant' ? (meta.pending ?? null) : null,
            toolEvents: row.role === 'assistant' ? (meta.toolEvents ?? null) : null,
            provider: meta.provider ?? null,
          }
        })
        setMessages(rows)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => { alive = false }
  }, [])

  // ---- opt-in realtime agent availability (Settings → Providers → Audio) ----
  useEffect(() => {
    let alive = true
    fetch('/api/voice/live')
      .then((r) => r.json())
      .then((j) => {
        if (alive) setLiveAgentAvailable(Boolean(j?.live?.enabled && j?.serviceAvailable))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [voiceAgentRefresh])

  // ---- autoscroll ----------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  // ---- typewriter reveal for the newest assistant bubble -------------------
  useEffect(() => {
    const pending = messages.find((m) => m.role === 'assistant' && m.revealLen !== undefined && m.revealLen < m.content.length)
    if (!pending) return
    const id = window.setInterval(() => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== pending.id || m.revealLen === undefined) return m
        const step = Math.max(2, Math.ceil(m.content.length / 90))
        const next = m.revealLen + step
        return next >= m.content.length ? { ...m, revealLen: undefined } : { ...m, revealLen: next }
      }))
    }, 16)
    return () => window.clearInterval(id)
  }, [messages])

  const appendTurn = useCallback((turn: ConversationTurn) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${turn.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: turn.role,
        content: turn.content,
        channel: 'voice',
        createdAt: new Date().toISOString(),
        status: 'sent' as const,
        detected: (turn.detected as ChatAction | undefined) ?? null,
        pending: (turn.pending as PendingSnapshot[] | undefined) ?? null,
        toolEvents: (turn.toolEvents as ChatBubbleMessage['toolEvents']) ?? null,
        provider: turn.provider ?? null,
      },
    ])
  }, [])

  // ---- send ----------------------------------------------------------------
  const send = useCallback(async (raw: string, channel: 'text' | 'voice' = 'text') => {
    const text = raw.trim() || (pendingImages.length || pendingFile ? "Take a look at this" : '')
    if (!text || sending) return
    lastFailedRef.current = null
    setSendError(null)
    setInput('')
    const tmpId = `tmp-${Date.now()}`
    setMessages((prev) => [...prev, {
      id: tmpId, role: 'user', content: text, channel,
      createdAt: new Date().toISOString(), status: 'sending',
    }])
    setSending(true)
    const images = pendingImages.length
      ? pendingImages.map(({ previewUrl, ...rest }) => rest)
      : undefined
    const fileText = pendingFile ? { name: pendingFile.name, excerpt: pendingFile.excerpt } : undefined
    const body = JSON.stringify({ text, channel, sessionId: sessionId ?? undefined, images, fileText })
    const liveBubble = {
      id: `live-${tmpId}`,
      role: 'assistant' as const,
      content: '',
      channel,
      createdAt: new Date().toISOString(),
      status: 'sent' as const,
      detected: null,
      pending: null as PendingSnapshot[] | null,
      toolEvents: null as ChatBubbleMessage['toolEvents'],
      provider: null,
    }
    let bubbleAdded = false
    try {
      // streaming first — token-by-token with live tool events; the buffered
      // endpoint remains the fallback for proxies that break SSE
      const res = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const isSse = (res.headers.get('content-type') ?? '').includes('text/event-stream')
      if (!res.ok || !isSse || !res.body) {
        if (!res.ok && !isSse) {
          const j = await res.json().catch(() => null)
          throw new Error(j?.error ?? 'stream_unavailable')
        }
        return bufferedSend(body)
      }
      setPendingImages([])
      setPendingFile(null)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let failed = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          let ev: Record<string, unknown>
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          if (ev.type === 'delta') {
            const chunk = String(ev.text ?? '')
            if (!chunk) continue
            if (!bubbleAdded) {
              bubbleAdded = true
              setMessages((prev) => [...prev, { ...liveBubble, content: chunk }])
            } else {
              setMessages((prev) => prev.map((m) => (m.id === liveBubble.id ? { ...m, content: m.content + chunk } : m)))
            }
          } else if (ev.type === 'tool') {
            const arrived = ev.event as ChatBubbleMessage['toolEvents']
            setMessages((prev) => prev.map((m) => (m.id === liveBubble.id ? { ...m, toolEvents: [...(m.toolEvents ?? []), ...(Array.isArray(arrived) ? arrived : [])] } : m)))
          } else if (ev.type === 'pending') {
            const p = ev.action as PendingSnapshot
            setMessages((prev) => prev.map((m) => (m.id === liveBubble.id ? { ...m, pending: [...(m.pending ?? []), p] } : m)))
          } else if (ev.type === 'done') {
            setMessages((prev) => prev.map((m) => (m.id === liveBubble.id ? {
              ...m,
              id: String(ev.replyId ?? m.id),
              provider: (ev.provider as ChatBubbleMessage['provider']) ?? null,
              pending: ((ev.pending as PendingSnapshot[]) ?? m.pending) ?? null,
              toolEvents: (ev.toolEvents as ChatBubbleMessage['toolEvents']) ?? m.toolEvents,
            } : m)))
            if (ev.sessionId) setSessionId(String(ev.sessionId))
          } else if (ev.type === 'error') {
            setSendError(String(ev.error ?? 'Eir could not reach an AI provider.'))
            failed = true
          }
        }
      }
      if (failed) throw new Error('stream_error')
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'sent' as const } : m)))
    } catch {
      // buffered fallback — same body, classic endpoint (also covers SSE-less proxies)
      try {
        await bufferedSend(body)
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'sent' as const } : m)))
        setPendingImages([])
        setPendingFile(null)
      } catch {
        lastFailedRef.current = text
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'failed' as const } : m)))
      }
    } finally {
      setSending(false)
    }

    async function bufferedSend(bodyText: string) {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyText })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setSendError(json?.error ?? 'Eir could not reach an AI provider.')
        throw new Error(json?.error ?? 'no_provider')
      }
      if (json.sessionId) setSessionId(json.sessionId)
      setMessages((prev) => [...prev, {
        id: json.replyId as string,
        role: 'assistant',
        content: json.reply as string,
        channel,
        createdAt: new Date().toISOString(),
        status: 'sent' as const,
        detected: (json.detected as ChatAction | undefined) ?? null,
        pending: (json.pending as PendingSnapshot[] | undefined) ?? null,
        toolEvents: (json.toolEvents as ChatBubbleMessage['toolEvents']) ?? null,
        provider: json.provider ?? null,
        revealLen: 0,
      }])
    }
  }, [sending, pendingImages, pendingFile])

  const retry = useCallback(() => {
    if (lastFailedRef.current) void send(lastFailedRef.current)
  }, [send])

  // ---- dictation into the composer -----------------------------------------
  const toggleDictation = useCallback(() => {
    if (dictating) { stopDictationRef.current?.(); return }
    setDictating(true)
    stopDictationRef.current = startDictation({
      onPartial: (interim, final) => {
        setInput((prev) => {
          const base = prev.replace(/\s*(…)?$/, '')
          return `${base} ${final || interim}`.trim()
        })
      },
      onFinal: (text) => setInput((prev) => `${prev.replace(/\s*(…)?$/, '')} ${text}`.trim()),
      onError: () => setDictating(false),
      onEnd: () => setDictating(false),
    }, useUI.getState().sttLang !== 'auto' ? useUI.getState().sttLang : 'en')
  }, [dictating])

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/chat/sessions')
      const j = await r.json()
      if (j?.sessions) setSessions(j.sessions)
    } catch { /* non-fatal */ }
  }, [])

  const openSession = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/chat?sessionId=${encodeURIComponent(id)}`)
      const j = await r.json()
      const rows: ChatBubbleMessage[] = ((j?.messages ?? []) as WireMessage[]).map((row) => {
        const meta = parseMeta(row.meta)
        return {
          id: row.id,
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: row.content,
          channel: row.channel === 'voice' ? 'voice' : 'text',
          createdAt: row.createdAt,
          status: 'sent' as const,
          detected: row.role === 'assistant' ? (meta.detected ?? null) : null,
          pending: row.role === 'assistant' ? (meta.pending ?? null) : null,
          toolEvents: row.role === 'assistant' ? (meta.toolEvents ?? null) : null,
          provider: meta.provider ?? null,
        }
      })
      setSessionId(id)
      setMessages(rows)
      setHistoryOpen(false)
    } catch { /* non-fatal */ }
  }, [])

  const clearThread = useCallback(async () => {
    await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId ?? '')}`, { method: 'DELETE' }).catch(() => {})
    setMessages([])
    setClearOpen(false)
  }, [])

  const lastDayRef = useRef<string | null>(null)

  return (
    <div className="flex h-[calc(100dvh-var(--shell-chrome,7.5rem))] min-h-[460px] flex-col">
      <PageHeader
        view="talk"
        title={t('talk.title')}
        subtitle={t('talk.subtitle')}
        icon={OpenEirLogo}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={t('talk.newChat')} title={t('talk.newChat')} onClick={() => { setSessionId(null); setMessages([]); }}>
              <MessageSquarePlus className="h-4.5 w-4.5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t('talk.history')} title={t('talk.history')} onClick={() => { void loadSessions(); setHistoryOpen(true) }}>
              <History className="h-4.5 w-4.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('talk.options')}>
                  <Eraser className="h-4.5 w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setClearOpen(true)} className="text-destructive focus:text-destructive">
                  <Eraser className="mr-2 h-4 w-4" /> {t('talk.clear')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* thread */}
      <div
        ref={scrollRef}
        className="scroll-slim eir-thread mt-2 flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-card/40 p-3 sm:p-4"
        role="log"
        aria-live="polite"
        aria-label={t('talk.title')}
      >
        {!loaded && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        {loaded && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <Image
                src="/mascot/eir-256.png"
                alt="Eir"
                width={96}
                height={96}
                className="h-24 w-24 rounded-full border border-border object-cover"
                priority
              />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card" aria-hidden>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">{t('talk.emptyTitle')}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{t('talk.emptyBody')}</p>
            </div>
            <div className="grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => {
                const I = SUG_ICONS[i % SUG_ICONS.length]
                return (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="eir-chip flex min-h-[44px] items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2 text-left text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
                  >
                    <I className="h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                    <span className="flex-1">{s}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const key = dayKey(m.createdAt)
          const showDay = key !== lastDayRef.current
          lastDayRef.current = key
          return (
            <div key={m.id} className="space-y-3">
              {showDay && (
                <div className="flex justify-center py-1">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <MessageBubble m={m} />
            </div>
          )
        })}
        {sending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2.5">
            <OpenEirLogo className="eir-breathe h-8 w-8" aria-hidden />
            <div className="eir-bubble-eir flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3" aria-label={t('talk.thinking')}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="eir-dot" style={{ animationDelay: `${i * 160}ms` }} aria-hidden />
              ))}
            </div>
          </motion.div>
        )}
        {lastFailedRef.current && !sending && (
          <div className="flex justify-center">
            <button
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-full border border-metric/50 bg-metric/15 px-3.5 py-1.5 text-xs font-medium text-metric-foreground"
            >
              <RefreshCcw className="h-3 w-3" aria-hidden /> {t('talk.retry')}
            </button>
          </div>
        )}
      </div>

      {/* actionable failure banner — never a silent dead end */}
      <AnimatePresence>
        {sendError && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-metric/50 bg-metric/15 px-3.5 py-2.5"
          >
            <p className="min-w-0 text-xs leading-relaxed text-metric-foreground">{sendError}</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5 border-metric/50 text-metric-foreground hover:bg-metric/20"
              onClick={() => { useUI.getState().setSettingsSection('providers'); setView('settings') }}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden /> {t('talk.openSettings')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* composer */}
      <div className="pt-3">
        <AttachmentChips
          images={pendingImages}
          file={pendingFile}
          onRemoveImage={(i) => setPendingImages((prev) => prev.filter((_, x) => x !== i))}
          onRemoveFile={() => setPendingFile(null)}
        />
        <div className="flex items-end gap-2">
          {/* attach — image (photo/scan) or file (pdf/text) */}
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-secondary text-secondary-foreground transition-transform hover:scale-105 active:scale-95"
            onClick={() => setAttachOpen(true)}
            aria-label={t('talk.attach')}
            title={t('talk.attach')}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>

          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-3xl border bg-card p-1.5 focus-within:ring-2 focus-within:ring-primary/35">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              rows={1}
              placeholder={t('talk.placeholder')}
              aria-label={t('talk.placeholder')}
              className="scroll-slim max-h-28 min-h-[36px] w-full resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 112)}px`
              }}
            />
            <Button
              variant="ghost" size="icon"
              className={`h-9 w-9 shrink-0 rounded-full ${dictating ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'}`}
              onClick={toggleDictation}
              aria-label={dictating ? t('talk.stopDictation') : t('talk.dictate')}
            >
              {dictating
                ? <Mic className="h-4.5 w-4.5 animate-pulse" />
                : speechRecognitionSupported()
                  ? <Mic className="h-4.5 w-4.5" />
                  : <MicOff className="h-4.5 w-4.5" />}
            </Button>
          </div>
          {/* live voice conversation — right where you'd reach for it,
              exactly like the big chat apps: beside the input, one tap */}
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground transition-transform hover:scale-105 hover:bg-primary/90 active:scale-95"
            onClick={() => (liveAgentAvailable ? setLiveAgentOpen(true) : setVoiceOpen(true))}
            aria-label={t('talk.live')}
            title={t('talk.live')}
          >
            <AudioLines className="h-5 w-5" aria-hidden />
          </button>
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
            onClick={() => void send(input)}
            disabled={(!input.trim() && !pendingImages.length && !pendingFile) || sending}
            aria-label={t('talk.send')}
          >
            <SendHorizontal className="h-4.5 w-4.5" aria-hidden />
          </Button>
        </div>
      </div>

      <VoiceMode open={voiceOpen} onClose={() => setVoiceOpen(false)} onTurn={appendTurn} />

      {/* opt-in Pipecat realtime session — only reachable when the user
          explicitly enabled Live conversation AND the voice profile runs */}
      <LiveAgentModal open={liveAgentOpen} onClose={() => { setLiveAgentOpen(false); setVoiceAgentRefresh((n) => n + 1) }} />

      <AttachSheet
        open={attachOpen}
        onOpenChange={setAttachOpen}
        onImage={(img) => setPendingImages((prev) => [...prev, img].slice(0, 3))}
        onFile={(f) => setPendingFile(f)}
      />

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label={t('talk.history')}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label={t('common.close')} onClick={() => setHistoryOpen(false)} />
          <div className="relative max-h-[70vh] w-full overflow-y-auto rounded-t-3xl border bg-card p-4 shadow-xl sm:max-w-md sm:rounded-3xl scroll-slim">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> {t('talk.history')}</h2>
              <button onClick={() => setHistoryOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-accent" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {sessions.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{t('talk.historyEmpty')}</p>}
            <div className="space-y-1.5">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void openSession(s.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-primary/40 ${s.id === sessionId ? 'border-primary/50 bg-primary/5' : 'bg-background'}`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary/70" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{s.title ?? t('talk.untitledChat')}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {new Date(s.lastAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {s.count} {t('talk.messagesCount')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ResponsiveConfirm
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('talk.clearTitle')}
        description={t('talk.clearDesc')}
        confirmLabel={t('talk.clear')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void clearThread()}
        destructive
      />
    </div>
  )
}
