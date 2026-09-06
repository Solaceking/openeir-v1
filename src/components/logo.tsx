// OpenEir — brand logo (icon only, no wordmark).
// Two crossed structural pills + a white vitality node, teal gradient.
export function OpenEirLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="OpenEir logo">
      <defs>
        <linearGradient id="openeir-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect x="30" y="10" width="20" height="60" rx="10" fill="url(#openeir-grad)" />
      <rect x="10" y="30" width="60" height="20" rx="10" fill="url(#openeir-grad)" opacity="0.8" />
      <circle cx="40" cy="40" r="6" fill="#ffffff" />
    </svg>
  )
}
