<div align="center">

<img src="public/logo.svg" alt="OpenEir logo" width="120" />

# OpenEir

**Your health, understood. Talk to it. Trust it with your mornings.**

Self-hosted AI medical assistant — a conversational companion you can *speak with out loud*, a safety net that calls for help, a memory that never forgets what matters to you, and an open agent harness for your own AI agents. Your data, your models, your rules.

`Apache-2.0` · `Next.js 16` · `React 19` · `SQLite` · `Docker` · `PWA`

<a href="https://railway.com?referralCode=i3reF8"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="40"></a>&nbsp;&nbsp;<a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Solaceking/openeir&refcode=63b912d60f9a"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="40"></a>

</div>

---

## Why OpenEir

Most health tools are either dumb notebooks (they store numbers and draw lines) or black-box chatbots (they hallucinate advice and ship your data to a cloud). OpenEir is a third thing: an **AI medical assistant built like a nervous system** — and since v1.1, one you can actually *talk to*.

Every reading, dose, meal and sleep entry emits events. A rule engine evaluates them instantly, free and deterministic. An orchestrator decides when deeper attention is needed, and **Eir** — the ambient AI layer — responds with insight cards that cite *your actual numbers*, never generic advice. You can type to her in a WhatsApp-grade thread, **press one button and speak with her out loud** (she speaks back in a studio-quality neural voice, and she knows she can). If you fall or feel wrong, a **held SOS** builds a dispatcher-ready emergency package in seconds. A **trusted person** can pair to your instance and watch over you remotely. Every morning, Eir gives you a **briefing** — spoken if you like. And she **remembers** what you tell her, in three tiers, forever or for as long as it matters.

It runs entirely on your own hardware, in your own home, on a single SQLite file you can back up like a photo album.

---

## The complete feature map

| Domain | What you get |
|---|---|
| 🩸 **Blood pressure** | ACC/AHA categorization, morning/evening context, pulse, trends, story narratives |
| 🍬 **Glucose** | Context-aware ranges (fasting / pre-meal / post-meal / bedtime), time-in-range, estimated HbA1c |
| 💊 **Medications** | Schedules, adherence streaks, inventory with refill prediction, missed-dose recovery, interaction education |
| 🥗 **Lifestyle** | Mood, energy, sleep, stress, weight, sodium — correlated against vitals |
| 🗣️ **Talk** | A persistent, WhatsApp-grade conversation thread. Eir has your *full* health context — she can log readings and meds from plain chat ("BP 118 over 76, pulse 64" → confirm card → saved) |
| 🎙️ **Live voice** | One tap → full-duplex voice session: WebGL voice orb, neural TTS replies, barge-in interruption, sentence-by-sentence streaming speech. Eir *knows* she can speak and hear |
| 🎛️ **Voice capture** | "Blood pressure one twenty over seventy-six" → on-device deterministic parser → spoken readback → confirm. Works for meds and notes too |
| 🚨 **SOS & safety** | Hold-to-trigger SOS → location + nearest emergency department + country-correct emergency number + plus-code → dispatcher card (shareable link) → all contacts notified → full audit trail |
| 👥 **Companion** | Pair a trusted person with a one-time invite. They get a scoped live dashboard (status, meds, vitals), can nudge you, and are auto-added to emergency contacts. Consent-based, revocable, audit-logged |
| 🌅 **Morning Briefing** | Every morning: score badge, BP vs target with trend, glucose + eA1c, adherence streak, today's doses, one honest focus for the day. Readable *and* speakable |
| 🧠 **Memory** | Three tiers — pinned core facts, durable semantic knowledge, decaying episodic notes. Eir recalls your name, your daughter's, your allergies, your plans — across every conversation |
| 🌙 **Nightly reflection** | While you sleep, Eir reflects on the day — chat, readings, doses — and writes it into long-term memory; missed doses and spiking BP become morning insights |
| 🔔 **Web Push** | Real outbound notifications (VAPID auto-provisioned, zero config): SOS alerts, companion nudges, briefing delivery — to every device you've subscribed |
| 📷 **Photo scan (OCR)** | Photograph a BP monitor or glucometer — vision model through your provider chain, offline OCR fallback, deterministic parser as the floor. You always confirm |
| 🫁 **Bluetooth devices** | Web Bluetooth GATT for BP monitors (0x1810) and glucometers (0x1808) with proper SFLOAT parsing |
| 📖 **Blood Pressure Story** | Weekly AI narrative of your week in plain language — what drove highs, what to watch |
| 🧪 **What-If Simulator** | "Lose 5 kg, adopt DASH, +2 exercise days" → deterministic projections from published effect sizes + AI interpretation |
| 📊 **Eir Score** | One honest 0–100 composite (BP control, glucose TIR, adherence, wellbeing, consistency), fully explainable with a radar breakdown |
| 🩺 **Doctor reports** | Print-ready A4 clinical narrative, suggested questions, CSV/JSON export of everything |
| 🤖 **Agent harness** | MCP-style manifest, event polling, insight push — your agents join the medical team |
| 🌐 **PWA** | Installable, offline capture with automatic sync, background shell caching, push notifications |
| ♿ **Accessibility** | WCAG 2.1 AA target: high-contrast, large-text and simple modes, 44px+ touch targets, visible focus, screen-reader labels |

