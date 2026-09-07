<div align="center">

<img src="public/logo.svg" alt="OpenEir logo" width="120" />

# OpenEir

**Your health, understood.**

Self-hosted AI medical assistant with an open agent harness.
Ambient health intelligence on your own hardware — your data, your models, your rules.

`Apache-2.0` · `Next.js 16` · `SQLite` · `Docker` · `PWA`

</div>

---

## Why OpenEir

Most health tools are either dumb notebooks (they store numbers and draw lines) or black-box chatbots (they hallucinate advice and ship your data to a cloud). OpenEir is a third thing: an **AI medical assistant built like a nervous system**. Every reading, dose, meal and sleep entry emits events. A rule engine evaluates them instantly, free and deterministic. An orchestrator decides when deeper attention is needed, and **Eir** — the ambient AI layer — responds with insight cards that cite *your actual numbers*, never generic advice. Around all of it sits an **open agent harness**, so your own agents can join the medical team.

It runs entirely on your own hardware, in your own home, on a single SQLite file you can back up like a photo album.

### Not a two-metric tracker — a growing medical assistant

Blood pressure and glucose are where OpenEir starts, not where it ends. The platform is domain-agnostic by design: every health signal flows through the same event bus → rule engine → AI orchestrator → Eir Score → agent harness pipeline. New domains don't fork the architecture — they plug into it.

| Status | Health domain |
|---|---|
| ✅ Shipped in v1.0 | **Blood pressure** — ACC/AHA categorization, morning/evening context, pulse |
| ✅ Shipped in v1.0 | **Glucose** — context-aware ranges, time-in-range, HbA1c estimate |
| ✅ Shipped in v1.0 | **Medications** — schedules, adherence, inventory & refill prediction, interaction education |
| ✅ Shipped in v1.0 | **Lifestyle** — mood, energy, sleep, stress, weight, sodium, exercise, carbs |
| ✅ Shipped in v1.0 | **Doctor-ready reports** — print-ready A4 clinical narrative, suggested questions, full export |
| 🧩 Architecture ready | Heart rate & SpO₂, body composition, lab biomarkers, symptoms & journaling, nutrition detail, sleep staging — each lands as a domain module with the whole intelligence stack lit up from day one |

