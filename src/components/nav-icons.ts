// OpenEir — icon per view. Shared by the sidebar, mobile nav and PageHeader
// breadcrumbs (kept separate from lib/nav.ts so middleware stays dependency-free).
import {
  LayoutDashboard, MessagesSquare, PenLine, ListOrdered, Pill, Siren,
  Activity, BookOpen, FlaskConical, FileText, Settings, type LucideIcon,
} from 'lucide-react'
import type { ViewKey } from '@/lib/nav'

export const VIEW_ICONS: Record<ViewKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  talk: MessagesSquare,
  record: PenLine,
  readings: ListOrdered,
  medications: Pill,
  safety: Siren,
  trends: Activity,
  story: BookOpen,
  whatif: FlaskConical,
  reports: FileText,
  settings: Settings,
}