Community contributions decide what ships next — see [docs/ROADMAP.md](docs/ROADMAP.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Quick start (one-click deploy)

Let a platform do the work — deploy straight from this repository:

<p align="center">
<a href="https://railway.com?referralCode=i3reF8"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="44"></a>&nbsp;&nbsp;
<a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Solaceking/openeir&refcode=63b912d60f9a"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="44"></a>
</p>

Both buttons walk you through a guided setup. Two things to give the app and it's home for life: a **persistent volume at `/app/db`** (Railway: *Volume*; DigitalOcean App Platform: *mount path*) and HTTPS — which both platforms terminate for you by default. The referral codes in these buttons support OpenEir's development at no extra cost to you. Full platform recipes (Railway, Render, Fly.io, Coolify, Umbrel, Synology, the Vercel caveat and more): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start (local)

```bash
git clone https://github.com/Solaceking/openeir.git
cd openeir
cp .env.example .env
bun install
bun run db:push
bun run dev
```

Open <http://localhost:3000>, take the 60-second setup wizard (now with **map-searched GP** and **emergency contacts**), say hello in **Talk**. Done — the built-in AI works out of the box (see below for how), or connect your own provider in Settings → AI.

Optional: 75 days of realistic demo data for evaluation:

```bash
bun run db:seed
```

## Quick start (Docker)

```bash
# essential tracking only
docker compose --profile core up -d

# + AI (built-in provider, or add Ollama below)
docker compose --profile core --profile ai up -d

# + autonomous agent harness sidecar
docker compose --profile core --profile ai --profile agent up -d
```

All state lives in the `openeir-data` volume. Back that up — it *is* your health record. Platform-by-platform deployment and operations: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## The AI: built-in, or bring your own — both first-class

### Where the built-in AI actually comes from

OpenEir ships with a **built-in provider**: a GLM model reached through the Z.ai gateway via `z-ai-web-dev-sdk`. It is **enabled automatically when credentials exist** — and on a fresh clone, OpenEir now *auto-seeds* the provider row and tells you exactly what's missing instead of failing silently.

The SDK finds its gateway credentials in a `.z-ai-config` JSON file (`{"baseUrl": "…", "apiKey": "…"}`), scanned in this order:

1. `./.z-ai-config` — project root
2. `~/.z-ai-config` — your home directory
3. `/etc/.z-ai-config` — provisioned automatically inside managed environments

On a self-hosted clone none of those exist yet — that's expected, and the app now handles it gracefully. Either:

- add a `.z-ai-config` file with your gateway `baseUrl` + `apiKey`, **or**
- set `ZAI_API_KEY` and `ZAI_BASE_URL` env vars (OpenEir bootstraps the config file from them at first use, permissions `600`), **or**
- skip the built-in provider entirely and connect any provider below — Settings → AI shows exactly which config source (if any) the gateway found, with a green strip when configured and an amber setup guide when not.

If no provider is configured at all, Talk replies with an honest banner naming the exact config paths and a **Connect an AI provider** deep-link — never a silent failure.

### The provider system: 16 presets, a live model catalog, and subscriptions

Settings → **AI providers** gives you:

- **16 curated presets** — OpenRouter, OpenAI, Anthropic, Google Gemini, Z.ai (GLM), Z.ai Coding Plan, xAI, DeepSeek, Moonshot, NVIDIA NIM, Groq, Mistral, LM Studio, Ollama, custom/self-hosted, and the built-in.
- **A live, always-current model catalog** powered by [models.dev](https://models.dev) — every preset's model dropdown lists real models with context window, $/M pricing, and release date, newest first. Cached 12h, served stale on network errors. Never hardcoded, never aged.
- **A fallback chain** — lowest priority number answers first; failures cascade; every call records latency, tokens and estimated cost.
- **Subscription auth via CLI harness** — use your existing ChatGPT Plus / Claude Pro / Google / OpenCode subscriptions: OpenEir detects installed CLIs (`claude`, `codex`, `gemini`, `opencode`), shows login recipes, and attaches them as providers. Z.ai Coding Plan keys bridge through the documented recipe.
- **Privacy mode** per provider strips PII before anything leaves the box. Keys are AES-256-GCM encrypted at rest. AI autonomy is a dial — *off / gentle / proactive*.

### Talking to Eir out loud (Talk → live voice)

Voice runs on open web APIs plus your own server: **speech-to-text** is the browser's Web Speech API (Chrome, Edge, Safari; Firefox gets the typed composer with spoken replies), **text-to-speech** is server-side Edge neural voices synthesized *inside* your instance — no keys, no cloud account, cached on disk. The live session opens with a spoken greeting (so you instantly know audio works), Eir replies sentence-by-sentence while typing them on screen, and you can **interrupt her mid-sentence** — she stops and listens. If she ever hits an error she says so, and the composer is always there.

Full details, browser matrix and troubleshooting: [docs/VOICE_AND_TALK.md](docs/VOICE_AND_TALK.md).

---

## Safety, companion, memory, briefing — the ambient layer

- 🚨 **SOS** (hold 1s): builds a dispatcher package — your conditions, meds, allergies, latest vitals, GP, exact location with plus-code, the country-correct emergency number and the nearest emergency department — then notifies every contact channel and every subscribed device. A public, tokenized dispatcher card (`/sos/[token]`) renders it read-only for whoever you call. Cancel or resolve anytime; everything is audited.
- 👥 **Companion**: generate a one-time invite, share it; on acceptance your person gets a long-lived scoped viewer token and a live dashboard with check-in freshness, app heartbeat, meds, vitals, an SOS banner and a nudge button (real-time toast in-app, web push when the app is closed). Revoke kills access instantly.
- 🌅 **Morning Briefing**: deterministic from your real data — never hallucinated. Listen to it spoken with one tap, or let push deliver it to every device on your schedule.
- 🧠 **Memory**: deterministic extractors catch names, allergies, diagnoses, doctors, preferences, family and plans from your conversations; important things get pinned, mundane things decay after 30 days, repeated recall promotes them. The nightly reflection condenses each day into memory.
- 🔔 **Push**: VAPID keys are generated into your database on first use — zero configuration, fully self-hosted. Device management and a test button live in Settings → Alerts.

Full guides: [docs/SAFETY.md](docs/SAFETY.md) · [docs/MEMORY_AND_BRIEFING.md](docs/MEMORY_AND_BRIEFING.md)

---

## The agent harness — your agents, on the medical team

OpenEir ships with an MCP-style harness that treats external autonomous agents as **first-class citizens of the assistant**, not plugins bolted on the side:

- `GET /api/agent/manifest` — capability manifest describing the health state your agent can observe
- `GET /api/agent/poll` — structured health context (profile, targets, 30-day stats, adherence, Eir Score, warnings, correlations)
- `POST /api/agent/insights` — push findings into the ambient feed, deduplicated and governed by the same quiet-hours and autonomy rules as the built-in AI
- [examples/agent-harness](examples/agent-harness) — a working autonomous agent that polls, analyzes and pushes insights on its own schedule

Bring any framework — LangChain, CrewAI, a cron script, a Home Assistant automation. If it can call HTTP, it can be part of the medical team.

---

## Architecture in 20 seconds

```
PWA (Next.js 16, React 19, Tailwind 4, shadcn/ui)
   │  TanStack Query + offline queue        Talk thread · live-voice session (orb, barge-in)
   ▼
Next.js API routes (zod-validated)  ──►  Event bus (persisted EventRecords)
   │                                        │
   │                                        ▼
   │                              AI Orchestrator ──► Rule engine (free, instant)
   │                                        │
   │                                        ▼
   │                    Provider chain (built-in GLM · 16 presets · CLI harness · local)
   │
   ├── socket.io (ambient insight push) ◄── realtime mini-service
   ├── web-push (VAPID) ──► every subscribed device (SOS · nudge · briefing)
   └── Edge TTS (server-side neural voices, disk-cached)
SQLite (Prisma) — 19 models, one file, easy backups
   └── memory tiers · companion tokens (hashed) · encrypted provider keys · push subs
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map and [docs/API.md](docs/API.md) for every endpoint.

---

## Documentation

| Doc | Contents |
|---|---|
| [Getting started](docs/GETTING_STARTED.md) | Clone → wizard → first reading → Talk → voice → pairing, step by step |
| [AI providers](docs/AI_PROVIDERS.md) | Built-in model deep dive, all presets, live catalog, CLI subscriptions, privacy |
| [Voice & Talk](docs/VOICE_AND_TALK.md) | Conversation thread, live voice, orb, barge-in, STT/TTS engines, troubleshooting |
| [Safety & companion](docs/SAFETY.md) | SOS engine, dispatcher card, contacts, GP, pairing, emergency numbers |
| [Memory & briefing](docs/MEMORY_AND_BRIEFING.md) | Three-tier memory, nightly reflection, Morning Briefing, web push |
| [Deployment](docs/DEPLOYMENT.md) | Docker, one-click platforms, HTTPS, VAPID, backups, updates |
| [API reference](docs/API.md) | Every endpoint, including the agent harness |
| [Architecture](docs/ARCHITECTURE.md) | System map, event catalog, data model, layer boundaries |
| [Security](docs/SECURITY.md) | Threat model & data handling |
| [FAQ](docs/FAQ.md) | Real troubleshooting: Talk, voice, providers, push, pairing |
| [Roadmap](docs/ROADMAP.md) | Shipped vs. planned |
| [Plugins](docs/PLUGINS.md) · [Device adapters](docs/DEVICE_ADAPTERS.md) · [Language packs](docs/LANGUAGE_PACKS.md) | Contribute |

## Privacy, in one breath

Your readings live in one SQLite file on your machine. There is no cloud, no account, no telemetry. The only data that can leave the box is the context text you explicitly allow an AI provider to process — with a local-first preference, a PII-strip mode, and an off switch. AI keys are encrypted at rest with an instance key stored beside the database. Companion and dispatcher tokens are hashed; pairing is consent-based and revocable; push subscriptions stay in your database.

## Health disclaimer

OpenEir is an information assistant for people who already manage their health with their doctors' knowledge. It is **not a medical device**, does not diagnose, and never replaces professional care. Crisis-level readings trigger a re-measure-and-contact-your-doctor message; the SOS system calls *humans* — that is the correct limit of its authority.

## Contributing

We want this to be the best open-source AI medical assistant, which means we need your brain. Read [CONTRIBUTING.md](CONTRIBUTING.md) — language packs, device adapters, new health-domain modules and docs are deliberately designed as low-barrier first contributions.

## Support OpenEir ☕

OpenEir is built by **one person** — a solo developer who is, themselves, both a patient and a carer. This software was born at a kitchen table between appointments and medication schedules, because the assistant our family needed didn't exist: something that talks kindly, remembers what matters, and calls the right person when it counts. If you are caring for yourself and for someone you love, you already know the weight a tool like this lifts — you are why it exists.

If OpenEir has made your days lighter, please consider buying the developer a coffee. It keeps the docs detailed, the roadmap honest, and the next features coming — offline voice, more device adapters, missed-check-in escalation, and the companion features still ahead. And if money is tight — carer budgets are real, we know — sharing OpenEir with a community, writing about your setup, or contributing a translation helps every bit as much.

<p align="center">
<a href="https://www.buymeacoffee.com/codedave"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200"></a>
</p>

The deploy buttons above also carry referral codes — using them costs you nothing and supports the project. Thank you for being here. ❤️

## License

Apache-2.0 — see [LICENSE](LICENSE).
