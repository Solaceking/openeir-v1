<div align="center">

<img src="public/logo.svg" alt="OpenEir logo" width="120" />

# OpenEir

**Your health, understood.**

A self-hosted AI health companion: log blood pressure, glucose and meds by typing or talking; get plain-language insights grounded in your actual numbers; share a read-only view with someone you trust. Runs entirely on your own hardware against one SQLite file — your data stays yours.

`Apache-2.0` · `Next.js 16` · `React 19` · `SQLite` · `Docker` · `PWA`

<a href="https://railway.com?referralCode=i3reF8"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="40"></a>&nbsp;&nbsp;<a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Solaceking/openeir&refcode=63b912d60f9a"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="40"></a>

</div>

---

## Why OpenEir

Most health tools are either dumb notebooks (they store numbers and draw lines) or black-box chatbots (they hallucinate advice and ship your data to a cloud). OpenEir is a third thing: a **conversational health assistant** that knows your numbers. Readings, doses and lifestyle entries flow through a deterministic rule engine (instant, free) with an AI layer on top for the conversations. You can type to Eir in a persistent thread or speak with her out loud; she replies grounded in your real data, never generic advice. There's an SOS flow, an optional companion view for someone you trust, a morning briefing, and a memory of what you tell her — all inspectable, all local.

It runs entirely on your own hardware, in your own home, on a single SQLite file you can back up like a photo album.

---

## What's inside

| Domain | What you get |
|---|---|
| 🩸 **Blood pressure** | ACC/AHA categorization, morning/evening context, pulse, trends, story narratives |
| 🍬 **Glucose** | Context-aware ranges (fasting / pre-meal / post-meal / bedtime), time-in-range, estimated HbA1c |
| 💊 **Medications** | Schedules, adherence streaks, inventory with refill prediction, missed-dose recovery, interaction education |
| 🥗 **Lifestyle** | Mood, energy, sleep, stress, weight, sodium — correlated against vitals |
| 🗣️ **Talk** | A persistent chat thread with your health context — log readings and meds from plain chat ("BP 118 over 76, pulse 64" → confirm card → saved) |
| 🎙️ **Live voice** | One tap → voice session: speak, get spoken replies sentence-by-sentence; barge-in works best with headphones |
| 🎛️ **Voice capture** | "Blood pressure one twenty over seventy-six" → parsed readback → confirm. Meds and notes too |
| 🚨 **SOS & safety** | Hold-to-trigger SOS → a shareable card with your conditions, meds, GP and location → contacts notified. Not a medical device — it calls *humans* |
| 👥 **Companion** | Pair a trusted person with a one-time invite. They get a scoped live dashboard (status, meds, vitals), can nudge you, and are auto-added to emergency contacts. Consent-based, revocable, audit-logged |
| 🌅 **Morning Briefing** | Daily summary from your real data — score, vitals vs target, meds due, one focus. Readable and speakable |
| 🧠 **Memory** | Eir remembers key facts you tell her (pinned), with older notes fading — visible and editable in Settings |
| 🌙 **Nightly reflection** | While you sleep, Eir reflects on the day — chat, readings, doses — and writes it into long-term memory; missed doses and spiking BP become morning insights |
| 🔔 **Web Push** | Outbound notifications to your subscribed devices (SOS alerts, nudges, briefing) — VAPID keys generated on first use |
| 📷 **Photo scan (OCR)** | Best-effort: works with clear photos and vision-capable providers; always confirm before saving |
| 🫁 **Bluetooth devices** | Early feature — Web Bluetooth pairing for some BP monitors; Chrome/Edge only, device support varies |
| 📖 **Blood Pressure Story** | Weekly AI narrative of your week in plain language |
| 🧪 **What-If Simulator** | Simple projections ("lose 5 kg, +2 exercise days") from published effect sizes, with AI interpretation |
| 📊 **Eir Score** | A 0–100 composite (BP control, glucose TIR, adherence, wellbeing, consistency) with a radar breakdown of the parts |
| 🩺 **Doctor reports** | Print-ready A4 clinical narrative, server-rendered PDF, suggested questions, CSV/JSON export of everything — and **email straight to your GP** through your own SMTP server |
| 🔐 **Accounts & 2FA** | Role-based accounts (admin/caregiver/viewer), auth on by default, TOTP two-factor with backup codes |
| 📱 **Android app** | Companion shell for your own instance: biometric app lock, background push via UnifiedPush (no Google dependency), share-to-OCR, print-to-PDF, home-screen shortcuts — [docs/MOBILE.md](docs/MOBILE.md) |
| 🤖 **Agent harness** | HTTP API for your own agents (manifest, polling, insight push) |
| 🌐 **PWA** | Installable, offline capture with automatic sync, background shell caching, push notifications |
| ♿ **Accessibility** | High-contrast, large-text and simple modes, 44px+ touch targets, screen-reader labels |

