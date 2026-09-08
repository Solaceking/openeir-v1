# Architecture

OpenEir is a modular, event-driven platform. Every architectural decision optimizes for three things: **privacy** (everything local by default), **honesty** (rules and math before AI, failures that name themselves), and **extensibility** (community contributions are first-class).

## System map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             PWA (Next.js 16)                               │
│   React 19 · Tailwind 4 · shadcn/ui · TanStack Query · Zustand             │
│   offline queue (localStorage) · service worker v2 (shell + API + push)    │
│   Web Bluetooth adapters · i18n runtime · a11y theming · Newsreader design │
│                                                                            │
│   Talk thread      Live-voice session (WebGL orb, barge-in)                │
│   Voice capture    Safety view (SOS ring, contacts, companion)             │
│   Dashboard (Eir Score · briefing card · ambient feed)                     │
└──────────┬─────────────────────────────────┬───────────────────────────────┘
           │ REST (zod-validated)            │ socket.io (ambient push)
           ▼                                 ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│      Next.js API routes      │   │  Realtime mini-service       │
│  readings · meds · lifestyle │  emit │  socket.io :3030          │
│  chat · memory · briefing    │──►│  (control :3031 internal)    │
│  push · companion · emergency│   └──────────────────────────────┘
│  voice/tts · ocr · places    │
│  stats · ai/* · agent/*      │   ┌──────────────────────────────┐
└──────┬───────────────────────┘   │  web-push (VAPID, auto-      │
       │ events (persisted)        │  provisioned) → every device │
       ▼                           └──────────────────────────────┘
┌──────────────────────────────┐   ┌──────────────────────────────┐
│        Event bus             │   │  Edge TTS engine             │
│ EventRecord: type, priority, │   │  msedge-tts → MP3 → disk     │
│ payload, processed           │──►│  cache (.tts-cache, ETag)    │
└──────────────────────────────┘   └──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐     ┌─────────────────────────────────┐
│   AI Orchestrator            │     │  Provider chain (ordered)       │
│ 1. rule engine (free, fast)  │────►│ builtin_zai → 16 presets →      │
│ 2. gates: quiet hours,       │     │ CLI harness (claude/codex/      │
│    autonomy, dedupe          │     │ gemini/opencode) → local        │
│ 3. context builder + memory  │     │ every call: tokens, latency,    │
│ 4. chain → enrichment        │     │ cost, status recorded           │
│ 5. insight + realtime + push │     └─────────────────────────────────┘
└──────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────┐
│  SQLite (Prisma) — 19 models, one file                         │
│  profile · bp/glucose readings · meds + logs · lifestyle       │
│  insights · events · providers (AES-GCM keys) · usage          │
│  stories · what-if · chat messages · app settings              │
│  emergency contacts · companion links (hashed tokens)          │
│  push subscriptions · memory entries · emergency events        │
└────────────────────────────────────────────────────────────────┘
```

## The event-driven core

Events are the only way anything interesting happens:

| Event | Emitted when | Typical response |
|---|---|---|
| `READING_LOGGED` | BP/glucose saved (any source: manual · bluetooth · voice · chat · photo) | categorization, celebrations, out-of-range warnings, duplicate guard, AI enrichment |
| `MEDICATION_MISSED` | dose marked missed | recovery guidance, adherence warnings, companion visibility |
| `MEDICATION_TAKEN` | dose taken | streak celebrations |
| `PATTERN_CHECK` | dashboard load / manual | early-warning sweep, engagement nudges |
| `MILESTONE_REACHED` | streaks, goals | celebrations |
| `REPORT_VIEWED`, `BROWSING_CONTEXT` | user activity | future proactive report prep |
| `MANUAL_QUERY` | Ask Eir | direct AI answer (contexted) |
| `BLUETOOTH_SYNCED` | device import | sync confirmation |

Events are **persisted first** (`EventRecord`), which gives audit trails and lets external agents poll them. The orchestrator processes asynchronously — recording a reading never blocks on an AI call.

## The orchestrator's decision ladder

1. **Rule engine** — deterministic, zero-cost, instant. Categorization, celebrations, warnings (`src/lib/health/warnings.ts`). This alone powers a fully functional experience with AI autonomy set to *off*.
2. **Gates** — quiet hours, autonomy level (`off/gentle/proactive`), 6-hour title de-duplication.
3. **Context builder** — profile, targets, 7/30/60-day windows, adherence, correlations, sleep→BP pairing, Eir Score, recent insights — plus the **memory block** (pinned core + relevant semantic/episodic entries).
4. **Provider chain** — ascending priority: API presets (OpenRouter, OpenAI, Anthropic, Gemini, Groq, …) → CLI harness (subscription auth) → local (Ollama, LM Studio, vLLM). Nothing pre-seeded; every attempt records usage/latency/status; failures cascade with named errors. Every attempt records usage/latency/status; failures cascade with named errors.
5. **Presentation** — insight cards (severity, kind, body, payload) + realtime toast + optional web push.

## The conversation stack

- **Thread**: `ChatMessage` (role/content/meta/channel) — one persistent thread; replies are grounded (context + memory + 16-turn window) and carry **action cards** from `detectAction()`, the same deterministic parser as voice capture.
- **Live session**: client state machine `listening → thinking → speaking` with sentence-chunked TTS, warm prefetch of the next sentence, barge-in via mic-RMS gate + echo cooldown or a final transcript during playback, and a composer that never dies.
- **Orb**: dependency-free WebGL (domain-warped fBm plasma, 4-state palette, star field, grain) driven by mic RMS and actual output amplitude.
- **TTS**: server-side `msedge-tts` → MP3 → disk cache → in-memory blob cache → `SpeechSynthesis` fallback. **STT**: browser Web Speech API with typed-composer degradation.

## The memory system

Three tiers (`core` pinned / `semantic` durable / `episodic` decaying ~30d), written by 8 deterministic extractors + async AI extraction + the nightly reflection; dedupeKey bumping, recall-count promotion, access-warm retrieval injected into every chat prompt. See [MEMORY_AND_BRIEFING.md](MEMORY_AND_BRIEFING.md).

## The safety layer

`EmergencyEvent` (location + resolved context + dispatcher package + share token + notified channels) · `EmergencyContact` (multi-channel) · `CompanionLink` (sha256 single-use invite + long-lived hashed viewer token + scopes + revocation) · VAPID web-push fan-out. Everything auditable, nothing automated toward real dispatchers. See [SAFETY.md](SAFETY.md).

## Why SQLite (not Postgres)

For a single household, a single file that lives in a volume is *the* correct engineering: atomic backups, no daemon, no credentials to leak, WAL-mode concurrency is ample. The Prisma layer means a Postgres migration is a `provider` change for deployments that outgrow it.

## Layer boundaries (for contributors)

- `src/lib/health/*` — **pure functions**. No DB, no IO. Unit-testable: categories, stats, score, warnings, what-if, meds logic.
- `src/lib/voice/*` — parser (pure), STT/TTS wrappers, orb engine, edge-voice catalog.
- `src/lib/ai/*` — orchestrator, context builder, provider chain, presets, harness, builtin bootstrap. The only place that talks to LLMs.
- `src/lib/memory.ts`, `briefing.ts`, `reflection.ts`, `push.ts`, `places.ts` — the ambient/safety services.
- `src/app/api/*` — zod-validated boundaries over the DB + event bus. No business logic beyond orchestration glue.
- `src/components/views/*` — feature UI. Consumes `api-client.ts` hooks only.
- `public/language-packs/*` — pure JSON; loaded lazily; missing keys fall back to `src/lib/i18n/en.ts`.
- `examples/agent-harness/` — a real working agent that polls and pushes; copy it as your starting point.

## Security model

- API keys encrypted at rest (AES-256-GCM, key file `db/.appkey`, `APP_KEY` env to override).
- Companion invite/viewer tokens and SOS share tokens stored **hashed**; invites single-use.
- VAPID private keys live in your `AppSetting` table — generated on-instance, never shipped.
- Rate limiting on write/AI endpoints; zod validation everywhere; no secrets in client bundles (SDK and TTS are server-only).
- Agent endpoints are network-local by design — expose them deliberately if you must, ideally behind an authenticated reverse proxy.
