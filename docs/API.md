# API reference

Base: same origin as the UI. All request bodies are JSON and validated with zod (`422` on validation failure with an `issues` array). Rate-limited endpoints return `429`. Errors are honest: AI/provider failures name the config paths checked and which chain members were attempted.

---

## Accounts & access control (RBAC)

OpenEir runs in **open household mode** until the first account exists — no sign-in, classic behavior. Once an account is created (Settings → Profile & accounts), every page and API request requires a session; the request proxy enforces the role matrix.

Roles: `admin` (everything) · `caregiver` (daily care mutations) · `viewer` (read-only + chat + SOS). Public-by-design endpoints keep their own trust model: `/api/auth/status`, `/api/auth/login`, `/api/auth/logout`, `/api/health`, `/api/agent/*`, `/api/companion/view|accept|checkin`, `POST /api/emergency/sos`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/auth/status` | public | `{ mode: 'open' \| 'accounts' }` |
| `POST` | `/api/auth/login` | public | Body: `username`, `password`. Sets `openeir_session` HttpOnly cookie (30d). Uniform 401 — never reveals whether the username exists. |
| `DELETE` | `/api/auth/login` | public | Sign out (destroys the server-side session). |
| `GET` | `/api/auth/me` | any | `{ mode, role, account }`; `role: 'admin'` in open mode. |
| `PUT` | `/api/auth/password` | session | Body: `current`, `next` (min 8). |
| `GET` | `/api/auth/accounts` | admin | List accounts (never hashes). |
| `POST` | `/api/auth/accounts` | admin* | Create. Body: `username` (lowercase `[a-z0-9._-]`), `password` (min 8), `displayName?`, `role`. *Allowed without a session while the instance is open — the first account is forced to `admin`. |
| `PATCH` | `/api/auth/accounts/:id` | admin | Body: `displayName?`, `role?`, `active?`, `password?`. Self-demotion/self-disable rejected; last active admin protected; role/password/active changes revoke that account's sessions. |
| `DELETE` | `/api/auth/accounts/:id` | admin | Hard delete (sessions cascade). Self-delete and last-admin-delete rejected. |

---

## Readings

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/readings/bp?days=90&limit=500` | Newest first. `tags` is a JSON string. `source` ∈ `manual · bluetooth · import · voice · chat · photo`. |
| `POST` | `/api/readings/bp` | Body: `systolic 60..260`, `diastolic 30..180`, `pulse?`, `arm?`, `label? (morning/evening/pre_med/post_med/general)`, `tags?: string[]`, `notes?`, `takenAt?: ISO`, `source?`, `force?` (bypass duplicate guard). Emits `READING_LOGGED`. |
| `PATCH` | `/api/readings/bp/:id` | Partial update. |
| `DELETE` | `/api/readings/bp/:id` | Hard delete. |
| `GET` | `/api/readings/glucose?days=90` | Values canonical in mmol/L. |
| `POST` | `/api/readings/glucose` | Body: `value 1..40`, `context? (fasting/pre_meal/post_meal/bedtime/random)`, `carbs?`, `source?`, `force?`. Emits `READING_LOGGED`. |
| `PATCH` / `DELETE` | `/api/readings/glucose/:id` | |

**Duplicate guard**: machine captures (`voice · chat · photo · bluetooth`) within minutes of an existing reading are rejected with a `duplicate?` payload naming the original — the UI offers "Log anyway" (`force: true`).

