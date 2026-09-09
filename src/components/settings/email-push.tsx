'use client'

// OpenEir — Settings → Safety → email + native push delivery channels.
//   EmailSection  (admin): the instance's own SMTP server + default GP recipient
//   NativePushSection (all roles): UnifiedPush/ntfy endpoints the Android app
//     registers automatically; manual entry exists for testing and power users.
// Form state is initialized ONCE per server snapshot via a keyed child (no
// setState-in-effect) — the server is the source of truth on load.

import { useState } from 'react'
import { Loader2, Mail, Send, Smartphone, Trash2, BellRing } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  useAuth, useSmtpConfig, useSmtpMutations, useProfile, useSaveProfile,
  useUnifiedTargets, useUnifiedMutations, type SmtpView,
} from '@/lib/api-client'
import { toast } from 'sonner'

// ---------------- email (SMTP) ----------------

interface EmailFormState {
  host: string
  port: string
  secure: boolean
  user: string
  from: string
  password: string
  gpEmail: string
  hasPassword: boolean
}

export function EmailSection() {
  const auth = useAuth()
  const smtp = useSmtpConfig(auth.data?.role === 'admin')
  const profile = useProfile()
  if (auth.data?.role !== 'admin') return null

  const initial: EmailFormState = {
    host: smtp.data?.host ?? '',
    port: String(smtp.data?.port ?? 587),
    secure: !!smtp.data?.secure,
    user: smtp.data?.user ?? '',
    from: smtp.data?.from ?? '',
    password: '', // write-only by design
    gpEmail: profile.data?.profile?.gpEmail ?? '',
    hasPassword: !!smtp.data?.hasPassword,
  }
  return <EmailCard key={`${smtp.dataUpdatedAt}-${profile.dataUpdatedAt}`} initial={initial} />
}

function EmailCard({ initial }: { initial: EmailFormState }) {
  const mut = useSmtpMutations()
  const profile = useProfile()
  const saveProfile = useSaveProfile()
  const [form, setForm] = useState(initial)
  const [testTo, setTestTo] = useState('')

  const save = async () => {
    try {
      await mut.save.mutateAsync({
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        user: form.user.trim(),
        from: form.from.trim(),
        password: form.password || undefined,
      })
      if (form.gpEmail.trim() !== (profile.data?.profile?.gpEmail ?? '')) {
        await saveProfile.mutateAsync({
          ...profile.data!.profile,
          gpEmail: form.gpEmail.trim() || null,
        })
      }
      toast.success('Email settings saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const sendTest = async () => {
    try {
      const res = await mut.test.mutateAsync(testTo.trim() || undefined)
      toast.success(`Test email sent to ${res.to}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4.5 w-4.5 text-primary" aria-hidden />
          Email (your own mail server)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          OpenEir sends mail — the GP report, SOS notifications — straight from this instance through
          <b> your own SMTP account</b>. No third-party email service, no copy of your data on anyone else&apos;s server.
          Typical setups: port 587 + STARTTLS (Gmail, Outlook, mailbox.org), port 465 + TLS, or a local relay on port 25.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="smtp-host">Server</Label>
            <Input id="smtp-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.mailbox.org" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtp-port">Port</Label>
            <Input id="smtp-port" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} inputMode="numeric" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtp-user">Username</Label>
            <Input id="smtp-user" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="you@example.com" autoComplete="off" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtp-pass">
              Password{initial.hasPassword && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(saved — leave blank to keep)</span>}
            </Label>
            <Input id="smtp-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtp-from">From address</Label>
            <Input id="smtp-from" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="OpenEir <you@example.com>" className="mt-1.5" />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <Switch id="smtp-secure" checked={form.secure} onCheckedChange={(v) => setForm({ ...form, secure: v })} />
            <Label htmlFor="smtp-secure" className="text-xs">Implicit TLS (port 465)</Label>
          </div>
        </div>
        <div className="border-t pt-3">
          <Label htmlFor="gp-email">Default report recipient (GP)</Label>
          <Input id="gp-email" type="email" value={form.gpEmail} onChange={(e) => setForm({ ...form, gpEmail: e.target.value })} placeholder="surgery@practice.nhs.uk" className="mt-1.5" />
          <p className="mt-1 text-[11px] text-muted-foreground">Pre-filled when you press “Send to GP” in Reports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={mut.save.isPending || !form.host} className="gap-1.5">
            {mut.save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save
          </Button>
          <div className="flex flex-1 items-center gap-1.5">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send a test to…" className="h-9 flex-1 text-xs" />
            <Button size="sm" variant="outline" onClick={() => void sendTest()} disabled={mut.test.isPending || !form.host} className="gap-1.5">
              {mut.test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
              Test
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- native push (UnifiedPush / ntfy) ----------------

export function NativePushSection() {
  const auth = useAuth()
  const targets = useUnifiedTargets(!!auth.data?.account)
  const mut = useUnifiedMutations()
  const [endpoint, setEndpoint] = useState('')
  const [label, setLabel] = useState('')

  const register = async () => {
    try {
      await mut.register.mutateAsync({ endpoint: endpoint.trim(), label: label.trim() || undefined })
      toast.success('Push target registered')
      setEndpoint('')
      setLabel('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const rows = targets.data?.targets ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4.5 w-4.5 text-primary" aria-hidden />
          Native push (Android app)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The OpenEir Android app registers itself here automatically (via a UnifiedPush distributor like ntfy).
          Briefings, medication nudges and SOS alerts then arrive even when the app is closed — with no Google
          dependency. You can also add an endpoint manually below (paste the ntfy topic URL).
        </p>
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">No native devices yet.</p>
        )}
        {rows.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
            <BellRing className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{t.label}</span>
                {t.lastErrorAt && <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-destructive">error</Badge>}
              </div>
              <span className="block truncate text-[11px] text-muted-foreground">{t.endpoint}</span>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove"
              onClick={() => { void mut.remove.mutateAsync(t.id).catch((e: Error) => toast.error(e.message)) }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Pixel 8)" className="h-9 w-36 text-xs" />
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://ntfy.sh/your-topic" className="h-9 min-w-48 flex-1 text-xs" />
          <Button size="sm" variant="outline" onClick={() => void register()} disabled={mut.register.isPending || !endpoint.trim()} className="gap-1.5">
            {mut.register.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// keep the SmtpView type referenced for consumers of the initial snapshot
export type { SmtpView }
