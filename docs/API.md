# API reference

Base: same origin as the UI. All request bodies are JSON and validated with zod (`422` on validation failure with an `issues` array). Rate-limited endpoints return `429`.

## Readings

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/readings/bp?days=90&limit=500` | Newest first. `tags` is a JSON string. |
| `POST` | `/api/readings/bp` | Body: `systolic 60..260`, `diastolic 30..180`, `pulse?`, `arm?`, `label? (morning/evening/pre_med/post_med/general)`, `tags?: string[]`, `notes?`, `takenAt?: ISO`, `source?: manual/bluetooth/import`. Emits `READING_LOGGED`. |
| `PATCH` | `/api/readings/bp/:id` | Partial update. |
| `DELETE` | `/api/readings/bp/:id` | Hard delete. |
| `GET` | `/api/readings/glucose?days=90` | Values canonical in mmol/L. |
| `POST` | `/api/readings/glucose` | Body: `value 1..40`, `context? (fasting/pre_meal/post_meal/bedtime/random)`, `carbs?`, … Emits `READING_LOGGED`. |
| `PATCH` / `DELETE` | `/api/readings/glucose/:id` | |

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
| `GET` / `PUT` | `/api/profile` | Profile + clinical targets + `prefs` (theme, quiet hours, aiAutonomy, reminders). |

## Intelligence

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/stats` | The dashboard aggregate: last reading, 30d BP/glucose, adherence, Eir Score, warnings, today's med schedule, refills, interactions, chart series. |
| `GET` | `/api/insights?limit=30` | Ambient feed (non-dismissed, pinned first). |
| `POST` | `/api/insights` | Trigger a `PATTERN_CHECK` (202 + event id). |
| `PATCH` / `DELETE` | `/api/insights/:id` | `status: new/seen/dismissed/actioned`, `pinned`. |
| `POST` | `/api/ai/ask` | Body: `question ≤400 chars`. Synchronous, context-grounded answer; also lands in the feed. |
| `GET` | `/api/ai/story` | This week's Blood Pressure Story (cached per ISO week). `?force=1` regenerates. |
| `POST` | `/api/ai/whatif` | Body: `params` (weight/sodium/exercise/sleep/carbs/adherence/…) → deterministic projection + AI narrative. |
| `GET` / `POST` | `/api/ai/providers` | Provider chain CRUD. Keys are write-only, AES-256-GCM at rest. |
| `PATCH` / `DELETE` | `/api/ai/providers/:id` | |
| `POST` | `/api/ai/providers/:id/test` | Sends a real `ping`; reports latency and which provider in the chain actually answered. |

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
| `GET` | `/api/health` | Liveness probe for Docker/uptime monitors. |

## Realtime (socket.io, gateway-forwarded)

Channels: `hello`, `event` (type+priority), `insight:new` (full card payload). Clients connect with `io('/?XTransformPort=3030')` behind the bundled gateway, or directly on `:3030` in plain Docker deployments.
