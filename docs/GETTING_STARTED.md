# Getting started

Everything between `git clone` and a fully-wired OpenEir — including the parts people actually get stuck on. Time budget: **5 minutes to first reading, 10 to a spoken conversation.**

---

## 0. What you need

- **Node 20+** and **Bun** (or npm/pnpm — Bun is what CI tests; any runtime that runs `next` works), or **Docker**
- A browser for the best experience: **Chrome, Edge or Safari** (these give OpenEir a microphone for live voice). Firefox works fully with the typed composer and still *hears* spoken replies.
- No API keys required to start. No accounts. No cloud.

---

## 1. Clone and run

```bash
git clone https://github.com/Solaceking/openeir.git
cd openeir
cp .env.example .env
bun install
bun run db:push
bun run dev
```

Open <http://localhost:3000>.

<details>
<summary>npm / pnpm instead of Bun</summary>

```bash
npm install && npm run db:push && npm run dev
```

The `db:push` script runs `prisma db push`, which creates `db/custom.db` — a single SQLite file that is your entire health record.

</details>

<details>
<summary>Docker</summary>

```bash
docker compose --profile core --profile ai up -d
```

State lives in the `openeir-data` volume. See [DEPLOYMENT.md](DEPLOYMENT.md) for reverse proxies, HTTPS and one-click platforms.

</details>

---

## 2. The 60-second wizard

The setup wizard collects what the whole system needs to be *yours*:

1. **You** — name, birth year, sex, height, conditions.
2. **Targets** — BP and glucose targets (defaults follow ACC/AHA and ADA guidance; your doctor's numbers win).
3. **Your GP** — type a practice name and pick from a **live map search** (Google Places, with an OpenStreetMap fallback). This is stored on your profile and reused in every doctor report and the SOS dispatcher package.
4. **Emergency contacts** — name + any mix of channels (phone, WhatsApp, email, Signal). The SOS engine blasts *all* channels you provide.
5. **Companion invite (optional)** — OpenEir shows you a one-time pairing link. Copy it and send it to your trusted person *now* — **it is shown exactly once**. You can regenerate later in the Safety tab.

Every step can be skipped and completed later — nothing is a dead end.

---

## 3. Record your first reading

Go to **Record** and enter a blood pressure reading, or just talk to the app:

- **Voice capture**: press the mic, say *"blood pressure 118 over 76, pulse 64"*. A deterministic on-device parser extracts the numbers, Eir reads it back to you aloud, you confirm — then it saves. Meds ("I took my metformin"), glucose and free notes work the same way.
- **Photo scan**: photograph your monitor. A vision model (or offline OCR fallback) proposes values; you confirm.
- **Bluetooth**: pair a supported BP monitor or glucometer (Web Bluetooth, Chromium browsers).

Readings logged by any source are **duplicate-guarded** against captures from minutes earlier — voice, photo, Bluetooth and manual all share one safety net.

---

## 4. Talk to Eir

Open **Talk**. This is a persistent, WhatsApp-grade thread — day separators, delivery ticks, suggestion chips.

- Ask *"how am I doing this week?"* — the answer is grounded in your actual stats (adherence %, latest BP, glucose trend), never generic.
- Say *"BP 118 over 76, pulse 64"* — an **action card** appears; tap Save and the reading is logged (source `chat`).
- Say *"remind me to walk after lunch"* — she remembers. Literally (see [memory](MEMORY_AND_BRIEFING.md)).

### What if the first reply fails?

OpenEir never fails silently. If no AI provider is reachable you get an honest banner that names the exact problem and a **Connect an AI provider** button that deep-links into Settings → AI. Two fixes, in order of effort:

1. **Connect any provider** (Settings → AI providers) — OpenRouter/OpenAI/Anthropic/Z.ai/Groq presets with one key, **Ollama** for fully-offline, or a CLI harness riding your existing subscription (Claude Pro, ChatGPT Plus, …). OpenEir ships no hidden AI, so this is the one required step. Details: [AI_PROVIDERS.md](AI_PROVIDERS.md).
2. **Verify in one glance** — Settings → Data & backup → **System check** gives a plain-language verdict (database / AI brain / voice input / backups). If voice needs a backend, Settings → Voice & audio → Transcription order points it at local Whisper or your gateway.

---

## 5. Go live: talk out loud

In Talk, tap the **voice-channel button** (the orb). What happens:

1. The WebGL orb comes alive and **Eir greets you out loud** — that greeting is your proof audio works before you say a word.
2. Speak naturally. She listens, thinks (orb goes into its thinking state), then **speaks her reply sentence-by-sentence** in a neural voice while typing it on screen.
3. **Interrupt her anytime** — just start talking; she stops mid-sentence and listens (barge-in).
4. Tap the orb again or press Esc to end the session.

Requirements: microphone permission, **localhost or HTTPS** (browser rule — this is the single most common "talk live doesn't work" cause on self-hosts; see [FAQ](FAQ.md)). Firefox: the orb and spoken replies work, dictation does not — the typed composer appears automatically.

---

## 6. Wire the ambient layer (5 minutes, one-time)

1. **Alerts** — Settings → Alerts → *Enable notifications* → allow. That device is now subscribed (name it, test it). VAPID keys were generated into your database automatically — there is nothing to configure.
2. **Briefing** — same tab: pick your briefing hour. Every morning the dashboard shows your briefing card; *Listen* speaks it; push can deliver it to all devices.
3. **Nightly reflection** — same tab: leave *auto-reflect* on. Each night Eir condenses the day into long-term memory.
4. **Companion** — Safety tab → *Invite companion* → send the one-time link. Your person accepts at `/companion/[token]`, gets a dashboard, and can nudge you. They're auto-added to your emergency contacts.
5. **SOS drill** — Safety tab: hold the SOS ring for 1 second (it's deliberately deliberate). Watch the dispatcher package assemble: location, nearest ED, country-correct number, plus-code, your clinical snapshot. Then **Cancel** — nothing was sent anywhere; there is no drill data left behind.

---

## 7. Verify your setup (60 seconds)

| Check | Where | Pass looks like |
|---|---|---|
| AI reply | Talk → "hello" | Grounded reply, provider footnote under the bubble |
| Voice out | Talk → orb → greeting | You hear Eir; orb in speaking state |
| Voice in | Say "my name is …" | Transcript appears; she uses your name from now on (memory) |
| Push | Settings → Alerts → *Send test* | Notification on the device |
| Briefing | Dashboard | Card with score badge, BP, glucose, next dose |
| Companion | Phone (not your PC) → open invite link | Dashboard renders with your live status |
| SOS | Safety → hold ring → cancel | Dispatcher package rendered, status `cancelled`, nothing sent |

---

## 8. Day two and beyond

- **Dashboard** is your morning stop: Eir Score, briefing, today's doses, latest insights.
- **Talk** remembers context across sessions — including what you told it days ago.
- **Trends** and **Story** give you the week's narrative; **What-If** shows where your levers lead; **Reports** prints the A4 sheet your GP actually wants.
- Back up: `cp db/custom.db wherever` — that file is everything.

## Where to go next

- [AI_PROVIDERS.md](AI_PROVIDERS.md) — every provider option, costs, subscriptions, privacy mode
- [VOICE_AND_TALK.md](VOICE_AND_TALK.md) — how the voice stack works, browser matrix, barge-in details
- [SAFETY.md](SAFETY.md) — SOS internals, dispatcher card, companion scopes
- [MEMORY_AND_BRIEFING.md](MEMORY_AND_BRIEFING.md) — the three memory tiers, reflection, briefing delivery
- [FAQ.md](FAQ.md) — when something above didn't work
