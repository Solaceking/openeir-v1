'use client'

// OpenEir — "Talk" view: one persistent conversation with Eir, WhatsApp-style,
// grounded in the user's full health data. Deterministic health intents in the
// user's text surface as in-chat confirmation cards; the composer carries
// dictation; the orb button opens the immersive hands-free voice conversation.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SendHorizontal, Mic, MicOff, AudioLines, Eraser, RefreshCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MessageBubble, type ChatBubbleMessage } from '@/components/talk/message-bubble'
import type { ChatAction } from '@/components/talk/action-card'
import { VoiceMode } from '@/components/talk/voice-mode'
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

export function TalkView() {
  const { t } = useT()
  const SUGGESTIONS = [t('talk.sug1'), t('talk.sug2'), t('talk.sug3'), t('talk.sug4')]
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
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
      if (!res.ok) throw new Error(json?.error ?? 'no_provider')
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
    <div className="flex h-[calc(100vh-var(--shell-chrome,7.5rem))] min-h-[460px] flex-col md:h-[calc(100vh-var(--shell-chrome,7.5rem))]">
      {/* header */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/25 to-teal-500/5 ring-1 ring-teal-500/30">
            <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-300" aria-hidden />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-teal-500 eir-live" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight">{t('talk.title')}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{t('talk.subtitle')}</p>
          </div>
        </div>
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

      {/* thread */}
      <div
        ref={scrollRef}
        className="scroll-slim eir-thread flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-card/40 p-3 sm:p-4"
        role="log"
        aria-live="polite"
        aria-label={t('talk.title')}
      >
        {!loaded && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        {loaded && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/20 to-violet-500/10 ring-1 ring-teal-500/25">
              <Sparkles className="h-9 w-9 text-teal-600 dark:text-teal-300" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">{t('talk.emptyTitle')}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{t('talk.emptyBody')}</p>
            </div>
            <div className="grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="eir-chip rounded-full border bg-card px-3.5 py-2 text-left text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-teal-500/40 hover:text-foreground hover:shadow-sm"
                >
                  {s}
                </button>
              ))}
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/20 to-teal-500/5 ring-1 ring-teal-500/25" aria-hidden>
              <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            </div>
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
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              <RefreshCcw className="h-3 w-3" aria-hidden /> {t('talk.retry')}
            </button>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="pt-3">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setVoiceOpen(true)}
            className="eir-orb-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-105 active:scale-95"
            aria-label={t('talk.voiceMode')}
            title={t('talk.voiceMode')}
          >
            <AudioLines className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-3xl border bg-card p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-teal-500/40">
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
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full shadow-md transition-transform hover:scale-105 active:scale-95"
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
