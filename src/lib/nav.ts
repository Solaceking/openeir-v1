// OpenEir — shared navigation model: views, groups, icons, role permissions.
// Pure data + types only (no client APIs) so both the edge/node middleware,
// the app shell and the settings UI can import it safely.

export type ViewKey =
  | 'dashboard' | 'talk' | 'record' | 'readings' | 'medications'
  | 'safety' | 'trends' | 'story' | 'whatif' | 'reports' | 'settings'

export type Role = 'admin' | 'caregiver' | 'viewer'

export const ROLES: Role[] = ['admin', 'caregiver', 'viewer']

/** Ordered sidebar groups. Each view belongs to exactly one group. */
export const NAV_GROUPS: { key: string; label: string; keys: ViewKey[] }[] = [
  { key: 'home', label: 'nav.group.home', keys: ['dashboard'] },
  { key: 'care', label: 'nav.group.care', keys: ['talk', 'record', 'medications', 'readings'] },
  { key: 'insight', label: 'nav.group.insight', keys: ['trends', 'story', 'whatif', 'reports'] },
  { key: 'safety', label: 'nav.group.safety', keys: ['safety'] },
  { key: 'system', label: 'nav.group.system', keys: ['settings'] },
]

/** Group key a view belongs to (for breadcrumbs). */
export function groupOf(view: ViewKey): string {
  return NAV_GROUPS.find((g) => g.keys.includes(view))?.key ?? 'home'
}

/** Views a role may open. Viewer is read-only, but Talk stays open —
 *  family should always be able to ask Eir about the day. */
export const ROLE_VIEWS: Record<Role, ViewKey[]> = {
  admin: ['dashboard', 'talk', 'record', 'readings', 'medications', 'safety', 'trends', 'story', 'whatif', 'reports', 'settings'],
  caregiver: ['dashboard', 'talk', 'record', 'readings', 'medications', 'safety', 'trends', 'story', 'whatif', 'reports', 'settings'],
  viewer: ['dashboard', 'talk', 'readings', 'medications', 'safety', 'story', 'reports', 'settings'],
}

export function roleCanView(role: Role, view: ViewKey): boolean {
  return ROLE_VIEWS[role]?.includes(view) ?? true
}

/** True when the role may mutate health data (log readings, doses, notes). */
export function roleCanEdit(role: Role): boolean {
  return role === 'admin' || role === 'caregiver'
}

/** Human label keys for roles (i18n: roles.admin …). */
export function roleLabelKey(role: Role): string {
  return `roles.${role}`
}