Community contributions decide what ships next — see [docs/ROADMAP.md](docs/ROADMAP.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Quick start (one-click deploy)

Let a platform do the work — deploy straight from this repository:

<p align="center">
<a href="https://railway.com?referralCode=i3reF8"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="44"></a>&nbsp;&nbsp;
<a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Solaceking/openeir&refcode=63b912d60f9a"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="44"></a>
</p>

Both buttons walk you through a guided setup. Two things to give the app and it's home for life: a **persistent volume at `/app/db`** (Railway: *Volume*; DigitalOcean App Platform: *mount path*) and HTTPS — which both platforms terminate for you by default. The referral codes in these buttons support OpenEir's development at no extra cost to you. Full platform recipes (Railway, Render, Fly.io, Coolify, Umbrel, Synology, the Vercel caveat and more): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Auth is on by default.** The first time anyone opens a fresh deployment they must create the first (admin) account before any data can be read or written — so a public one-click URL never starts passwordless. Running strictly on a trusted LAN and want the classic zero-friction, no-password household mode? Set `OPENEIR_HOUSEHOLD=1` and restart (documented in [.env.example](.env.example) and [docs/SECURITY.md](docs/SECURITY.md)).

## Quick start (local)

```bash
git clone https://github.com/Solaceking/openeir.git
cd openeir
cp .env.example .env
bun install
bun run db:push
bun run build
bash scripts/setup-local-services.sh        # systemd: app + backups (add --no-whisper to skip voice)
```

Open <http://localhost:3000>, take the 60-second setup wizard (with **map-searched GP** and **emergency contacts**), then connect one AI provider in **Settings → AI providers** — Settings → **Data & backup** shows a plain-language System Check so you always know exactly what works. Optional local voice: stand up a whisper server (any OpenAI-compatible one, or see [docs/VOICE_AND_TALK.md](docs/VOICE_AND_TALK.md)) and point the STT routing at it.

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

## OpenEir on Android

The companion app connects your phone to *your own* instance — your data never
touches anyone else's server. Free APK from
[Releases](https://github.com/Solaceking/openeir/releases) (`OpenEir.apk`), or
build it yourself.

- **Biometric app lock** — fingerprint/face gate when you return to the app
- **Background push** — briefings, med reminders and SOS alerts via UnifiedPush/ntfy, no Google services required
- **Share → OCR** — share a photo of a lab report or CGM screen from any app, logged in two taps
- **Share / print out** — the GP report as PDF to Gmail, WhatsApp or paper

Everything else (setup, 2FA, emailing reports to your GP) works inside the app
exactly like the web. Full story: [docs/MOBILE.md](docs/MOBILE.md).

## The AI: bring your own — every provider first-class

OpenEir ships **no hidden AI**. Everything is configured by you, in the open, in Settings → AI providers:

- **16 curated presets** — OpenRouter, OpenAI, Anthropic, Google Gemini, Z.ai (GLM), xAI, DeepSeek, Moonshot, NVIDIA NIM, Groq, Mistral, LM Studio, Ollama, custom/self-hosted. One key each, honestly labeled.
- **A live model catalog** powered by [models.dev](https://models.dev) — real models with context window and $/M pricing, cached 12h. Never hardcoded.
- **A fallback chain** — lowest priority number answers first; every call records latency and status.
- **Subscription auth via CLI harness** — ChatGPT Plus / Claude Pro / Google / OpenCode and 6 more: OpenEir detects installed CLIs on an expanded PATH, shows login recipes and copy-install buttons, and attaches them as providers.
- **Privacy mode** per provider strips PII before anything leaves the box. Keys are AES-256-GCM encrypted at rest.

If no provider is configured, Talk says so honestly and deep-links you to Settings — never a silent failure, never a hidden gateway.

### Talking to Eir out loud (Talk → live voice)

Voice input runs on whichever **speech recognition** you pick in Settings → Voice & audio: the browser's Web Speech API (Chrome/Edge/Safari) or **your own server** — any OpenAI-compatible transcription endpoint, e.g. a self-hosted [faster-whisper](https://github.com/SYSTRAN/faster-whisper) server (`large-v3` transcribes on a modest box). Replies use server-side **Edge neural voices**: no keys and no account are needed, but the *spoken text* is synthesized by Microsoft's public Edge Read-Aloud endpoint — prefer the on-device browser voices or a self-hosted ear/voice chain if you want zero third-party calls. Full data-flow details: [docs/VOICE_AND_TALK.md](docs/VOICE_AND_TALK.md).

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
   │                    Provider chain (16 presets · CLI harness · local whisper)
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
| [AI providers](docs/AI_PROVIDERS.md) | All presets, live catalog, CLI subscriptions, privacy |
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

OpenEir is built by **one person** — a solo developer who is both a patient and a carer. It exists because the assistant our family needed didn't exist. If it's useful to you, a coffee is appreciated — and sharing it or contributing a translation helps just as much.

<p align="center">
<a href="https://www.buymeacoffee.com/codedave"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200"></a>
</p>

The deploy buttons above also carry referral codes — using them costs you nothing and supports the project. Thank you for being here. ❤️

## License

Apache-2.0 — see [LICENSE](LICENSE).
