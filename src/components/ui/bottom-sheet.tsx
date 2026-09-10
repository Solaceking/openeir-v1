'use client'

// OpenEir — bottom sheets (vaul). Mobile-native replacement for centered
// desktop dialogs: draggable, swipe-dismissable, spring physics built in.
//   <BottomSheet>        — always a bottom sheet (mobile-only surfaces,
//                          e.g. the nav "More" drawer)
//   <ResponsiveSheet>    — vaul sheet on mobile, Radix dialog on desktop;
//                          same children, right material per breakpoint
//   <ResponsiveConfirm>  — AlertDialog-shaped confirm that renders as a
//                          sheet on mobile for every destructive/confirm
//                          interaction
// All sheets respect safe areas and the brand glass material (which falls
// back to solid surfaces under high-contrast mode — see globals.css).

import * as React from 'react'
import { Drawer as Vaul } from 'vaul'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const sheetSurface = 'eir-glass fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl px-4 pb-safe outline-none'

/** Always-on bottom sheet (mobile-only surfaces). */
export function BottomSheet({
  open, onOpenChange, title, children, ariaLabel,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** visually hidden accessible title */
  title: string
  children: React.ReactNode
  ariaLabel?: string
}) {
  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Vaul.Content className={sheetSurface} aria-label={ariaLabel ?? title}>
          <Vaul.Title className="sr-only">{title}</Vaul.Title>
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
          {children}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  )
}

/** vaul on mobile, Radix dialog on desktop — one call site, right material. */
export function ResponsiveSheet({
  open, onOpenChange, title, children, dialogClassName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  children: React.ReactNode
  dialogClassName?: string
}) {
  const isMobile = useIsMobile()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null
  if (isMobile) {
    return <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>{children}</BottomSheet>
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Confirm dialog that renders as a draggable sheet on mobile. */
export function ResponsiveConfirm({
  open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel: React.ReactNode
  onConfirm: () => void
  destructive?: boolean
}) {
  const isMobile = useIsMobile()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null

  if (!isMobile) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onOpenChange(false)}>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : ''} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-3 pb-6 pt-4">
        <div className="px-1">
          <h2 className="text-base font-semibold leading-snug">{title}</h2>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => onOpenChange(false)}
            className="min-h-[48px] flex-1 rounded-2xl border bg-card text-sm font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onOpenChange(false) }}
            className={`min-h-[48px] flex-1 rounded-2xl text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] ${
              destructive ? 'bg-destructive' : 'bg-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
