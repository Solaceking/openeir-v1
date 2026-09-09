'use client'

// OpenEir — Settings → Profile & accounts → "Two-factor authentication".
// Self-service TOTP enrollment: QR scan → live code verify → one-time view of
// backup codes. Disabling requires the password AND a current code so a
// stolen session cannot strip the second factor.

import { useState } from 'react'
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useAuth, useTotpStatus, useTotpMutations } from '@/lib/api-client'
import { toast } from 'sonner'

export function TwoFactorCard() {
  const auth = useAuth()
  const status = useTotpStatus(!!auth.data?.account)
  const mut = useTotpMutations()

  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrolled, setEnrolled] = useState<{ secret: string; uri: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disableForm, setDisableForm] = useState({ password: '', code: '' })

  const enabled = !!status.data?.enabled

  const startEnroll = async () => {
    try {
      const data = await mut.setup.mutateAsync()
      setEnrolled(data)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const confirmEnroll = async () => {
    try {
      const res = await mut.enable.mutateAsync(code.trim())
      setBackupCodes(res.backupCodes)
      setEnrolled(null)
      setCode('')
      toast.success('Two-factor authentication is on')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const disable = async () => {
    try {
      await mut.disable.mutateAsync({ password: disableForm.password, code: disableForm.code || undefined })
      toast.success('Two-factor authentication is off')
      setDisableOpen(false)
      setDisableForm({ password: '', code: '' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const copyCodes = () => {
    if (!backupCodes) return
    navigator.clipboard.writeText(backupCodes.join('\n')).then(
      () => toast.success('Backup codes copied'),
      () => toast.error('Could not copy — select the codes manually'),
    )
  }

  const downloadCodes = () => {
    if (!backupCodes) return
    const blob = new Blob([`OpenEir two-factor backup codes\n\n${backupCodes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'openeir-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            {enabled ? (
              <ShieldCheck className="h-4.5 w-4.5 text-primary" aria-hidden />
            ) : (
              <ShieldOff className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Two-factor authentication</span>
                <Badge variant="outline" className={enabled ? 'border-primary/40 bg-primary/10 px-1.5 py-0 text-[9px] text-primary' : 'px-1.5 py-0 text-[9px] text-muted-foreground'}>
                  {enabled ? 'On' : 'Off'}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {enabled
                  ? 'A 6-digit authenticator code is required after your password on every sign-in.'
                  : 'Add a one-time code from an authenticator app (Aegis, Google Authenticator, 1Password…) on top of your password.'}
              </p>
            </div>
          </div>
          {enabled ? (
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)} className="gap-1.5">
              <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Turn off
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEnrollOpen(true)} className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> Set up
            </Button>
          )}
        </CardContent>
      </Card>

      {/* enrollment dialog: QR → verify → backup codes */}
      <Dialog open={enrollOpen} onOpenChange={(o) => { setEnrollOpen(o); if (!o) { setEnrolled(null); setCode('') } }}>
        <DialogContent className="sm:max-w-md">
          {!enrolled && !backupCodes && (
            <>
              <DialogHeader>
                <DialogTitle>Set up two-factor authentication</DialogTitle>
                <DialogDescription>
                  You will need an authenticator app. The whole enrollment happens on your own server — nothing leaves it.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
                <Button onClick={() => void startEnroll()} disabled={mut.setup.isPending} className="gap-1.5">
                  {mut.setup.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Start
                </Button>
              </DialogFooter>
            </>
          )}

          {enrolled && !backupCodes && (
            <>
              <DialogHeader>
                <DialogTitle>Scan with your authenticator app</DialogTitle>
                <DialogDescription>
                  Scan the QR code, or enter the key manually. Then type the 6-digit code it shows to confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                {enrolled.qr ? (
                  <div className="rounded-xl border bg-white p-2.5">
                    <img src={enrolled.qr} alt="TOTP QR code" width={192} height={192} className="h-48 w-48" />
                  </div>
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                    QR unavailable — use the key
                  </div>
                )}
                <div className="w-full rounded-lg bg-muted/50 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Manual key</p>
                  <code className="font-mono text-sm font-semibold tracking-wider">{enrolled.secret}</code>
                </div>
                <div className="w-full">
                  <Label htmlFor="totp-code">Current code</Label>
                  <Input
                    id="totp-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    className="mt-1.5 h-11 text-center font-mono text-lg tracking-[0.35em]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEnrollOpen(false); setEnrolled(null) }}>Cancel</Button>
                <Button onClick={() => void confirmEnroll()} disabled={mut.enable.isPending || code.trim().length < 6} className="gap-1.5">
                  {mut.enable.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Verify & enable
                </Button>
              </DialogFooter>
            </>
          )}

          {backupCodes && (
            <>
              <DialogHeader>
                <DialogTitle>Save your backup codes</DialogTitle>
                <DialogDescription>
                  If you lose your phone, a backup code is the only way back in. Each works exactly once.
                  They are shown <b>now only</b> — the server stores them hashed.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border bg-muted/40 p-3">
                {backupCodes.map((c) => (
                  <code key={c} className="font-mono text-sm tracking-wider">{c}</code>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={copyCodes} className="gap-1.5"><Copy className="h-3.5 w-3.5" aria-hidden /> Copy</Button>
                <Button variant="outline" onClick={downloadCodes} className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden /> Download</Button>
                <Button onClick={() => { setBackupCodes(null); setEnrollOpen(false) }}>I saved them</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* disable dialog */}
      <Dialog open={disableOpen} onOpenChange={(o) => { setDisableOpen(o); if (!o) setDisableForm({ password: '', code: '' }) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Turn off two-factor authentication?</DialogTitle>
            <DialogDescription>
              Your account will be protected by password only. Confirm with your password and a current code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="totp-disable-pw">Password</Label>
              <Input id="totp-disable-pw" type="password" value={disableForm.password} onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })} className="mt-1.5" autoComplete="current-password" />
            </div>
            <div>
              <Label htmlFor="totp-disable-code">Authenticator or backup code</Label>
              <Input id="totp-disable-code" value={disableForm.code} onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value })} className="mt-1.5 font-mono" placeholder="123456" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void disable()} disabled={mut.disable.isPending || !disableForm.password || !disableForm.code} className="gap-1.5">
              {mut.disable.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
