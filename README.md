<div align="center">

<img src="public/logo.svg" alt="OpenEir logo" width="120" />

# OpenEir

**Your health, understood.**

Self-hosted blood pressure & glucose tracking with ambient AI intelligence.
Private by design · Doctor-ready reports · Community-extensible.

`Apache-2.0` · `Next.js 16` · `SQLite` · `Docker` · `PWA`

</div>

---

## Why OpenEir

Most health trackers are dumb notebooks: they store numbers and draw lines. OpenEir treats your data as a **nervous system** — every reading, dose and sleep entry emits events, an orchestrator decides when attention is needed, and **Eir** (the ambient AI layer) responds with insight cards that cite *your actual numbers*, never generic advice. It runs entirely on your own hardware, in your own home, on a single SQLite file you can back up like a photo album.

### The three signature innovations

| | Feature | What it does |
|---|---|---|
| 📖 | **Blood Pressure Story** | Every week, Eir reads your readings, meds, sleep and tags, and writes an honest narrative of your week in plain language — what drove highs, what to watch, what went well. |
| 🧪 | **What-If Simulator** | Evidence-informed projections: "lose 5 kg, adopt DASH, +2 exercise days" → projected systolic, in-target %, glucose. Deterministic math from published effect sizes, plus an AI interpretation. |
| 📊 | **Eir Score** | One honest 0–100 composite (BP control, glucose TIR, adherence, wellbeing, consistency) — fully explainable, with a radar breakdown that shows exactly which lever moves it most. |

Plus an **Early Warning System** (rising-trend detection, variability spikes, morning surges, adherence drops, glucose creep) that fires *before* readings turn red, and an **agent harness** so your own autonomous agents can analyze your data and push findings into the ambient feed.

## Quick start (local)

```bash
git clone https://github.com/openeir/openeir.git
cd openeir
cp .env.example .env
bun install
bun run db:push
bun run dev
```

Open <http://localhost:3000>, take the 60-second setup wizard, record your first reading. Done.

Optional: 75 days of realistic demo data for evaluation:

```bash
bun run db:seed
```

## Quick start (Docker)

```bash
# essential tracking only
docker compose --profile core up -d

# + AI insights (built-in provider, or add Ollama below)
docker compose --profile core --profile ai up -d

# + autonomous agent harness sidecar
docker compose --profile core --profile ai --profile agent up -d
```

All state lives in the `openeir-data` volume. Back that up — it *is* your health record.

## AI: bring any model, or use the built-in one

OpenEir ships with a **built-in provider** (GLM 5.3 Flash by default — free, zero config) that starts working the moment you install. It is **not locked to one model**: open Settings → **AI providers** → ✏️ edit the built-in provider and set *any* model id the gateway supports.

Prefer your own stack? Add providers to the **fallback chain** — lowest priority number answers first:

- **Local**: Ollama (`http://ollama:11434/v1` when using the compose profile), LM Studio, vLLM, LocalAI
- **Cloud**: OpenAI, Anthropic, Mistral, DeepSeek, GLM, OpenRouter, LiteLLM — any OpenAI-compatible endpoint

Keys are AES-256-GCM encrypted at rest; every call is measured (latency, success) and shown in Settings. Privacy mode strips PII before anything leaves the box. AI autonomy is a dial — *off / gentle / proactive*. If the built-in provider is unreachable, the chain simply moves to the next provider.

## Feature tour

- 📈 **Tracking** — BP (ACC/AHA categories), glucose (context-aware, HbA1c estimate), carbs, pulse, custom tags, labels (morning/evening/pre-med…), lifestyle (mood, energy, sleep, stress, weight, sodium)
- 🫁 **Bluetooth devices** — Web Bluetooth GATT support for BP monitors (0x1810) and glucometers (0x1808) with proper SFLOAT parsing, in Chromium browsers
- 💊 **Medications** — schedules, adherence streaks, inventory with refill prediction, missed-dose recovery guidance, educational interaction checks
- 🧠 **Ambient intelligence** — event-driven orchestrator, context builder, rule engine first + AI enrichment second, realtime push over socket.io, quiet hours, de-duplication
- 🩺 **Doctor reports** — print-ready A4 clinical report with AI narrative, suggested doctor questions, CSV/JSON export of everything
- 🌐 **PWA** — installable, offline capture with automatic sync, background shell caching
- ♿ **Accessibility** — WCAG 2.1 AA target: high-contrast mode, large-text mode, simple mode, 44px+ touch targets, visible focus, screen-reader labels
- 🗣️ **Language packs** — community translations are coming soon (German, Simplified Chinese and Arabic/RTL packs are in progress — see [docs/LANGUAGE_PACKS.md](docs/LANGUAGE_PACKS.md) to help finish one)
- 🤖 **Agent harness** — MCP-style manifest, event polling, insight push: your agents become part of the nervous system

## Architecture in 20 seconds

```
PWA (Next.js 16, React 19, Tailwind 4, shadcn/ui)
   │  TanStack Query + offline queue
   ▼
Next.js API routes (zod-validated)  ──►  Event bus (persisted EventRecords)
   │                                        │
   │                                        ▼
   │                              AI Orchestrator ──► Rule engine (free, instant)
   │                                        │
   │                                        ▼
   │                              Provider chain (built-in · OpenAI-compatible · Anthropic · Ollama)
   │
   └── socket.io (ambient insight push) ◄── realtime mini-service
SQLite (Prisma) — one file, easy backups
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map.

## Deployment & operations

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, reverse proxies, HTTPS, backups, updates
- [docs/API.md](docs/API.md) — every endpoint, including the agent harness
- [docs/PLUGINS.md](docs/PLUGINS.md) — build community plugins
- [docs/LANGUAGE_PACKS.md](docs/LANGUAGE_PACKS.md) — contribute a translation
- [docs/DEVICE_ADAPTERS.md](docs/DEVICE_ADAPTERS.md) — add Bluetooth devices
- [docs/SECURITY.md](docs/SECURITY.md) — threat model & data handling
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/FAQ.md](docs/FAQ.md)

## Privacy, in one breath

Your readings live in one SQLite file on your machine. There is no cloud, no account, no telemetry. The only data that can leave the box is the context text you explicitly allow an AI provider to process — with a local-first preference, a PII-strip mode, and an off switch. AI keys are encrypted at rest with an instance key stored beside the database.

## Health disclaimer

OpenEir is an information tool for people who already track their health with their doctors' knowledge. It is **not a medical device**, does not diagnose, and never replaces professional care. Crisis-level readings trigger a re-measure-and-contact-your-doctor message — that is the correct limit of its authority.

## Contributing

We want this to be the best open-source health tracker, which means we need your brain. Read [CONTRIBUTING.md](CONTRIBUTING.md) — language packs and device adapters are deliberately designed as low-barrier first contributions.

## License

Apache-2.0 — see [LICENSE](LICENSE).
