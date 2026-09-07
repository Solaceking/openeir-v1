'use client'

// OpenEir — brand mark. The apothecary cross: two teal pills over a cream
// vitality node, exactly as the founder's app icon. Flat vector, uniform
// rounding, no shadows. Use on any surface — the cream node reads as a
// punched hole on cream paper and glows on teal.
//
// (The full icon with the cream tile pad lives at /logo.svg — PWA/favicon.)

import { useId } from 'react'

export function OpenEirLogo({ className }: { className?: string }) {
  const gid = useId()
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="OpenEir logo">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      {/* vertical pill */}
      <rect x="30" y="10" width="20" height="60" rx="10" fill={`url(#${gid})`} />
      {/* horizontal pill */}
      <rect x="10" y="30" width="60" height="20" rx="10" fill={`url(#${gid})`} opacity="0.8" />
      {/* center vitality circle — strictly cream */}
      <circle cx="40" cy="40" r="6" fill="#FDFBF5" />
    </svg>
  )
}
