# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |

## Reporting a vulnerability

This is self-hosted health software — treat reports as urgent.

**Do not open a public issue for security reports.** Email `security@openeir.example` (replace domain per repo owner) with:

- Component and version (`/api/health` shows the version)
- Impact on health data (disclosure, tampering, availability)
- Reproduction steps or PoC

You will get an acknowledgment within 48 hours and a fix timeline within a week. We will credit reporters in the release notes unless you prefer anonymity.

## Scope & non-scope

**In scope:** the Next.js server, all `/api/*` routes, the realtime mini-service, the agent endpoints, crypto usage (`src/lib/crypto.ts`), the service worker, data export.

**Known accepted risks (by design):** single-user/no-auth within a trusted LAN; agent endpoints are network-local surfaces (operators add reverse-proxy auth when exposing); SQLite file permissions follow the container user (`openeir`, non-root).

## Hardening checklist for operators

- Keep the instance LAN-only or behind authenticated TLS proxy
- Set a stable `APP_KEY` and back it up with your DB
- Run the `bluetooth` profile privileged only if you truly use BLE bridges
- Watch `Settings → AI providers` usage log for calls you did not cause
