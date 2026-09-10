'use client'

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

// OpenEir — the one confirmation language. Manual and agent-driven writes
// both surface here: plain past-tense copy, a spring entrance (globals.css)
// and a check mark that draws itself on success. Motion carries the
// satisfaction — the copy never performs enthusiasm.

function DrawnCheck() {
  return (
    <svg
      viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="eir-check-draw" aria-hidden
    >
      <circle cx="12" cy="12" r="10" opacity="0.35" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{ success: <DrawnCheck /> }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
