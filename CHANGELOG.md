# Changelog

## v3.4 — 2026-09-09

### Worldclass shell — the application frame
- **True app frame**: the sidebar is now a full-height flush rail (hairline border, no floating card) and the content column opens with its own top bar — the disjointed "box in a box" layout is gone
- **Breadcrumbs live in the top bar** on every page, always consistent: `Home › Daily care › Talk`, and four levels deep inside Settings (`Home › System › Settings › Profile & accounts`) with clickable parents; the trail follows the settings drill-down live
- **⌘K quick navigation**: searchable palette (button or Ctrl/⌘K) to jump to any role-allowed page plus quick actions (new record, start conversation, toggle theme)
- **Refined sidebar**: strong flat teal active state, collapse-to-icon-rail with native tooltips, serif wordmark brand block, compact user/household footer with trust note (the in-app marketing footer is gone)
- Visual icon tiles replace bare glyphs in page headers; Talk now fits the viewport exactly (`100dvh` shell-chrome math, no page scroll around the thread)
- **New brand mark**: an apothecary vial in deep teal carrying the amber leaf cluster — uniform flat fills, no opacity tricks, reads from favicon to splash; applied across shell, splash, login and Talk
- Flat discipline sweep: removed the last drop shadows (suggestion chips, action cards)
- Fixed a production build blocker: the Next 16 proxy config no longer exports a disallowed `runtime` key

### Accounts, roles & login (RBAC)
- **Local accounts with three roles**: `admin` (everything — accounts, AI providers, data export, care), `caregiver` (daily care — log readings & doses, talk, safety), `viewer` (Family · view — read-only vitals + chat with Eir)
- **Zero-breakage upgrade path**: no accounts → open household mode (classic behavior, no sign-in). Creating the first account (Settings → Profile & accounts → Add account) instantly switches the instance to sign-in required; the first account is always an admin
- Node-runtime request proxy enforces the role matrix on every page and API route; explicitly public endpoints (token links for SOS card / companion pairing, LAN agent API, docker healthcheck) keep their own trust model
- Hardened account management: scrypt-salted password hashing, DB-side session tokens (cookie holds raw token, DB stores only its SHA-256), 30-day sessions, self-demotion/lock-out guards (cannot demote/disable/delete yourself, cannot remove the last active admin), role/password changes revoke live sessions
- Branded sign-in page; user card in the sidebar footer (avatar, display name, role badge, change password, sign out); navigation, quick actions and settings categories filter by role; viewer mutations blocked at API level (403 with a friendly message)

### Brand system — apothecary / heritage expedition
- New palette: cream paper `#FDFBF5` background, deep teal `#0F766E` primary lines & fills, warm amber `#F2A65A` **strictly reserved** for the leaf cluster and isolated key metrics (low Eir Score, urgent refills, review-needed states)
- Flat vector discipline: no gradients, no 3D, no drop shadows on brand surfaces — new flat logo (teal crossed pills + amber leaf cluster), flat chat bubbles, flat orb button, warm sand borders for separation
- Dark mode keeps the same bones (clinical-night teal ink)

### Voice + chat — one tab
- The standalone Voice view is gone; **logging by voice now lives inside Talk**: the composer's "+" opens the "Log by voice" sheet (mic stage → spoken readback → confirm card → typed fallback → examples), same deterministic parser, `source: voice` provenance
- Voice preferences (engine, neural voice catalog, rate, auto-speak, preview) moved to Settings → Voice & audio
- Persisted view migration: saved `voice` view silently maps to `talk`

### A more awesome chat
- Rich thread header: breadcrumbs (Home / Daily care / Talk), serif wordmark, Live-conversation button, conversation options menu
- Flat brand bubbles with teal spine on Eir's side, hover copy button on messages, icon-tiled empty-state suggestions, animated failure banner, "+" attach menu

### Shell, navigation & information architecture
- **New sidebar system**: grouped rail (Home / Daily care / Insight / Safety / System) with brand block, animated active pill, collapse-to-icon-rail (persisted), user card footer
- **Breadcrumbs everywhere**: every view opens with a PageHeader (Home / Group / Page) + serif title + subtitle + actions slot
- **Settings regrouped** from 8 busy tabs into a visual category grid → focused panels: Profile & accounts · AI & agents · Health (clinical targets + memory) · Alerts & briefing · Voice & audio · Appearance & language · Data & backup · Emergency & safety (deep-links to Safety)
- Dashboard feels less text-heavy: quick-action tiles (Record / Talk / Medications / Safety), compact greeting header, amber-disciplined score ring & refill warning
- **New splash screen**: cream paper, animated flat logo, serif wordmark, hairline progress — shown while profile & session hydrate

### AI settings — harness rescan
- **Rescan button** in Settings → AI → Agent harness: re-probes installed CLIs (`--version` + credential files) on demand, so installing a CLI or logging in mid-session shows up without a page reload — Buzz-style registry scan (explicit, timestamped, idempotent, never disrupts attached providers)
- Scans cached 60s server-side (`GET /api/ai/agents` serves fresh-or-cached with `scannedAt`/`cached`; `POST` forces a re-probe); panel shows "Last scanned … ago" and toasts the diff ("New harness detected: Claude Code", "Login detected: Codex CLI", "no changes")

