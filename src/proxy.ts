// OpenEir — access-control proxy (Next.js 16 "proxy" convention).
// Runs in the Node.js runtime so it can consult SQLite directly.
//
// Modes (derived in src/lib/auth.ts):
//   bootstrap → fresh instance, no accounts: everything gated except
//               first-account creation, sign-in, auth status and the
//               healthcheck. Default state — public one-click deploys start
//               LOCKED, never passwordless.
//   accounts  → pages require a session; API requests are matched against a
//               role matrix (admin > caregiver > viewer). Explicitly public
//               endpoints (token links, agent API, healthcheck) stay open —
//               they authenticate by their own tokens and are LAN-only by design.
//   open      → household mode, opt-in via OPENEIR_HOUSEHOLD=1 (trusted LANs).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthMode, resolveSession, SESSION_COOKIE } from '@/lib/auth'
import { pluginTokenAuthorizes } from '@/lib/plugin-auth'

export const config = {
  // proxy always runs on the Node.js runtime in Next 16 — matcher only
  matcher: ['/((?!_next/static|_next/image|icons|mascot|manifest.webmanifest|sw.js|favicon|logo.svg|offline.html|robots|sitemap).*)'],
}

type Rule = { prefix: string; methods?: string[]; role: 'public' | 'any' | 'edit' | 'admin' }

/** Ordered — first match wins. public = no session needed (own token/healthcheck),
 *  any = any signed-in role, edit = caregiver+, admin = admin only.
 *  Unmatched /api/* requires any signed-in role. */
const API_RULES: Rule[] = [
  // self-service & public-by-design endpoints
  { prefix: '/api/auth/status', role: 'public' },
  { prefix: '/api/auth/login', role: 'public' },
  { prefix: '/api/auth/logout', role: 'public' },
  { prefix: '/api/health', role: 'public' }, // docker healthcheck
  { prefix: '/api/system-check', methods: ['GET'], role: 'any' }, // signed-in status page
  { prefix: '/api/agent/', role: 'public' }, // LAN agent API (own trust model)
  { prefix: '/api/companion/view', role: 'public' }, // token-authenticated viewer
  { prefix: '/api/companion/accept', role: 'public' }, // token pairing
  { prefix: '/api/companion/checkin', role: 'public' }, // token check-in
  { prefix: '/api/companion/nudge', methods: ['POST'], role: 'any' },
  { prefix: '/api/emergency/sos', methods: ['POST'], role: 'any' }, // safety first
  { prefix: '/api/chat', methods: ['POST'], role: 'any' }, // family can talk to Eir
  // admin-only
  { prefix: '/api/auth/accounts', role: 'admin' },
  { prefix: '/api/export', role: 'admin' },
  { prefix: '/api/ai/providers', role: 'admin' },
  { prefix: '/api/ai/agents', methods: ['POST'], role: 'admin' },
  // MCP: the registry is admin-only; the exposed /api/mcp endpoint authenticates by its own token
  { prefix: '/api/mcp/servers', role: 'admin' },
  { prefix: '/api/mcp/access', role: 'admin' },
  { prefix: '/api/mcp', role: 'public' },
  { prefix: '/api/chat-config', methods: ['PUT'], role: 'admin' },
  { prefix: '/api/plugins', role: 'admin' },
  // caregiver+ (data mutation)
  { prefix: '/api/ai/story', methods: ['POST'], role: 'edit' },
  { prefix: '/api/ai/whatif', methods: ['POST'], role: 'edit' },
  { prefix: '/api/report', methods: ['POST'], role: 'edit' },
  { prefix: '/api/profile', methods: ['PUT'], role: 'edit' },
  { prefix: '/api/memory', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
  { prefix: '/api/insights', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
  { prefix: '/api/briefing', methods: ['POST', 'PUT'], role: 'edit' },
  { prefix: '/api/chat', methods: ['DELETE'], role: 'edit' },
  { prefix: '/api/readings', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
  { prefix: '/api/medications', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
  { prefix: '/api/lifestyle', methods: ['POST'], role: 'edit' },
  { prefix: '/api/ocr', methods: ['POST'], role: 'edit' },
  { prefix: '/api/contacts', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
  { prefix: '/api/companion', methods: ['POST', 'PATCH', 'DELETE'], role: 'edit' },
]

function matchRule(pathname: string, method: string): Rule | null {
  for (const rule of API_RULES) {
    if (!pathname.startsWith(rule.prefix)) continue
    if (rule.methods && !rule.methods.includes(method)) continue
    return rule
  }
  return null
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Token-authenticated pages (dispatcher card, companion view) never gate.
  if (pathname.startsWith('/sos/') || pathname.startsWith('/companion/')) {
    return NextResponse.next()
  }

  const mode = await getAuthMode()
  if (mode === 'open') return NextResponse.next()

  const session = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value)

  // ---- bootstrap: fresh instance — lock everything until setup -------------
  // A VALID SESSION means the instance just left bootstrap (first account was
  // created seconds ago) — the proxy's mode cache can lag up to 5s behind the
  // route handlers' (separate module graphs), so trust the session over the
  // stale cache and fall through to the normal accounts logic.
  if (mode === 'bootstrap' && !session) {
    if (pathname.startsWith('/api/')) {
      const method = req.method.toUpperCase()
      // self-resolving routes (they answer 401 themselves without a session)
      if (pathname.startsWith('/api/auth/me') || pathname.startsWith('/api/auth/password')) return NextResponse.next()
      if (pathname.startsWith('/api/auth/status') || pathname.startsWith('/api/auth/login')) return NextResponse.next()
      // exactly one door: creating the FIRST account (mode flips to 'accounts' on success)
      if (pathname.startsWith('/api/auth/accounts') && method === 'POST') return NextResponse.next()
      if (pathname.startsWith('/api/health')) return NextResponse.next() // docker healthcheck
      return NextResponse.json({ error: 'Set up OpenEir first — create your account at /login' }, { status: 401 })
    }
    if (pathname === '/login') return NextResponse.next()
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // ---- API ----
  if (pathname.startsWith('/api/')) {
    // /api/auth/me + /api/auth/password resolve sessions themselves → let through
    if (pathname.startsWith('/api/auth/me') || pathname.startsWith('/api/auth/password')) {
      return NextResponse.next()
    }
    const method = req.method.toUpperCase()
    const rule = matchRule(pathname, method)
    if (rule?.role === 'public') return NextResponse.next()
    if (!session) {
      // Plugins present their scoped token instead of a user session —
      // the token only opens the exact route+method pairs its scopes cover.
      if (await pluginTokenAuthorizes(req, pathname, method)) return NextResponse.next()
      return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })
    }
    if (rule) {
      const ok =
        rule.role === 'any' ||
        rule.role === 'edit' && (session.role === 'admin' || session.role === 'caregiver') ||
        rule.role === 'admin' && session.role === 'admin'
      if (!ok) {
        return NextResponse.json({ error: 'Your role does not allow this action' }, { status: 403 })
      }
    }
    return NextResponse.next()
  }

  // ---- pages ----
  if (pathname === '/login') {
    if (session) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }
  if (!session) {
    const url = new URL('/login', req.url)
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}