## Medications

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/medications` | Active + inactive, parsed schedules, refill predictions, interaction check. |
| `POST` | `/api/medications` | Body: `name`, `doseValue`, `doseUnit?`, `form?`, `purpose?`, `scheduleTimes: ["08:00","20:00"]`, `stock?`, `refillThreshold?`. |
| `PATCH` / `DELETE` | `/api/medications/:id` | |
| `POST` | `/api/medications/log` | Body: `medicationId`, `date YYYY-MM-DD`, `scheduledTime`, `status (taken/skipped/delayed/missed/pending)`. Upsert; manages stock; emits `MEDICATION_TAKEN`/`MEDICATION_MISSED`. |

## Lifestyle & profile

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/lifestyle` | Daily upsert: `mood/energy/sleepQuality/stress (1..5)`, `weightKg`, `sodiumHigh`. |
| `GET` / `PUT` | `/api/profile` | Profile + clinical targets + `prefs` (theme, quiet hours, aiAutonomy, reminders) + GP fields. |

## Chat (Talk)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/chat` | Full thread (oldest→newest) with structured `meta` (action cards, provider info). |
| `POST` | `/api/chat` | Body: `content ≤ 4000`, `channel? (text · voice)`. Grounded reply: full health context + memory block + 16-turn window + `detectAction()` (action cards). Orphan user-turns are cleaned up on provider failure. |
| `DELETE` | `/api/chat` | Clear thread. |

## Voice

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/voice/tts` | Body: `text ≤ 600`, `voice?`, `rate? 0.6..1.6`. → `audio/mpeg` (Edge neural voices, disk-cached, ETag/304). Validation errors are `422`. |
| `GET` | `/api/voice/tts` | Curated voice catalog (14 neural voices, grouped by accent). |

## Photo scan (OCR)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/ocr/scan` | Multipart image. Vision model via provider chain → offline OCR fallback → deterministic parser. Returns a *suggestion* (never saves). |

## Places (GP & emergency search)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/places/search?q=&lat=&lng=` | GP/practice search: Google Places (New) → Nominatim fallback; reverse geocode; nearest emergency department; plus-code. |

## Emergency contacts

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/contacts` | Multi-channel contacts (`channels: [{type: phone/whatsapp/email/signal/other, value, label?}]`), `isPrimary`. |
| `PATCH` / `DELETE` | `/api/contacts/:id` | Soft-deactivate via `active: false`. |

## Emergency (SOS)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/emergency/sos` | Trigger: captures location, resolves country number + nearest ED + plus-code, builds dispatcher package, notifies contacts + web push (audited in `notifiedVia`), creates `/sos/[shareToken]` card. |
| `GET` | `/api/emergency/[id]` | Event detail (package, context, timeline). |
| `PATCH` | `/api/emergency/[id]` | `status: cancelled · resolved`. |
| — | `/sos/[token]` (page) | Public, noindex, read-only dispatcher card. |

## Companion

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/companion` | List links / create invite (one-time token, scopes, `alsoEmergency`). Token shown once. |
| `DELETE` | `/api/companion` | Revoke a link (kills viewer token). |
| `POST` | `/api/companion/accept` | Body: `token`. Burns invite → issues long-lived viewer token → auto emergency contact. |
| `GET` | `/api/companion/view` | Bearer viewer token → scoped snapshot: check-in freshness, app heartbeat, meds, vitals, active SOS. |
| `POST` | `/api/companion/checkin` | "I'm OK" timestamp (user side). |
| `POST` | `/api/companion/nudge` | From companion dashboard → realtime toast + web push. |

## Push (web push, VAPID)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/push` | **Bootstrap**: auto-generates VAPID keys into `AppSetting` on first call; returns public key + subscription list. |
| `POST` | `/api/push` | Subscribe a device (`endpoint`, `p256dh`, `auth`, `label?`). |
| `DELETE` | `/api/push` | Remove a subscription. |
| `POST` | `/api/push/test` | Send a test notification to this device. |

Delivery notes: `404/410` endpoints are pruned automatically; other errors recorded per-subscription and surfaced in Settings → Alerts.

