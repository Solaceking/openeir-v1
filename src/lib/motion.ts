// OpenEir — shared spring-physics presets (framer-motion).
// "Game feel" without gamification: every tap, sheet and screen change
// answers with weight and recovery — the register of a well-made physical
// object, never a confetti burst. Respect for reduced motion is applied
// globally via <MotionConfig reducedMotion="user"> in providers.

import type { Transition } from 'framer-motion'

/** Finger press: fast compression, quick release recovery. */
export const springPress: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 0.9 }

/** A completed action settles: brief weighted snap, tiny overshoot. */
export const springSettle: Transition = { type: 'spring', stiffness: 380, damping: 22 }

/** Screen/sheet entrances: calm, never bouncy. */
export const springScreen: Transition = { type: 'spring', stiffness: 300, damping: 32 }

/** Standard props for tappable elements — compress on press, spring back. */
export const tapSpring = {
  whileTap: { scale: 0.96 },
  transition: springPress,
} as const

/** Slightly deeper press for large hero surfaces. */
export const heroTapSpring = {
  whileTap: { scale: 0.94 },
  transition: springPress,
} as const

/** Entrance for content blocks: short rise + fade on a calm spring. */
export const riseIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: springScreen,
} as const
