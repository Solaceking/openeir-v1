'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { OrbEngine, type OrbState } from '@/lib/voice/orb-engine'

/** WebGL orb with graceful CSS fallback when WebGL is unavailable. */
export function OrbCanvas({
  state,
  levelRef,
  ampRef,
  size = 300,
  className = '',
  forceDark = false,
}: {
  state: OrbState
  levelRef: React.RefObject<number>
  ampRef: React.RefObject<number>
  size?: number
  className?: string
  /** the immersive voice scene is always deep-space, regardless of app theme */
  forceDark?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<OrbEngine | null>(null)
  const [webgl, setWebgl] = useState(true)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new OrbEngine()
    const ok = engine.attach(canvas)
    engineRef.current = engine
    setWebgl(ok)
    if (!ok) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setReducedMotion(reduced)
    return () => { engine.destroy(); engineRef.current = null }
  }, [])

  useEffect(() => { engineRef.current?.setState(state) }, [state])
  useEffect(() => { engineRef.current?.setTheme(forceDark || resolvedTheme === 'dark') }, [resolvedTheme, forceDark])

  // feed the orb real signals at display rate
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      engineRef.current?.setLevel(levelRef.current ?? 0)
      engineRef.current?.setAmp(ampRef.current ?? 0)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [levelRef, ampRef])

  if (!webgl) {
    // CSS fallback orb — still state-reactive at the color level
    const tint =
      state === 'listening' ? 'from-teal-400 to-cyan-300'
      : state === 'thinking' ? 'from-violet-500 to-fuchsia-400'
      : state === 'speaking' ? 'from-teal-300 to-emerald-200'
      : 'from-teal-600 to-teal-400'
    return (
      <div className={`relative items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${tint} opacity-80 blur-md`} aria-hidden />
        <div className={`absolute inset-3 rounded-full bg-gradient-to-br ${tint} animate-pulse`} aria-hidden />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
