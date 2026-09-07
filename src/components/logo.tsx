// OpenEir — brand mark. Flat vector, apothecary / heritage expedition style.
// Two crossed structural pills in deep teal + the amber leaf cluster at the
// crossing point (the only place warm amber may live). Uniform shapes, no
// gradients, no shadows.
export function OpenEirLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="OpenEir logo">
      {/* vertical pill */}
      <rect x="31" y="8" width="18" height="64" rx="9" fill="#0F766E" />
      {/* horizontal pill */}
      <rect x="8" y="31" width="64" height="18" rx="9" fill="#0F766E" opacity="0.82" />
      {/* amber leaf cluster — strictly reserved accent */}
      <g fill="#F2A65A">
        <path d="M40 24c2.8 3.4 2.8 8.6 0 12-2.8-3.4-2.8-8.6 0-12Z" />
        <path d="M29.5 34.5c4.4-.6 9 1.9 11 5.9-4.4.6-9-1.9-11-5.9Z" />
        <path d="M50.5 34.5c-4.4-.6-9 1.9-11 5.9 4.4.6 9-1.9 11-5.9Z" />
      </g>
    </svg>
  )
}
