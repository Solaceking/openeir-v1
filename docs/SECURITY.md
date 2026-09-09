# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 3.x | ✅ |

## Reporting a vulnerability

This is self-hosted health software — treat reports as urgent.

**Do not open a public issue for security reports.** Use GitHub's **private vulnerability reporting** on this repository (*Security → Report a vulnerability*) — it reaches the maintainers directly and stays confidential. Include:

- Component and version (`/api/health` shows the version)
- Impact on health data (disclosure, tampering, availability)
- Reproduction steps or PoC

You will get an acknowledgment within 48 hours and a fix timeline within a week. We will credit reporters in the release notes unless you prefer anonymity.

## Scope & non-scope

**In scope:** the Next.js server, all `/api/*` routes, the realtime mini-service, the agent endpoints, the companion & SOS token flows, web-push handling, crypto usage (`src/lib/crypto.ts`), the service worker, data export.

**Access model (since v3.7):** authentication is **on by default**. A fresh instance boots in *bootstrap* mode — every page and API is locked until the first (admin) account is created through `/login`, so a public one-click deploy never starts passwordless. After that, every session-scoped request is matched against a role matrix (admin > caregiver > viewer). The passwordless *household mode* is an explicit **opt-in for trusted LANs** (`OPENEIR_HOUSEHOLD=1`) — it is not the default and is not recommended on any URL reachable from the internet.

**Known accepted risks (by design):** agent endpoints are network-local surfaces (operators add reverse-proxy auth when exposing them beyond the LAN); household mode is trust-the-LAN by definition; SQLite file permissions follow the container user (`openeir`, non-root).

## Token & secret model

| Secret | Storage | Notes |
|---|---|---|
| AI provider API keys | AES-256-GCM (`db/.appkey` or `APP_KEY` env) | Write-only through the API; never returned to clients |
| Companion invite tokens | **sha256 hash** only | Single-use, burned on acceptance; plaintext shown exactly once |
| Companion viewer tokens | **sha256 hash** only | Long-lived; revocation deletes the hash → instant 403 |
| SOS share tokens | `@unique`, per-event | Public card is noindex; token unguessable; resolve/cancel reflected on card |
| VAPID private key | `AppSetting` table in your SQLite file | Generated on-instance; never shipped to clients |
| Push subscription keys (`p256dh`/`auth`) | `PushSubscription` table | Standard Web Push; endpoint errors tracked and pruned |

## Hardening checklist for operators

- Leave the default auth gate on — set strong passwords for every account; only use `OPENEIR_HOUSEHOLD=1` on a LAN you control
- Keep the instance LAN-only or behind authenticated TLS proxy (HTTPS also unlocks voice + push; set `OPENEIR_SECURE_COOKIE=1` behind TLS)
- Set a stable `APP_KEY` and back it up with your DB
- Treat companion invites like keys: send them over a channel you trust, regenerate if exposed
- Run the `bluetooth` profile privileged only if you truly use BLE bridges
- Watch `Settings → AI providers` usage log for calls you did not cause
- Review the emergency event history periodically — every activation is audited with its notification channels
