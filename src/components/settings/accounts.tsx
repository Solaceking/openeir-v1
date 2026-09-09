'use client'

// OpenEir — accounts & login (admin area, Settings → Profile & accounts).
// While no active account exists the instance is in open household mode;
// adding the first account switches it to sign-in required instantly.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Plus, Trash2, ShieldCheck, UserCog, Eye, KeyRound, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAccounts, useAccountMutations, useChangePassword, useAuth } from '@/lib/api-client'
import { TwoFactorCard } from '@/components/settings/two-factor'
import { useUI } from '@/lib/store'
import { ROLES, type Role } from '@/lib/nav'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'

const ROLE_BADGE: Record<string, string> = {
  admin: 'border-primary/40 bg-primary/10 text-primary',
  caregiver: 'border-metric/50 bg-metric/15 text-metric-foreground',
  viewer: 'border-border bg-muted text-muted-foreground',
}

export function AccountsSection() {
  const { t } = useT()
  const auth = useAuth()
  const isAdmin = auth.data?.role === 'admin'
  const accounts = useAccounts(isAdmin)
  const mut = useAccountMutations()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'caregiver' as Role })
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [pwOpenState, setPwOpenState] = useState(false)
  // The sidebar user card sets a one-shot intent; DERIVE the open state from it
  // (no setState-in-effect) and consume the intent when the dialog closes.
  const settingsIntent = useUI((s) => s.settingsIntent)
  const pwOpen = pwOpenState || settingsIntent === 'change-password'
  const setPwOpen = (v: boolean) => {
    setPwOpenState(v)
    if (!v && useUI.getState().settingsIntent === 'change-password') {
      useUI.getState().setSettingsIntent(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('accounts.subtitle')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounts.yourPassword')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => setPwOpen(true)} className="gap-1.5">
              <KeyRound className="h-4 w-4" aria-hidden />
              {t('accounts.changePw')}
            </Button>
          </CardContent>
        </Card>
        <TwoFactorCard />
        <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      </div>
    )
  }

  const rows = accounts.data?.accounts ?? []
  const mode = accounts.data?.mode ?? 'open'

  const create = async () => {
    try {
      await mut.create.mutateAsync(form)
      toast.success(t('accounts.created'))
      setAddOpen(false)
      setForm({ username: '', password: '', displayName: '', role: 'caregiver' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const patch = async (id: string, data: Record<string, unknown>) => {
    try {
      await mut.update.mutateAsync({ id, ...data })
      toast.success(t('accounts.updated'))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await mut.remove.mutateAsync(deleteTarget.id)
      toast.success(t('accounts.deleted'))
      setDeleteTarget(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* mode note */}
      <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${mode === 'accounts' ? 'border-primary/30 bg-secondary text-secondary-foreground' : 'border-border bg-muted/40 text-muted-foreground'}`}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {mode === 'accounts'
            ? t('accounts.subtitle')
            : t('accounts.openNote')}
        </span>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4.5 w-4.5 text-primary" aria-hidden />
            {t('accounts.title')}
          </CardTitle>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> {t('accounts.addTitle')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('accounts.empty')}</p>}
          {rows.map((a) => {
            const me = auth.data?.account?.id === a.id
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                  {a.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{a.displayName}</span>
                    {me && <Badge variant="outline" className="px-1.5 py-0 text-[9px]">{t('accounts.you')}</Badge>}
                    {!a.active && <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-muted-foreground">{t('accounts.disabled')}</Badge>}
                  </div>
                  <span className="block truncate text-[11px] text-muted-foreground">@{a.username}</span>
                </div>
                <Badge variant="outline" className={`shrink-0 ${ROLE_BADGE[a.role] ?? ''}`}>{t(`roles.${a.role}`)}</Badge>
                <Select value={a.role} onValueChange={(v) => void patch(a.id, { role: v })}>
                  <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs" aria-label={t('accounts.role')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={a.active}
                    onCheckedChange={(v) => void patch(a.id, { active: v })}
                    aria-label={t('accounts.active')}
                  />
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t('common.delete')}
                    disabled={me}
                    onClick={() => setDeleteTarget({ id: a.id, name: a.displayName })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4.5 w-4.5 text-primary" aria-hidden />
            {t('roles.admin')} / {t('roles.caregiver')} / {t('roles.viewer')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p><b className="text-foreground">{t('roles.admin')}</b> — {t('roles.adminDesc')}</p>
          <p><b className="text-foreground">{t('roles.caregiver')}</b> — {t('roles.caregiverDesc')}</p>
          <p><b className="text-foreground">{t('roles.viewer')}</b> — {t('roles.viewerDesc')}</p>
        </CardContent>
      </Card>

      {/* my password */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4.5 w-4.5 text-primary" aria-hidden />
            <span className="text-sm font-medium">{t('accounts.changePw')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>{t('accounts.changePw')}</Button>
        </CardContent>
      </Card>

      {/* two-factor authentication (self-service, every role) */}
      <TwoFactorCard />

      {/* add account dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('accounts.addTitle')}</DialogTitle>
            <DialogDescription>{mode === 'open' ? t('accounts.created') : t('accounts.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label htmlFor="acc-user">{t('accounts.username')}</Label>
              <Input id="acc-user" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} className="mt-1.5" placeholder="maria" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="acc-name">{t('accounts.displayName')}</Label>
              <Input id="acc-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1.5" placeholder="Maria" />
            </div>
            <div>
              <Label htmlFor="acc-pw">{t('accounts.password')}</Label>
              <Input id="acc-pw" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" autoComplete="new-password" />
            </div>
            <div>
              <Label>{t('accounts.role')}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)} — {t(`roles.${r}Desc`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void create()} disabled={mut.create.isPending || !form.username || form.password.length < 8} className="gap-1.5">
              {mut.create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t('accounts.addTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('accounts.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('accounts.deleteConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => void remove()} className="gap-1.5">
              {mut.remove.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* change password dialog (shared, role-agnostic) */}
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  )
}

// Self-service password change — rendered inside Settings → Profile & accounts
// for every role (admins manage others above; everyone can change their own).
// Also opens via the sidebar user-card shortcut (settingsIntent: 'change-password').
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT()
  const changePw = useChangePassword()
  const [pw, setPw] = useState({ current: '', next: '' })

  const changeMyPassword = async () => {
    try {
      await changePw.mutateAsync(pw)
      toast.success(t('accounts.updated'))
      onOpenChange(false)
      setPw({ current: '', next: '' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('accounts.changePw')}</DialogTitle>
        </DialogHeader>
        <Separator />
        <div className="space-y-3.5">
          <div>
            <Label htmlFor="pw-cur">{t('accounts.currentPw')}</Label>
            <Input id="pw-cur" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="mt-1.5" autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="pw-new">{t('accounts.newPw')}</Label>
            <Input id="pw-new" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="mt-1.5" autoComplete="new-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => void changeMyPassword()} disabled={changePw.isPending || !pw.current || pw.next.length < 8} className="gap-1.5">
            {changePw.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
