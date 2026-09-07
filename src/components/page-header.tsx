'use client'

// OpenEir — PageHeader: serif page title + visual icon tile.
// The breadcrumb trail lives in the shell's top bar (always present, always
// consistent); this header owns identity: what this page is, and its actions.

import { useUI } from '@/lib/store'
import type { ViewKey } from '@/lib/nav'
import { VIEW_ICONS } from '@/components/nav-icons'
import { useT } from '@/lib/i18n'

export function PageHeader({
  view,
  title,
  subtitle,
  icon: IconOverride,
  actions,
  children,
}: {
  view: ViewKey
  /** heading text/node — defaults to the view's nav label */
  title?: React.ReactNode
  subtitle?: React.ReactNode
  /** override the heading icon (e.g. brand mark on Talk) */
  icon?: React.ComponentType<{ className?: string }>
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t } = useT()
  const setView = useUI((s) => s.setView)
  const Icon = IconOverride ?? VIEW_ICONS[view]
  const onDashboard = view === 'dashboard'

  return (
    <div className="pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <button
              onClick={() => { if (!onDashboard) setView('dashboard') }}
              aria-hidden={!onDashboard}
              tabIndex={onDashboard ? -1 : 0}
              aria-label={onDashboard ? undefined : t('nav.group.home')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            >
              <Icon className="h-5 w-5" aria-hidden />
            </button>
          )}
          <h1 className="truncate text-[1.35rem] leading-tight">{title ?? t(`nav.${view}`)}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {(subtitle || children) && (
        <div className="mt-1 pl-[52px] text-[13px] leading-relaxed text-muted-foreground">
          {subtitle}
          {children}
        </div>
      )}
    </div>
  )
}
