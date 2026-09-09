'use client'

// OpenEir — Settings → Profile & accounts → "Pair the mobile app".
// Shows this server's reachable addresses as QR codes so the Android
// companion app can pair with one camera scan. The server lists its own
// origins (browse origin + OPENEIR_PAIR_ORIGINS, e.g. the Tailscale URL);
// the admin picks which one to encode. The code carries the address only —
// sign-in still happens on the user's own server, no pairing token leaves
// the box.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, QrCode, Smartphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function MobilePairCard() {
  const [origins, setOrigins] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/pairing/origins')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.origins?.length) return
        setOrigins(j.origins as string[])
        setPicked(j.origins[0] as string)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!picked) return
    let alive = true
    QRCode.toDataURL(picked, {
      width: 232,
      margin: 1,
      color: { dark: '#292524', light: '#fffdf8' },
      errorCorrectionLevel: 'M',
    })
      .then((data) => { if (alive) setQr(data) })
      .catch(() => { if (alive) setQr(null) })
    return () => { alive = false }
  }, [picked])

  if (!origins.length || !picked) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(picked)
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
              alt={`QR code for ${picked}`}
              className="h-[180px] w-[180px] shrink-0 rounded-xl border border-stone-200 bg-[#fffdf8] p-1"
            />
          ) : (
            <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 text-stone-400">
              <QrCode className="h-10 w-10" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            {/* pick which address the QR carries — public, tailnet, … */}
            {origins.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Server address">
                {origins.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setPicked(o)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      o === picked
                        ? 'border-teal-700 bg-teal-50 text-teal-800'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    {o.replace(/^https?:\/\//, '')}
                  </button>
                ))}
              </div>
            )}
            <div className="truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
              {picked}
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