## Briefing

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/briefing` | Today's briefing, deterministically built (score, BP vs target + trend, glucose + eA1c, adherence + streak, today's doses, focus). Idempotent per day. |
| `POST` | `/api/briefing/deliver` | Push today's briefing to all devices (once per day unless forced). |
| `GET` / `PUT` | `/api/briefing/config` | Delivery hour, auto-deliver, auto-reflect toggles. |

## Memory

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/memory` | All entries (tier, importance, pinned, access stats). |
| `POST` | `/api/memory` | Add a memory (`content`, `tier?`, `kind?`, `importance?`, `pinned?`). |
| `PATCH` / `DELETE` | `/api/memory` | Edit / pin / delete (body carries `id`). |
| `POST` | `/api/memory/reflect` | Run the nightly reflection now; `?force=1` re-runs even if today already has one. |

## Intelligence

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/stats` | The dashboard aggregate: last reading, 30d BP/glucose, adherence, Eir Score, warnings, today's med schedule, refills, interactions, chart series, passive app-open heartbeat. |
| `GET` | `/api/insights?limit=30` | Ambient feed (non-dismissed, pinned first). |
| `POST` | `/api/insights` | Trigger a `PATTERN_CHECK` (202 + event id). |
| `PATCH` / `DELETE` | `/api/insights/:id` | `status: new/seen/dismissed/actioned`, `pinned`. |
| `POST` | `/api/ai/ask` | Body: `question ≤400 chars`. Synchronous, context-grounded answer; also lands in the feed. |
| `GET` | `/api/ai/story` | This week's Blood Pressure Story (cached per ISO week). `?force=1` regenerates. |
| `POST` | `/api/ai/whatif` | Body: `params` (weight/sodium/exercise/sleep/carbs/adherence/…) → deterministic projection + AI narrative. |

## AI providers & models

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/ai/providers` | Provider chain CRUD. `GET` includes `builtin: {configured, source, checkedPaths}`. Keys are write-only, AES-256-GCM at rest. |
| `PATCH` / `DELETE` | `/api/ai/providers/:id` | |
| `POST` | `/api/ai/providers/:id/test` | Real ping; reports latency and which chain member answered. |
| `GET` | `/api/ai/models?preset=` | Live models.dev catalog slice: name, id, context, $/M in/out, release date, capability badges. 12h SQLite cache, stale-on-error. |
| `GET` | `/api/ai/agents` | CLI harness registry scan: installed CLIs (claude/codex/gemini/opencode), login state, attach recipes (incl. Z.ai bridge). Cached 60s; response carries `scannedAt` + `cached`. |
| `POST` | `/api/ai/agents` | **Rescan** — bypasses the cache and re-probes the machine. Explicit, idempotent, never disrupts attached providers. |

## Agent harness (MCP-style, network-local)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/agent/manifest` | Tool manifest + event vocabulary. Start here. |
| `GET` | `/api/agent/poll?context=1` | Unprocessed events; `context=1` attaches the full health digest. |
| `POST` | `/api/agent/poll` | `{ ack: [ids] }` to mark events processed. |
| `POST` | `/api/agent/insights` | Push a finding: `title`, `body`, `severity`, `kind?`, `agentName?`. Appears in the ambient feed instantly. |

## Reports & data

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/report?format=json&days=30` | Structured report payload. |
| `GET` | `/api/report?format=html&sections=summary,narrative,bp,meds,glucose,questions&autoprint=1` | Print-ready A4 clinical HTML. |
| `GET` | `/api/export?format=csv&type=bp|glucose|medications` | CSV download. |
| `GET` | `/api/export?format=json` | Full backup (everything). |
| `GET` | `/api/events` | Event bus records (for debugging/agents). |
| `GET` | `/api/health` | Liveness probe for Docker/uptime monitors. |

## Realtime (socket.io, gateway-forwarded)

Channels: `hello`, `event` (type+priority), `insight:new` (full card payload), plus the companion **nudge** toast. Clients connect with `io('/?XTransformPort=3030')` behind the bundled gateway, or directly on `:3030` in plain Docker deployments.
