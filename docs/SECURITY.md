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

**In scope:** the Next.js server, all `/api/*` routes, the realtime mini-service, the agent endpoints, the companion & SOS token flows, web-push handling, crypto usage (`src/lib/crypto.ts`), the service worker, data export.

**Known accepted risks (by design):** single-user/no-auth within a trusted LAN; agent endpoints are network-local surfaces (operators add reverse-proxy auth when exposing); SQLite file permissions follow the container user (`openeir`, non-root).

## Token & secret model

| Secret | Storage | Notes |
|---|---|---|
| AI provider API keys | AES-256-GCM (`db/.appkey` or `APP_KEY` env) | Write-only through the API; never returned to clients |
| `.z-ai-config` (built-in gateway) | Plain file, mode `600` (env bootstrap writes it) | Single environment secret — keep the file out of backups you don't trust |
| Companion invite tokens | **sha256 hash** only | Single-use, burned on acceptance; plaintext shown exactly once |
| Companion viewer tokens | **sha256 hash** only | Long-lived; revocation deletes the hash → instant 403 |
| SOS share tokens | `@unique`, per-event | Public card is noindex; token unguessable; resolve/cancel reflected on card |
| VAPID private key | `AppSetting` table in your SQLite file | Generated on-instance; never shipped to clients |
| Push subscription keys (`p256dh`/`auth`) | `PushSubscription` table | Standard Web Push; endpoint errors tracked and pruned |

## Hardening checklist for operators

- Keep the instance LAN-only or behind authenticated TLS proxy (HTTPS also unlocks voice + push)
- Set a stable `APP_KEY` and back it up with your DB
- Treat companion invites like keys: send them over a channel you trust, regenerate if exposed
- Run the `bluetooth` profile privileged only if you truly use BLE bridges
- Watch `Settings → AI providers` usage log for calls you did not cause
- Review the emergency event history periodically — every activation is audited with its notification channels
