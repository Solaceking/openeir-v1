'use client'

// OpenEir — immersive voice conversation. A deep, calm scene: Eir's portrait
// presides over a column of rising smoke that stirs when you speak and glows
// when she answers. Hands-free listening, mid-sentence barge-in, neural voice
// replies. The thread keeps updating behind the overlay, so closing it drops
// you straight back into the chat.

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { X, MicOff, AlertTriangle, SendHorizontal, Settings2, AudioLines } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrbCanvas } from '@/components/talk/orb-canvas'
import { useConversation, type ConversationTurn } from '@/hooks/use-conversation'
import { useT } from '@/lib/i18n'
import { useUI } from '@/lib/store'
import { speak } from '@/lib/voice/tts'

let greetedThisSession = false

export function VoiceMode({
  open,
  onClose,
  onTurn,
}: {
  open: boolean
  onClose: () => void
  onTurn: (turn: ConversationTurn) => void
}) {
  const { t, lang } = useT()
  const setView = useUI((s) => s.setView)
  const conv = useConversation(onTurn)
  const [typed, setTyped] = useState('')
  const [smokeSize, setSmokeSize] = useState(340)
  const startedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // the smoke must always leave room for Eir, the captions and the composer —
  // scale it to the viewport instead of pushing content below the fold
  useEffect(() => {
    if (!open) return
    const fit = () => {
      const w = window.innerWidth < 640 ? 300 : 380
      setSmokeSize(Math.max(230, Math.min(w, Math.round(window.innerHeight * 0.42))))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

  // conv is a fresh object every render — route the lifecycle through a ref so
  // effects below don't re-run (and never tear the session down mid-conversation)
  const convRef = useRef(conv)
  useEffect(() => { convRef.current = conv })

  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true
      void convRef.current.start().then(() => {
        // A deterministic hello so the user INSTANTLY hears that voice works —
        // and if audio is blocked, the failure surfaces in the first second,
        // not after they have already spoken into the void. announce() also
        // teaches the echo guard her greeting, so speakers never become turns.
        if (!greetedThisSession) {
          greetedThisSession = true
          const hello = lang.startsWith('de')
            ? 'Ich höre zu — sag einfach weg.'
            : "I'm listening — go ahead."
          convRef.current.announce(hello)
        } else {
          speak(lang.startsWith('de') ? 'Ich bin wieder zuhör.' : "I'm here.", { lang })
        }
      })
    }
    if (!open && startedRef.current) {
      startedRef.current = false
      convRef.current.stop()
    }
  }, [open, lang])

  // closing (or unmounting) the overlay always tears the session down
  useEffect(() => () => {
    if (startedRef.current) {
      startedRef.current = false
      convRef.current.stop()
    }
  }, [])

  const caption =
    conv.state === 'listening' ? t('talk.listening')
    : conv.state === 'thinking' ? (conv.ear === 'server' && conv.capturing ? t('talk.captureHint') : t('talk.thinkingOrb'))
    : conv.state === 'speaking' ? t('talk.speakingOrb')
    : conv.state === 'idle' ? t('talk.idleOrb')
    : ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#06110f]"
          role="dialog"
          aria-modal="true"
          aria-label={t('talk.voiceMode')}
        >
          {/* ambient depth behind the smoke — teal only, flat-brand discipline */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute left-1/2 top-[62%] h-[85vmin] w-[85vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/[0.07] blur-[110px]" />
            <div className="absolute left-1/2 bottom-[-30vmin] h-[45vmin] w-[70vmin] -translate-x-1/2 rounded-full bg-teal-400/[0.05] blur-[90px]" />
          </div>

          <div className="relative z-10 flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              <span className={`h-1.5 w-1.5 rounded-full ${conv.state === 'off' ? 'bg-white/30' : 'bg-teal-300 eir-live'}`} aria-hidden />
              {t('talk.live')}
              {conv.ear === 'server' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[10px] font-semibold text-teal-200">
                  <AudioLines className="h-3 w-3" aria-hidden /> {t('talk.serverEar')}
                </span>
              )}
            </div>
            <Button
              variant="ghost" size="icon"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => { conv.stop(); onCloseRef.current() }}
              aria-label={t('talk.close')}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-6">
            {/* Eir — the mascot presides over the smoke */}
            <div className="relative shrink-0" aria-hidden>
              <div className="eir-breathe h-16 w-16 overflow-hidden rounded-full border-2 border-[#fdfbf5]/25 shadow-none sm:h-20 sm:w-20">
                <Image
                  src="/mascot/eir-round-256.png"
                  alt=""
                  width={80}
                  height={80}
                  priority
                  className="h-full w-full object-cover"
                />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#06110f] ${
                  conv.state === 'speaking' ? 'bg-teal-300'
                  : conv.state === 'thinking' ? 'bg-violet-300'
                  : conv.state === 'listening' ? 'bg-emerald-300 eir-live'
                  : 'bg-white/40'
                }`}
              />
            </div>

            {conv.error && (
              <div className="flex max-w-sm flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {conv.error}
                </span>
                {(conv.error.toLowerCase().includes('provider') || conv.error.toLowerCase().includes('setup')) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 self-start border-amber-400/40 bg-transparent text-amber-100 hover:bg-amber-400/15 hover:text-white"
                    onClick={() => { conv.stop(); onCloseRef.current(); useUI.getState().setSettingsSection('providers'); setView('settings') }}
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden /> {t('talk.openSettings')}
                  </Button>
                )}
              </div>
            )}
            {!conv.error && conv.notice && (
              <div className="flex max-w-sm items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1.5 text-[11px] font-medium text-teal-100">
                <AudioLines className="h-3 w-3 shrink-0" aria-hidden /> {conv.notice}
              </div>
            )}
            {!conv.canListen && (
              <div className="flex max-w-sm items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">
                <MicOff className="h-3.5 w-3.5 shrink-0" aria-hidden /> {t('talk.noListen')}
              </div>
            )}

            {/* the smoke — tap to interrupt while she speaks */}
            <button
              onClick={() => { if (conv.state === 'speaking') conv.interrupt() }}
              className="rounded-3xl outline-none ring-teal-400/40 transition-transform focus-visible:ring-4 active:scale-[0.98]"
              aria-label={conv.state === 'speaking' ? t('talk.interrupt') : caption}
            >
              <OrbCanvas
                state={conv.state === 'off' ? 'idle' : conv.orbState}
                levelRef={conv.levelRef}
                ampRef={conv.ampRef}
                forceDark
                size={smokeSize}
              />
            </button>

            <div className="flex min-h-[64px] max-w-lg flex-col items-center gap-1.5 text-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={caption}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="text-sm font-medium tracking-wide text-white/85"
                >
                  {caption}
                </motion.p>
              </AnimatePresence>
              {conv.interim && (
                <p className="max-w-md text-base leading-relaxed text-white/95">{conv.interim}</p>
              )}
              {/* Voice is never the only channel: every reply is also text. */}
              {conv.lastReply && conv.state === 'speaking' && (
                <div className="mt-1 max-h-36 w-full overflow-y-auto scroll-slim rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('talk.replySeen')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{conv.lastReply}</p>
                </div>
              )}
              {conv.state === 'speaking' && !conv.lastReply && (
                <p className="text-[11px] text-white/40">{t('talk.interruptHint')}</p>
              )}
            </div>

            {/* typed fallback — always available: mic-less devices, blocked
                permissions, previews inside iframes, or simply quiet rooms */}
            <form
              className="mt-1 flex w-full max-w-md items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!typed.trim()) return
                conv.sendTyped(typed.trim())
                setTyped('')
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={conv.canListen ? t('talk.orType') : t('talk.placeholder')}
                aria-label={t('talk.placeholder')}
                className="h-11 flex-1 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/25"
              />
              <Button
                type="submit"
                size="icon"
                className="eir-orb-btn h-11 w-11 shrink-0 rounded-full border-0 text-white"
                disabled={!typed.trim()}
                aria-label={t('talk.send')}
              >
                <SendHorizontal className="h-4.5 w-4.5" aria-hidden />
              </Button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
