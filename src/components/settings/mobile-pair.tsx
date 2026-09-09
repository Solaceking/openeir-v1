'use client'

// OpenEir — Settings → Profile & accounts → "Pair the mobile app".
// Shows this server's address as a QR code so the Android companion app can
// pair with one camera scan instead of typing a URL on a phone keyboard.
// The code carries the origin only — sign-in still happens on the user's own
// server, and no pairing token leaves the box.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, QrCode, Smartphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function MobilePairCard() {
  const [origin, setOrigin] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // window.location.origin is only meaningful client-side; render after mount.
    // Both states are set from the async QR render so the effect itself stays
    // synchronous (react-hooks/set-state-in-effect).
    const o = window.location.origin
    let alive = true
    QRCode.toDataURL(o, {
      width: 232,
      margin: 1,
      color: { dark: '#292524', light: '#fffdf8' },
      errorCorrectionLevel: 'M',
    })
      .then((data) => {
        if (!alive) return
        setOrigin(o)
        setQr(data)
      })
      .catch(() => {
        if (!alive) return
        setOrigin(o)
        setQr(null)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!origin) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(origin)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard unavailable (permissions) — the URL is visible as text anyway
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-teal-700" />
          <h3 className="text-sm font-semibold">Pair the mobile app</h3>
        </div>
        <p className="text-xs leading-relaxed text-stone-500">
          Install the OpenEir Android app, open it and tap <b>Scan QR code</b>, then point it at
          this screen. The code carries only this server&apos;s address — you still sign in on your
          own server, and nothing is sent anywhere else.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          {qr ? (
            <img
              src={qr}
              alt={`QR code for ${origin}`}
              className="h-[180px] w-[180px] shrink-0 rounded-xl border border-stone-200 bg-[#fffdf8] p-1"
            />
          ) : (
            <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 text-stone-400">
              <QrCode className="h-10 w-10" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
              {origin}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy address'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
