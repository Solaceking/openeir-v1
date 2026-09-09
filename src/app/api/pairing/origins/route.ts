import { ok } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Origins this server can be reached at, for the mobile pairing QR.
// Source of truth, in order:
//   1. the forwarded/public origin (Host header behind the tunnel, else xfh)
//   2. the origin the admin is browsing from right now (always works for them)
//   3. OPENEIR_PAIR_ORIGINS env — extra addresses (e.g. the Tailscale URL)
//      set by the deployment unit
// No discovery magic, no host scanning — honest addresses the admin controls.
// Bind-addresses (0.0.0.0, ::, localhost from the box itself) are dropped:
// they are never pairable from a phone.

function bindish(origin: string): boolean {
  try {
    const h = new URL(origin).hostname
    return h === '0.0.0.0' || h === '::' || h === '[::]' || h === '127.0.0.1' || h === 'localhost'
  } catch {
    return true
  }
}

export async function GET(req: Request) {
  const h = new Headers(req.headers)
  // Behind the Cloudflare tunnel the app sees Host: openeir.buddycloud.uk
  // (tunnel config forwards it) and https via cf-visitor / x-forwarded-proto.
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = (h.get('x-forwarded-proto') || (h.get('cf-visitor')?.includes('https') ? 'https' : '') || '').split(',')[0].trim()
  let browse = ''
  try { browse = new URL(req.url).origin } catch { browse = '' }
  let forwarded = ''
  if (host && proto === 'https' && host.includes('.')) {
    forwarded = `https://${host.split(',')[0].trim()}`
  }

  const extra = (process.env.OPENEIR_PAIR_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  const origins = [forwarded, browse, ...extra]
    .filter(Boolean)
    .filter((o) => !bindish(o))
  const unique = origins.filter((v, i, a) => a.indexOf(v) === i)
  return ok({ origins: unique })
}
