'use client'

// OpenEir — sign-in. Cream paper, flat mark, serif wordmark. No gradients,
// no shadows — the brand does the talking.

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OpenEirLogo } from '@/components/logo'
import { useT } from '@/lib/i18n'

function LoginForm() {
  const { t } = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="pointer-events-none fixed inset-x-6 inset-y-5 rounded-2xl border border-border/60 sm:inset-x-10 sm:inset-y-7" aria-hidden />

      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/25 bg-card">
          <OpenEirLogo className="h-13 w-13" />
        </div>
        <h1 className="font-display mt-5 text-3xl font-medium tracking-tight">OpenEir</h1>
        <p className="font-display mt-0.5 text-sm italic text-muted-foreground">{t('app.tagline')}</p>

        <form onSubmit={submit} className="mt-8 w-full space-y-4">
          <div>
            <Label htmlFor="login-username">{t('login.username')}</Label>
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="login-password">{t('login.password')}</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1.5 h-11"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || !username || !password} className="h-11 w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
            {t('login.signIn')}
          </Button>
        </form>

        <p className="mt-6 max-w-xs text-center text-[11px] leading-relaxed text-muted-foreground">
          {t('login.hint')}
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
