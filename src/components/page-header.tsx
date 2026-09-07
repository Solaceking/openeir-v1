'use client'

// OpenEir — PageHeader: breadcrumbs (Home / Group / Page) + serif title.
// Every view opens with this header so navigation always answers
// "where am I, and how did I get here".

import { useMemo } from 'react'
import { House } from 'lucide-react'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { NAV_GROUPS, groupOf, type ViewKey } from '@/lib/nav'
import { VIEW_ICONS } from '@/components/nav-icons'
import { useT } from '@/lib/i18n'
import { useUI } from '@/lib/store'

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
  /** override the breadcrumb/heading icon (e.g. brand mark on Talk) */
  icon?: React.ComponentType<{ className?: string }>
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t } = useT()
  const setView = useUI((s) => s.setView)
  const groupKey = useMemo(() => groupOf(view), [view])
  const group = NAV_GROUPS.find((g) => g.key === groupKey)
  const Icon = IconOverride ?? VIEW_ICONS[view]

  return (
    <div className="pb-1">
      <Breadcrumb>
        <BreadcrumbList className="text-[11px]">
          <BreadcrumbItem>
            <BreadcrumbLink
              href="#"
              onClick={(e) => { e.preventDefault(); setView('dashboard') }}
              className="gap-1 text-muted-foreground hover:text-foreground"
              aria-label={t('nav.home')}
            >
              <House className="h-3 w-3" aria-hidden />
              {t('nav.group.home')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          {view !== 'dashboard' && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <span className="text-muted-foreground/70">{t(group?.label ?? 'nav.group.home')}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="gap-1 font-medium text-foreground">
                  {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
                  {t(`nav.${view}`)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          <h1 className="truncate text-[1.35rem] leading-tight">{title ?? t(`nav.${view}`)}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {(subtitle || children) && (
        <div className="mt-0.5 pl-[30px] text-[13px] leading-relaxed text-muted-foreground">
          {subtitle}
          {children}
        </div>
      )}
    </div>
  )
}
