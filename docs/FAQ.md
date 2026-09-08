# FAQ

Real troubleshooting first, philosophy second.

---

## Talk & live voice

**Talk didn't work out of the box on my fresh clone — why?**
Because OpenEir ships **no hidden AI** — you connect a provider, and Talk is honest about it: an empty chain produces a banner with a Settings deep-link, never a silent failure. Open Settings → **AI providers** and connect any preset (Ollama = 100% local), or attach a CLI harness. **Settings → Data & backup → System check** tells you in plain language exactly what works and what doesn't. Full explanation: [AI_PROVIDERS.md](AI_PROVIDERS.md).

**The AI talks but doesn't seem to know it can talk / hear.**
Fixed in v1.1: the chat system prompt now states Eir's voice capabilities explicitly, and live-voice replies follow speak-for-the-ear rules (short sentences, no markdown). If you're on an old build, pull.

**"Talk live" button does nothing.**
Almost always one of:
1. **Plain HTTP on a LAN IP** — browsers only grant microphones on `https://` or `localhost`. Serve HTTPS (see [DEPLOYMENT.md](DEPLOYMENT.md)) or open `http://localhost:3000` on the host itself.
2. **Mic permission denied** — check the browser's site settings; OpenEir tells you in the UI when access was denied.
3. **Firefox** — dictation is unsupported by design; you get the typed composer inside the live session, and Eir still speaks to you.

**Eir speaks but I can't interrupt her / she talks over me.**
Barge-in needs your mic energy to reach her gate; on speaker+far-mic setups use headphones, or just tap the orb to stop and speak.

**Voice replies sound robotic.**
That's the browser `SpeechSynthesis` fallback — your server couldn't reach Microsoft's neural TTS endpoint. Check server egress; it recovers automatically.

## AI & providers

**Is there a built-in AI / hidden provider?**
No. There is no pre-seeded provider, no hidden gateway config, no env-var backdoor. Every AI call goes through providers **you** configured — API presets, local Ollama, or CLI harnesses riding your existing subscriptions. Keys are AES-256-GCM encrypted at rest.

**Do I need to connect a provider to start?**
Yes — exactly one. OpenEir never ships credentials, so a fresh instance starts with an empty chain and tells you so honestly. Ollama gives you a fully-offline brain in two minutes.

**Voice input doesn't work in my browser but works elsewhere.**
Voice has two paths: the **browser ear** (Web Speech — Chrome/Edge/Safari only, transcription in the browser) and the **server ear** (mic audio → your transcription backend). A failure that never appears in the server logs is the browser ear dying (mic permission, no Web Speech) — check Settings → Voice & audio and pick "My server" to force the server path. Server-ear problems DO appear in the server log as `[voice/stt]` lines.

**Voice is very slow.**
If your transcription order puts a local CPU-only Whisper first, expect minutes per utterance — that's physics, not a bug. Put the fast backend first (Settings → Voice & audio → Transcription order); keep the slow local one as fallback.

**Can I use my ChatGPT Plus / Claude Pro subscription?**
Yes — the CLI harness detects installed CLIs (claude, codex, gemini, opencode, hermes, openclaw, dsh, cline, cursor, grok) on an expanded PATH and attaches them as providers (text-only). Just-installed CLIs show copy-install commands; hit Rescan after logging in. See [AI_PROVIDERS.md §4](AI_PROVIDERS.md).

**Model list feels stale?**
It's fetched live from models.dev, cached 12h in your DB, served stale-on-error. Restarting the server triggers a refresh.

## Safety & companion

**Does SOS actually call 999/112?**
No — and that's deliberate. OpenEir prepares everything (location, plus-code, nearest ED, country-correct number, full clinical snapshot), notifies *your* contacts on every channel, and shows a dispatcher-ready card. Dialing remains a human act.

**My companion's dashboard says "unpaired".**
The link was revoked, or the invite expired. Generate a fresh invite in Safety → Companion.

**I lost the companion invite before sending it.**
Regenerate — invites are single-use and the token is shown exactly once by design.

**Push notifications never arrive on iOS.**
Install the PWA to the home screen first — iOS requires it before granting notification permission. Then Settings → Alerts → Enable.

## Data & platform

**Is my data really staying home?**
Yes. It lives in one SQLite file in a volume you own. The only optional egress is AI context text to providers *you* configure — with a PII-strip mode, a local-first preference, and an off switch. There is no telemetry anywhere in the codebase (check for yourself; that's the point).

**Is this a medical device?**
No. It is an organized notebook that thinks. It never diagnoses, and for crisis-range readings it says exactly one correct thing: re-measure, then contact your doctor or emergency number.

**Why is the AI sometimes "idle"?**
The realtime badge shows the ambient push channel. Rules keep running regardless; AI enrichment respects quiet hours and your autonomy setting. Idle ≠ off.

**Blood pressure monitor isn't found?**
Web Bluetooth needs Chromium and HTTPS (or localhost). Use the desktop/Android Chrome pairing path, or the BLE→MQTT bridge for headless setups.

**Can I track two people?**
One profile per instance is the current design — privacy by isolation. Run a second container for a second person; it is cheap.

**Where are the Postgres/Redis?**
Deliberately absent: SQLite in WAL mode and in-memory rate limiting cover a single household amply, and every daemon you don't run is a vulnerability you don't patch. The Prisma layer keeps the Postgres door open.

**How do I change units?**
Settings → Profile & targets → Unit (mmol/L or mg/dL). Internally everything is mmol/L canonical; conversion happens at the edges.

**Do briefings/reflections need an open browser?**
The ambient scheduler rides your instance's sessions (60s tick + visibilitychange) and the server tick — briefing delivery and reflection run when the app or server is alive. A dedicated server-cron design is documented in [DEPLOYMENT.md](DEPLOYMENT.md).

**What's actually novel here vs. other trackers?**
The event-driven orchestrator (rules-first AI that cites your numbers), a *talking* assistant that knows it can talk, the three-tier memory, the dispatcher-grade SOS engine, the weekly BP Story, the What-If simulator with published effect sizes, the explainable Eir Score, and a first-class agent harness. See the README table.

**I found a bug in the health logic.**
Please open an issue with the reading pattern that triggered it — correctness of the deterministic layer is treated as the highest-priority class of bug.
