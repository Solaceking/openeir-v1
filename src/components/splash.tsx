'use client'

// OpenEir — splash screen. Cream paper, Eir's round portrait held by a living
// ring: a teal arc rolls endlessly around her, a warm spark orbits the other
// way, and she breathes. Shown while the profile hydrates.

import { useEffect, useState } from 'react'
import Image from 'next/image'

const HINTS = [
  'Preparing your health companion…',
  'Waking Eir…',
  'Reading your latest vitals…',
]

// ring geometry — viewBox 120, track r=57 → circumference ≈ 358
const R = 57
const C = 2 * Math.PI * R // ≈ 358.1

export function Splash() {
  const [hint, setHint] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setHint((h) => (h + 1) % HINTS.length), 2600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background" role="status" aria-label="OpenEir is starting">
      {/* faint heritage frame — two hairlines, flat */}
      <div className="pointer-events-none absolute inset-x-6 inset-y-5 rounded-2xl border border-border/60 sm:inset-x-10 sm:inset-y-7" aria-hidden />

      <div className="eir-splash-logo relative h-32 w-32">
        {/* track + rolling arc — the ring itself rolls around Eir */}
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" className="stroke-primary/15" strokeWidth="1.5" />
          <circle
            cx="60" cy="60" r={R} fill="none"
            className="eir-ring-main stroke-primary"
            strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${C * 0.27} ${C * 0.73}`}
          />
          <circle
            cx="60" cy="60" r={R} fill="none"
            className="eir-ring-echo stroke-primary/40"
            strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray={`${C * 0.1} ${C * 0.9}`}
          />
        </svg>

        {/* orbiting spark — Eir's pulse, the amber of her leaf, going the other way */}
        <svg viewBox="0 0 120 120" className="eir-ring-orbit absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="60" cy="3" r="3.2" fill="#F2A65A" />
        </svg>

        {/* Eir, breathing */}
        <div className="eir-breathe absolute inset-[11px] overflow-hidden rounded-full">
          <Image src="/mascot/eir-round-256.png" alt="Eir" width={112} height={112} priority className="h-full w-full object-cover" />
        </div>
      </div>

      <div className="eir-splash-word mt-7 text-center">
        <h1 className="font-display text-4xl font-medium tracking-tight text-foreground">OpenEir</h1>
        <p className="mt-1 font-display text-sm italic text-muted-foreground">Your health, understood.</p>
      </div>

      {/* one hairline track + sliding teal mark */}
      <div className="eir-splash-tag mt-10 w-44">
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="eir-splash-bar h-full w-1/4 rounded-full bg-primary" />
        </div>
        <p className="mt-3 h-4 text-center text-[11px] text-muted-foreground transition-opacity" aria-live="polite">
          {HINTS[hint]}
        </p>
      </div>
    </div>
  )
}
