'use client'

// OpenEir — sign-in / first-run setup. Cream paper, flat mark, serif wordmark.
// If the instance has no accounts yet (bootstrap), this page offers to create
// the first (admin) account — the only door into a fresh install.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/lib/i18n'

type GateMode = 'checking' | 'signin' | 'bootstrap'

function AuthForm() {
  const { t } = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<GateMode>('checking')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setMode(j?.mode === 'bootstrap' ? 'bootstrap' : 'signin') })
      .catch(() => { if (!cancelled) setMode('signin') })
    return () => { cancelled = true }
  }, [])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Sign-in failed')
        return
      }
      router.replace(params.get('next') ?? '/')
      router.refresh()
    } catch {
      setError('Network error — is the server reachable?')
    } finally {
      setBusy(false)
    }
  }

  const createFirstAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password !== confirm) {
      setError(t('login.passwordsDontMatch'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password, role: 'admin' }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Could not create the account')
        return
      }
      // account created — sign straight in and continue to setup
      const login = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      })
      if (!login.ok) {
        setMode('signin')
        setError('Account created — please sign in')
        return
      }
      router.replace(params.get('next') ?? '/')
      router.refresh()
    } catch {
      setError('Network error — is the server reachable?')
    } finally {
      setBusy(false)
    }
  }

  const bootstrap = mode === 'bootstrap'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="pointer-events-none fixed inset-x-6 inset-y-5 rounded-2xl border border-border/60 sm:inset-x-10 sm:inset-y-7" aria-hidden />

      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="eir-breathe h-24 w-24 overflow-hidden rounded-full">
          <Image src="/mascot/eir-round-256.png" alt="Eir" width={96} height={96} priority className="h-full w-full object-cover" />
        </div>
        <h1 className="font-display mt-5 text-3xl font-medium tracking-tight">{bootstrap ? t('login.createTitle') : 'OpenEir'}</h1>
        <p className="font-display mt-0.5 text-sm italic text-muted-foreground">
          {bootstrap ? '' : t('app.tagline')}
        </p>
        {bootstrap && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p>{t('login.createHint')}</p>
          </div>
        )}

        <form onSubmit={bootstrap ? createFirstAccount : signIn} className="mt-8 w-full space-y-4">
          <div>
            <Label htmlFor="login-username">{t('login.username')}</Label>
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={bootstrap ? 'username' : 'username'}
              autoCapitalize="none"
              autoFocus
              className="mt-1.5 h-11"
            />
            {bootstrap && <p className="mt-1 text-[11px] text-muted-foreground">{t('login.usernameHint')}</p>}
          </div>
          <div>
            <Label htmlFor="login-password">{t('login.password')}</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={bootstrap ? 'new-password' : 'current-password'}
              className="mt-1.5 h-11"
            />
          </div>
          {bootstrap && (
            <div>
              <Label htmlFor="login-confirm">{t('login.confirmPassword')}</Label>
              <Input
                id="login-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="mt-1.5 h-11"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || !username || !password || (bootstrap && !confirm)} className="h-11 w-full gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : bootstrap ? (
              <UserPlus className="h-4 w-4" aria-hidden />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden />
            )}
            {bootstrap ? t('login.createAccount') : t('login.signIn')}
          </Button>
        </form>

        {!bootstrap && (
          <p className="mt-6 max-w-xs text-center text-[11px] leading-relaxed text-muted-foreground">
            {t('login.hint')}
          </p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  )
}