Community contributions decide what ships next — see [docs/ROADMAP.md](docs/ROADMAP.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

### The three signature innovations

| | Feature | What it does |
|---|---|---|
| 📖 | **Blood Pressure Story** | Every week, Eir reads your readings, meds, sleep and tags, and writes an honest narrative of your week in plain language — what drove highs, what to watch, what went well. |
| 🧪 | **What-If Simulator** | Evidence-informed projections: "lose 5 kg, adopt DASH, +2 exercise days" → projected systolic, in-target %, glucose. Deterministic math from published effect sizes, plus an AI interpretation. |
| 📊 | **Eir Score** | One honest 0–100 composite (BP control, glucose TIR, adherence, wellbeing, consistency) — fully explainable, with a radar breakdown that shows exactly which lever moves it most. |

Plus an **Early Warning System** (rising-trend detection, variability spikes, morning surges, adherence drops, glucose creep) that fires *before* readings turn red.

## The agent harness — your agents, on the medical team

OpenEir ships with an MCP-style harness that treats external autonomous agents as **first-class citizens of the assistant**, not plugins bolted on the side:

- `GET /api/agent/manifest` — capability manifest describing the health state your agent can observe
- `GET /api/agent/poll` — structured health context (profile, targets, 30-day stats, adherence, Eir Score, warnings, correlations)
- `POST /api/agent/insights` — push findings into the ambient feed, deduplicated and governed by the same quiet-hours and autonomy rules as the built-in AI
- [examples/agent-harness](examples/agent-harness) — a working autonomous agent that polls, analyzes and pushes insights on its own schedule

Bring any framework — LangChain, CrewAI, a cron script, a Home Assistant automation. If it can call HTTP, it can be part of the medical team.

## Quick start (local)

```bash
git clone https://github.com/Solaceking/openeir.git
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

OpenEir ships with a **built-in provider** (GLM 5.3 Flash by default). It is **not locked to one model**: open Settings → **AI providers** → ✏️ edit the built-in provider and set *any* model id the gateway supports.

**Where the built-in AI actually comes from:** the built-in provider talks to a GLM gateway through `z-ai-web-dev-sdk`. The SDK finds its gateway credentials in a `.z-ai-config` JSON file (`{"baseUrl": "…", "apiKey": "…"}`), scanned in this order:

1. `./.z-ai-config` — project root
2. `~/.z-ai-config` — your home directory
3. `/etc/.z-ai-config` — provisioned automatically inside managed environments

On a self-hosted clone none of those exist yet — that's expected. Either:

- add a `.z-ai-config` file with your gateway `baseUrl` + `apiKey`, **or**
- set `ZAI_API_KEY` and `ZAI_BASE_URL` env vars (OpenEir bootstraps the config file from them at first use), **or**
- skip the built-in provider entirely and connect any provider below — Settings → AI shows exactly which config source (if any) the gateway found.

Prefer your own stack? Add providers to the **fallback chain** — lowest priority number answers first:

- **Local**: Ollama (`http://ollama:11434/v1` when using the compose profile), LM Studio, vLLM, LocalAI
- **Cloud**: OpenAI, Anthropic, Mistral, DeepSeek, GLM, OpenRouter, LiteLLM — any OpenAI-compatible endpoint

Keys are AES-256-GCM encrypted at rest; every call is measured (latency, success) and shown in Settings. Privacy mode strips PII before anything leaves the box. AI autonomy is a dial — *off / gentle / proactive*. If the built-in provider is unreachable, the chain simply moves to the next provider.

### Talking to Eir out loud (Talk → live voice)

Voice runs entirely on open web APIs plus your own server: **speech-to-text** is the browser's Web Speech API (Chrome, Edge and Safari; Firefox users get the typed composer with spoken replies), **text-to-speech** is server-side Edge neural voices synthesized inside your OpenEir instance — no keys, no cloud account, cached on disk. Eir always shows her replies as text too, so a muted device never silences the conversation. Microphone permission is required for listening (localhost and HTTPS only), and Eir greets you the moment live mode opens so you know audio works before you start talking.

## Feature tour

- 📈 **Tracking** — BP (ACC/AHA categories), glucose (context-aware, HbA1c estimate), carbs, pulse, custom tags, labels (morning/evening/pre-med…), lifestyle (mood, energy, sleep, stress, weight, sodium)
- 📷 **Photo scan (OCR)** — photograph a BP monitor or glucometer and OpenEir reads it: vision model through your provider chain first, local offline OCR fallback second, deterministic parser as the floor. Every scan is a *suggestion* — you confirm before it saves, and machine captures are duplicate-guarded against readings logged minutes earlier by any other source
- 🫁 **Bluetooth devices** — Web Bluetooth GATT support for BP monitors (0x1810) and glucometers (0x1808) with proper SFLOAT parsing, in Chromium browsers
- 💊 **Medications** — schedules, adherence streaks, inventory with refill prediction, missed-dose recovery guidance, educational interaction checks
- 🧠 **Ambient intelligence** — event-driven orchestrator, context builder, rule engine first + AI enrichment second, realtime push over socket.io, quiet hours, de-duplication
- 🤖 **Agent harness** — MCP-style manifest, event polling, insight push: your agents become part of the nervous system
- 🩺 **Doctor reports** — print-ready A4 clinical report with AI narrative, suggested doctor questions, CSV/JSON export of everything
- 🌐 **PWA** — installable, offline capture with automatic sync, background shell caching
- ♿ **Accessibility** — WCAG 2.1 AA target: high-contrast mode, large-text mode, simple mode, 44px+ touch targets, visible focus, screen-reader labels
- 🗣️ **Language packs** — community translations are coming soon (German, Simplified Chinese and Arabic/RTL packs are in progress — see [docs/LANGUAGE_PACKS.md](docs/LANGUAGE_PACKS.md) to help finish one)

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

OpenEir is an information assistant for people who already manage their health with their doctors' knowledge. It is **not a medical device**, does not diagnose, and never replaces professional care. Crisis-level readings trigger a re-measure-and-contact-your-doctor message — that is the correct limit of its authority.

## Contributing

We want this to be the best open-source AI medical assistant, which means we need your brain. Read [CONTRIBUTING.md](CONTRIBUTING.md) — language packs, device adapters and new health-domain modules are deliberately designed as low-barrier first contributions.

## License

Apache-2.0 — see [LICENSE](LICENSE).
