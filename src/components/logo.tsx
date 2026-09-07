// OpenEir — brand mark. Flat vector, apothecary / heritage expedition style.
// An apothecary vial in deep teal carrying the amber leaf cluster — the only
// place warm amber may live. Uniform flat fills, no gradients, no opacity
// tricks, no shadows. Reads cleanly from 16 px favicon to 96 px splash.
export function OpenEirLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="OpenEir logo">
      {/* cork */}
      <rect x="30" y="5" width="20" height="12" rx="3.5" fill="#0F766E" />
      {/* neck */}
      <rect x="34" y="14" width="12" height="13" fill="#0F766E" />
      {/* vial body */}
      <rect x="24" y="24" width="32" height="52" rx="11" fill="#0F766E" />
      {/* amber leaf cluster — strictly reserved accent, carried in the vial */}
      <g fill="#F2A65A">
        <path d="M40 40.5c3.1 3.8 3.1 9.6 0 13.4-3.1-3.8-3.1-9.6 0-13.4Z" />
        <path d="M31.6 47.2c4.9-.7 10 2.1 12.1 6.6-4.9.7-10-2.1-12.1-6.6Z" />
        <path d="M48.4 47.2c-4.9-.7-10 2.1-12.1 6.6 4.9.7 10-2.1 12.1-6.6Z" />
      </g>
    </svg>
  )
}
