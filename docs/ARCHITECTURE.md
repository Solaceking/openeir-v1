# Architecture

OpenEir is a modular, event-driven platform. Every architectural decision optimizes for three things: **privacy** (everything local by default), **honesty** (rules and math before AI), and **extensibility** (community contributions are first-class).

## System map

```
┌──────────────────────────────────────────────────────────────────────┐
│                           PWA (Next.js 16)                           │
│  React 19 · Tailwind 4 · shadcn/ui · TanStack Query · Zustand        │
│  offline queue (localStorage) · service worker (shell + API cache)   │
│  Web Bluetooth adapters · i18n runtime · a11y theming                │
└────────────┬────────────────────────────────────────┬────────────────┘
             │ REST (zod-validated)                   │ socket.io (ambient push)
             ▼                                        ▼
┌─────────────────────────────┐          ┌─────────────────────────────┐
│      Next.js API routes     │          │   Realtime mini-service     │
│  /api/readings · meds ·     │  emit    │   socket.io :3030           │
│  lifestyle · insights ·     │─────────►│   (control :3031 internal)  │
│  stats · ai/* · agent/* ·   │          └─────────────────────────────┘
│  report · export · health   │
└──────┬──────────────────────┘
       │ events (persisted)
       ▼
┌─────────────────────────────┐     ┌─────────────────────────────────┐
│        Event bus            │     │   AI Orchestrator               │
│ EventRecord table: type,    │────►│ 1. rule engine (free, instant)  │
│ priority, payload, processed│     │ 2. dedupe + quiet hours +       │
└─────────────────────────────┘     │    autonomy gate                │
                                    │ 3. context builder (rich state) │
┌─────────────────────────────┐     │ 4. provider chain → enrichment  │
│   SQLite (Prisma)           │◄────┤ 5. insight creation + realtime  │
│ profile, readings, meds,    │     └─────────────────────────────────┘
│ logs, insights, events,     │                    │
│ providers (AES-GCM keys),   │                    ▼
│ usage, stories, scenarios   │     ┌─────────────────────────────────┐
└─────────────────────────────┘     │ Provider chain (ordered)        │
                                    │ builtin_zai → ollama → openai_  │
┌─────────────────────────────┐     │ compatible → anthropic          │
│  Agent harness (yours)      │────►│ usage + latency recorded        │
│  poll · manifest · push     │     └─────────────────────────────────┘
└─────────────────────────────┘
```

## The event-driven core

Events are the only way anything interesting happens:

| Event | Emitted when | Typical response |
|---|---|---|
| `READING_LOGGED` | BP/glucose saved | categorization, celebration, out-of-range warnings, AI enrichment |
| `MEDICATION_MISSED` | dose marked missed | recovery guidance, adherence warnings |
| `MEDICATION_TAKEN` | dose taken | streak celebrations |
| `PATTERN_CHECK` | dashboard load / manual | early-warning sweep, engagement nudges |
| `MILESTONE_REACHED` | streaks, goals | celebrations |
| `REPORT_VIEWED`, `BROWSING_CONTEXT` | user activity | future proactive report prep |
| `MANUAL_QUERY` | Ask Eir | direct AI answer (contexted) |
| `BLUETOOTH_SYNCED` | device import | sync confirmation |

Events are **persisted first** (`EventRecord`), which gives audit trails and lets external agents poll them. The orchestrator processes asynchronously — recording a reading never blocks on an AI call.

## The orchestrator's decision ladder

1. **Rule engine** — deterministic, zero-cost, instant. Categorization, celebrations, warnings from `src/lib/health/warnings.ts`. This alone powers a fully functional experience with AI autonomy set to *off*.
2. **Gates** — quiet hours, autonomy level (`off/gentle/proactive`), 6-hour title de-duplication.
3. **Context builder** — assembles profile, targets, 7/30/60-day windows, adherence, correlations, sleep→BP pairing, Eir Score, recent insights. Serialized compactly for prompts.
4. **Provider chain** — `builtin_zai` → Ollama → OpenAI-compatible → Anthropic, ordered by priority. Every attempt records usage/latency/status; failures cascade.
5. **Presentation** — insights are written as cards (not chat): severity, kind, body, optional data payload. Realtime push shows a toast instantly.

## Why SQLite (not Postgres)

For a single household, a single file that lives in a volume is *the* correct engineering: atomic backups, no daemon, no credentials to leak, WAL-mode concurrency is ample. The Prisma layer means a Postgres migration is a `provider` change for deployments that outgrow it.

## Layer boundaries (for contributors)

- `src/lib/health/*` — **pure functions**. No DB, no IO. Unit-testable: categories, stats, score, warnings, what-if, meds logic.
- `src/lib/ai/*` — orchestrator, context builder, provider chain. The only place that talks to LLMs.
- `src/app/api/*` — zod-validated boundaries over the DB + event bus. No business logic beyond orchestration glue.
- `src/components/views/*` — feature UI. Consumes `api-client.ts` hooks only.
- `public/language-packs/*` — pure JSON; loaded lazily; missing keys fall back to `src/lib/i18n/en.ts`.
- `examples/agent-harness/` — a real working agent that polls and pushes; copy it as your starting point.

## Security model

- API keys encrypted at rest (AES-256-GCM, key file `db/.appkey`, `APP_KEY` env to override).
- Rate limiting on write/AI endpoints; zod validation everywhere; no secrets in client bundles (SDK is server-only).
- Agent endpoints are network-local by design — expose them deliberately if you must, ideally behind an authenticated reverse proxy.