### Documentation
- Complete documentation overhaul: new [GETTING_STARTED](docs/GETTING_STARTED.md), [AI_PROVIDERS](docs/AI_PROVIDERS.md), [VOICE_AND_TALK](docs/VOICE_AND_TALK.md), [SAFETY](docs/SAFETY.md), [MEMORY_AND_BRIEFING](docs/MEMORY_AND_BRIEFING.md) guides; full rewrite of README, API reference (all 45 endpoints), Architecture, Deployment (with one-click platform recipes), Roadmap, FAQ and Security

### Release hygiene
- Removed two SQLite backup files that were accidentally committed under `db/backups/` (they contained only test data — no readings, no keys) and extended `.gitignore` to cover `/db/backups/` so runtime database snapshots can never be tracked again
- Fixed a `react-hooks/set-state-in-effect` lint error in the Settings System Check card (mount effect now fetches first with a cancellation guard)
- Excluded the standalone `mini-services/realtime` service from root typechecking (it owns its dependencies, including socket.io)

## v1.1.0 — 2026-09-07

The release where OpenEir learns to talk — and to be there when you can't.

### Talk — conversational core
- Persistent WhatsApp-grade thread (day separators, ticks, typewriter reveal, suggestion chips, retry, clear-thread) stored in SQLite
- Fully grounded replies: profile, targets, readings, adherence, score, warnings + 16-turn window; answers cite *your* numbers
- **Action cards**: "BP 118 over 76, pulse 64" in chat → confirm card → saved with `source: chat` (duplicate-guarded like every capture path)
- Honest failures: unreachable provider renders an actionable banner (exact error + Settings deep-link), never a silent dead bubble

### Live voice
- One-tap full-duplex session: WebGL orb (domain-warped fBm plasma, 4-state palette, star field, grain) driven by mic RMS and real output amplitude
- Eir speaks replies **sentence-by-sentence** with warm prefetch, and shows the text simultaneously; **barge-in** interrupts her mid-sentence (mic-RMS gate + echo cooldown, or final transcript during playback)
- Spoken greeting on session open — audio proven before your first word
- Composer always available: mic loss, denial, Firefox or iframes degrade to typing inside the session, never kill it
- Voice-aware system prompt: Eir knows she can speak and hear; voice-channel replies follow speak-for-the-ear rules (≤90 words, no markdown, transcription-tolerant)

### Server-side neural TTS
- Edge neural voices (14 curated, US/UK/AU/IE/IN) synthesized by your own server via `msedge-tts` — zero API keys, disk-cached (`.tts-cache`, ETag/304), zod-validated
- Automatic fallback to browser `SpeechSynthesis` — readbacks never go silent
- Voice settings: engine picker, accent-grouped catalog, preview, prosody rate (0.6–1.6×) driving server synthesis

### Voice capture
- Push-to-talk dictation → deterministic on-device parser (number words, times, units, med fuzzy-match + schedule snapping) → spoken readback → confirm
- Confidence scoring with 0.75 gate; typed fallback always visible; medications always confirm (safety invariant)

### Safety layer
- **SOS engine**: hold-1s trigger → location capture → country-correct emergency number (~60-country table) → nearest emergency department (Google Places New + Nominatim fallback) → plus-code + maps URL → full dispatcher package → contact blast → web push → audit trail (`EmergencyEvent`)
- **Dispatcher card**: public, noindex, per-event tokenized `/sos/[token]` page — everything a human needs at 2 a.m.
- **Emergency contacts**: multi-channel (phone/WhatsApp/email/Signal), primary flag, soft deactivation
- **GP map search** in the onboarding wizard with geolocation biasing

### Companion loop
- Consent-based pairing: one-time sha256 invite (shown once) → token exchange → long-lived hashed viewer token; scopes (status/meds/vitals/location); revocable instantly
- Companion dashboard: check-in freshness, app heartbeat, today's meds, vitals, active-SOS banner, **nudge** (realtime toast + web push), 60s polling
- "I'm OK" check-in on the user side; companions auto-added to emergency contacts

### Ambient intelligence
- **Web push (VAPID auto-provisioned)**: zero-config self-hosting — keys generated into the DB on first use; endpoint pruning on 404/410, per-subscription error tracking; SW v2 with `notificationclick` (SOS = requireInteraction + vibrate); Settings → Alerts (device list, test, briefing schedule, auto-reflect)
- **Morning Briefing**: deterministic from real data — score badge, BP vs target + trend, glucose + eA1c, adherence + streak, minute-precise today's doses, one focus action; speakable via Edge TTS; push-delivered idempotently; AmbientScheduler (60s + visibilitychange)
- **Three-tier memory**: core (pinned) / semantic (durable) / episodic (30-day decay) with 8 deterministic extraction patterns, dedupeKey bumping, recall-count promotion, access-warm retrieval injected into chat prompts; Settings → Memory management
- **Nightly reflection**: the day (chat, readings, doses, journal) → AI-narrated sentence stored as semantic memory; missed doses + spiking BP surface as morning insights; deterministic fallback, idempotent per day

