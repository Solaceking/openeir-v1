// OpenEir — client-side ambient scheduler.
// Headless component mounted once in the app shell. While the app is open it:
//   • triggers the Morning Briefing (server marks delivered + pushes devices)
//   • runs the Nightly Reflection after 21:00 when enabled
// Both are idempotent per calendar day; the server decides, the client just
// nudges — safe to fire every minute and on tab focus.

'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

async function j<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

interface BriefingGet { date: string; deliveredToday: boolean; config: { enabled: boolean; time: string; push: boolean } }
interface MemoryState { lastReflection: string | null; config: { autoReflect: boolean } }

// Per-device guard: the briefing toast may fire at most once per calendar day,
// even if the server keeps reporting "not delivered" (stale cache, old server,
// clock skew). The manual "push to my devices" button is not affected.
const BRIEFING_GUARD = 'briefing.autoDelivered'

export function AmbientScheduler() {
  const qc = useQueryClient()
  const busyRef = useRef(false)

  useEffect(() => {
    let disposed = false

    const tick = async () => {
      if (busyRef.current || disposed || document.visibilityState === 'hidden') return
      busyRef.current = true
      try {
        const now = new Date()
        const today = now.toISOString().slice(0, 10)

        // --- Morning briefing -------------------------------------------
        const b = await j<BriefingGet>('/api/briefing')
        const validTime = typeof b?.config?.time === 'string' && b.config.time.includes(':')
        const alreadyToasted = typeof localStorage !== 'undefined' && localStorage.getItem(BRIEFING_GUARD) === today
        if (b && b.config?.enabled && validTime && !b.deliveredToday && !alreadyToasted) {
          const [bh, bm] = b.config.time.split(':').map(Number)
          const dueMinutes = (bh ?? 8) * 60 + (bm ?? 0)
          const nowMinutes = now.getHours() * 60 + now.getMinutes()
          if (nowMinutes >= dueMinutes) {
            const res = await j<{ briefing: { headline: string } }>('/api/briefing', { method: 'POST', body: JSON.stringify({ push: b.config.push }) })
            if (res && !disposed) {
              try { localStorage.setItem(BRIEFING_GUARD, today) } catch { /* private mode — server 409 still guards */ }
              toast.info(`Morning briefing ready — ${res.briefing.headline}`, {
                id: `briefing-${today}`, // sonner collapses duplicates by id
                description: 'It is on your dashboard, and your devices were notified.',
              })
              qc.invalidateQueries({ queryKey: ['briefing'] })
            }
          }
        }

        // --- Nightly reflection ------------------------------------------
        if (now.getHours() >= 21) {
          const m = await j<MemoryState>('/api/memory')
          if (m && m.config?.autoReflect && m.lastReflection !== today) {
            const res = await j<{ created: boolean }>('/api/memory/reflect', { method: 'POST' })
            if (res?.created && !disposed) {
              qc.invalidateQueries({ queryKey: ['memory'] })
            }
          }
        }
      } catch {
        // Never let a background tick crash the page or log unhandled rejections.
      } finally {
        busyRef.current = false
      }
    }

    const interval = setInterval(tick, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVisible)
    // gentle first run after mount
    const initial = setTimeout(tick, 4_000)

    return () => {
      disposed = true
      clearInterval(interval)
      clearTimeout(initial)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [qc])

  return null
}
