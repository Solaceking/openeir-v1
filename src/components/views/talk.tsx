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
  Settings2, Plus, TrendingUp, Activity, HeartPulse, Pill, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { MessageBubble, type ChatBubbleMessage } from '@/components/talk/message-bubble'
import type { ChatAction } from '@/components/talk/action-card'
import { VoiceMode } from '@/components/talk/voice-mode'
import { VoiceCapturePanel } from '@/components/talk/voice-capture'
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

export function TalkView() {
  const { t } = useT()
  const SUGGESTIONS = [t('talk.sug1'), t('talk.sug2'), t('talk.sug3'), t('talk.sug4')]
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
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
          let meta: { detected?: ChatAction; provider?: ChatBubbleMessage['provider'] } = {}
          try { meta = JSON.parse(row.meta ?? '{}') } catch { /* {} */ }
          return {
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            content: row.content,
            channel: row.channel === 'voice' ? 'voice' : 'text',
            createdAt: row.createdAt,
            status: 'sent' as const,
            detected: row.role === 'assistant' ? (meta.detected ?? null) : null,
            provider: meta.provider ?? null,
          }
        })
        setMessages(rows)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => { alive = false }
  }, [])

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
        provider: turn.provider ?? null,
      },
    ])
  }, [])

  // ---- send ----------------------------------------------------------------
  const send = useCallback(async (raw: string, channel: 'text' | 'voice' = 'text') => {
    const text = raw.trim()
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
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channel }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setSendError(json?.error ?? 'Eir could not reach an AI provider.')
        throw new Error(json?.error ?? 'no_provider')
      }
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'sent' as const } : m)))
      setMessages((prev) => [...prev, {
        id: json.replyId as string,
        role: 'assistant',
        content: json.reply as string,
        channel,
        createdAt: new Date().toISOString(),
        status: 'sent' as const,
        detected: (json.detected as ChatAction | undefined) ?? null,
        provider: json.provider ?? null,
        revealLen: 0,
      }])
    } catch {
      lastFailedRef.current = text
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'failed' as const } : m)))
    } finally {
      setSending(false)
    }
  }, [sending])

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
    })
  }, [dictating])

  const clearThread = useCallback(async () => {
    await fetch('/api/chat', { method: 'DELETE' }).catch(() => {})
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
              onClick={() => setView('settings')}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden /> {t('talk.openSettings')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* composer */}
      <div className="pt-3">
        <div className="flex items-end gap-2">
          {/* log by voice — consolidated capture lives here */}
          <Sheet open={captureOpen} onOpenChange={setCaptureOpen}>
            <SheetTrigger asChild>
              <button
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-secondary text-secondary-foreground transition-transform hover:scale-105 active:scale-95"
                aria-label={t('talk.attach')}
                title={t('talk.attach')}
              >
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-safe pt-3 sm:max-w-lg sm:mx-auto">
              <SheetHeader className="pb-1 pt-0">
                <SheetTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <AudioLines className="h-4.5 w-4.5 text-primary" aria-hidden />
                    {t('talk.captureTitle')}
                  </span>
                  <button
                    onClick={() => setCaptureOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-accent"
                    aria-label={t('common.close')}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </SheetTitle>
              </SheetHeader>
              <p className="pb-3 text-xs text-muted-foreground">{t('talk.attachHint')}</p>
              <div className="max-h-[68vh] overflow-y-auto pb-2 scroll-slim">
                <VoiceCapturePanel onDone={() => setCaptureOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

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
            onClick={() => setVoiceOpen(true)}
            aria-label={t('talk.live')}
            title={t('talk.live')}
          >
            <AudioLines className="h-5 w-5" aria-hidden />
          </button>
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
            onClick={() => void send(input)}
            disabled={!input.trim() || sending}
            aria-label={t('talk.send')}
          >
            <SendHorizontal className="h-4.5 w-4.5" aria-hidden />
          </Button>
        </div>
      </div>

      <VoiceMode open={voiceOpen} onClose={() => setVoiceOpen(false)} onTurn={appendTurn} />

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('talk.clearTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('talk.clearDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void clearThread()}>{t('talk.clear')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