### AI platform
- **16 provider presets** with kind badges (OpenRouter, OpenAI, Anthropic, Gemini, Z.ai, Z.ai Coding Plan, xAI, DeepSeek, Moonshot, NVIDIA, Groq, Mistral, LM Studio, Ollama, custom, built-in)
- **Live model catalog** via models.dev: context, $/M pricing, release date, capability badges, newest-first; 12h SQLite cache with stale-on-error
- **CLI harness (subscription auth)**: detect `claude`/`codex`/`gemini`/`opencode`, login recipes, attach-as-provider; Z.ai Coding-Plan bridge recipe; text-only with fast-fail into the chain
- **Honest built-in AI**: `ensureBuiltinProvider()` auto-seeds on empty chains (30s TTL), gateway config detection across the 3 SDK paths, `ZAI_API_KEY`/`ZAI_BASE_URL` env bootstrap (writes config, mode 600), actionable guidance naming exact paths; Settings shows green (configured + source) or amber (setup guide) strip

### Design & platform
- Newsreader display-serif identity, instrument-grade tabular numerals, brand selection polish
- Dark clinical-night tokens, bubble/typing/orb/thread utilities, mobile 4-essential + More bottom sheet IA with spring pill

## v1.0.x

### Photo scan (OCR) — capture pipeline phase 1
- New **Scan** tab in Record: photograph (or paste / drop) a BP monitor, glucometer or report excerpt and OpenEir suggests structured values — you always confirm before saving (never auto-logs)
- Extraction ladder: vision model through the existing AI provider chain (excellent on 7-segment LCDs) → local tesseract.js in an isolated child process (works with no AI provider) → deterministic regex parser → manual entry
- Transcript cross-checking: the model's own digit transcript is re-parsed by the deterministic parser; agreement raises confidence, conflict caps it and flags "verify carefully"
- Confidence badges (agreement 97% / corroborated 80% / conflicting 70%) with per-scan notes showing which extractor answered and how long it took
- Unified input pipeline foundations: readings now carry `source` (`manual` / `bluetooth` / `import` / `voice` / `ocr`); machine captures are duplicate-guarded — an identical reading within ±3 minutes returns "already logged via X" with an explicit *Log anyway* action; manual and bluetooth entries are never blocked
- mg/dL → mmol/L conversion applied automatically for glucose scans
- Works on every platform the PWA supports — including iOS Safari, where Web Bluetooth is unavailable (camera capture is the universal ingestion path)

## v1.0.0 — 2026-09-06

Initial public release. OpenEir ships as a **self-hosted AI medical assistant with an open agent harness**: blood pressure, glucose, medications and lifestyle are the first health domains on a platform designed to grow across all of them (see docs/ROADMAP.md — heart rate & SpO₂, body composition, lab biomarkers, symptoms, nutrition detail are architecture-ready next).

### Core tracking
- Blood pressure readings with ACC/AHA 2017 auto-categorization, labels, tags, arm, pulse
- Glucose readings with context-aware targets, carbs, mmol/L ↔ mg/dL display, estimated HbA1c
- Lifestyle daily log: mood, energy, sleep quality, stress, weight, high-sodium flag
- Medications: schedules, adherence ledger, inventory with refill prediction, educational interaction checks, missed-dose recovery guidance

### Ambient intelligence
- Event-driven orchestrator with persisted event records (10+ event types)
- Rule engine: categorization warnings, streak celebrations, engagement nudges, early warnings (rising trend, variability spike, morning surge, adherence drop, glucose creep)
- Context builder: profile, targets, windows, correlations, sleep→BP pairing, score
- Provider-agnostic AI layer: built-in provider (GLM 5.3 Flash default, any model id selectable per provider), OpenAI-compatible, Anthropic, Ollama — editable fallback chain, latency/usage tracking, AES-256-GCM key storage, privacy mode, autonomy dial, quiet hours
- Realtime ambient push via socket.io mini-service

### Signature features
- **Blood Pressure Story** — weekly AI narrative, cached per ISO week
- **What-If Simulator** — deterministic projections from published effect sizes + AI interpretation
- **Eir Score** — explainable 0–100 composite with radar breakdown
- **Early Warning System** — predictive rule-based warnings before readings go red

### Platform
- PWA: manifest, service worker (shell + API cache), offline capture with automatic sync, installable
- Web Bluetooth: BP monitors (0x1810) & glucometers (0x1808) with SFLOAT parsing
- Doctor-ready print A4 report with AI narrative + suggested questions; CSV/JSON export of everything
- Agent harness: MCP-style manifest, event polling, insight push; example autonomous agent included
- Language packs: on-demand JSON module system shipping in English at release; German, Simplified Chinese and Arabic/RTL packs are in active translation and marked “coming soon” in Settings until coverage is complete; RTL support
- Accessibility: high contrast, large text, simple mode, WCAG 2.1 AA targets
- Docker Compose profiles: core / ai / bluetooth / agent
- Optimistic medication logging with status-aware toasts, offline queue and error rollback
