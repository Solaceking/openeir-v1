# Memory, reflection & the Morning Briefing

How Eir gets to know you — and how she starts your day.

---

## 1. Three-tier memory

Eir's memory is a `MemoryEntry` table with three tiers, each with a different contract:

| Tier | What lives there | Lifetime | Written by |
|---|---|---|---|
| **core** | Pinned facts — "User's daughter is called Aoife", "Allergic to penicillin" | **Forever** (unless unpinned) | You (pin anything), or extraction when importance is maximal |
| **semantic** | Durable knowledge — "User prefers morning walks", "Dr. Byrne is the cardiologist" | Until contradicted/superseded | Deterministic extractors, AI extraction, nightly reflection |
| **episodic** | Day-notes — "Felt dizzy after lunch on Tuesday" | **Decays** (30-day TTL) | Extraction of ordinary conversational facts |

### How memories are written

1. **Deterministic extractors** (run on every chat turn, zero cost, zero hallucination risk) catch eight families of facts: **name, allergies, diagnoses, doctors, preferences, family, plans, general facts** — each normalized into a self-contained third-person sentence ("User's daughter is called Aoife").
2. **AI extraction** (post-reply, async, only for turns ≥ 40 chars) catches what regex can't, under a strict JSON contract that can only *add* candidate memories — never modify clinical data.
3. **The nightly reflection** (§2) writes one durable sentence per day.

### Deduplication, promotion, decay

- **Dedupe**: a normalized `dedupeKey` suppresses duplicates — re-stating a fact **bumps** its importance instead of creating a twin.
- **Promotion**: repeated recall (`accessCount`) and high importance promote memories from episodic → semantic; **pinned** memories become core and never decay.
- **Decay**: episodic entries expire after ~30 days; access-bumped entries survive. Memory is honest about being memory: every entry keeps `sourceMsgId` provenance and an `importance` 0..1.

### How memories are used

Every chat reply's system prompt includes a **"Things you remember"** block: all pinned core memories + keyword-relevant hits + top-importance entries (access counted, so what you actually talk about stays warm). This is why *"what did I tell you about my daughter?"* works — and why telling Eir your name once is enough, forever.

The Settings → **Memory** tab shows every entry with tier, importance and pin controls; you can add, edit, pin and delete — the memory is yours.

Known limits (by design): dedupe is **lexical**, not semantic — "likes walking" and "enjoys strolls" are two entries today. Semantic dedupe is on the roadmap.

---

## 2. The nightly reflection

Each night (or on first activity after the configured hour), `runNightlyReflection()`:

1. Gathers the day's chat turns, BP/glucose readings, medication logs and journal entries.
2. Asks your provider for a **single narrated sentence** about the day — grounded in the real data.
3. Falls back to a deterministic template if no provider answers (the reflection never fails into silence).
4. Stores the sentence as a **semantic memory** keyed by date — so tomorrow's conversations know about yesterday.
5. Flags the hard signals — **missed doses, spiking BP** — into the ambient insight feed.

Triggering is handled by the **AmbientScheduler** (60s tick + `visibilitychange` listener) with an idempotent per-day marker in `AppSetting`; Settings → Alerts has an **auto-reflect** toggle, and `POST /api/memory/reflect?force=1` re-runs on demand (see [API.md](API.md)).

Delivery scheduling is a device-present system: the scheduler runs inside your OpenEir instance's browser sessions and server, so briefings/reflections land when *something* is open or the server tick runs — a fully serverless-cron design is documented in the deployment notes.

---

## 3. The Morning Briefing

Every morning, the dashboard leads with your briefing — **deterministically built from your real data** (`buildBriefing()` over the shared health context), so it cannot hallucinate a number:

- **Eir Score badge** with the one-line state of you
- **Blood pressure** — latest reading vs *your* target, with the 7-day trend direction
- **Glucose** — latest value, context-aware status, estimated HbA1c
- **Adherence** — streak + 7-day percentage
- **Today's doses** — minute-precise upcoming filter (HH:MM comparison), so "next dose 20:00" means it
- **One focus** — a single honest action for the day, chosen by rule first, AI-narrated when a provider is available

### Hearing it

The **Listen** button speaks the entire briefing through the same Edge-TTS stack as live voice — same validation, same cache. The spoken variant is a separate TTS-friendly text (no markdown, no symbols), built for the ear.

### Delivery

| Channel | How |
|---|---|
| **Dashboard card** | Always — first thing you see |
| **Spoken** | Listen button (or ask in live voice: "give me my briefing") |
| **Web push** | Configurable hour in Settings → Alerts → delivered to every subscribed device, idempotent per day |

---

## 4. Settings → Alerts — the control panel

- **Enable notifications** — subscribe this device (auto-labeled from your user agent; rename it)
- **Device list** — every subscription with label, created date, last success/error; remove stale ones
- **Send test** — verify the whole pipeline in one tap
- **Briefing schedule** — delivery hour
- **Auto-reflect** — nightly reflection on/off

---

## 5. Privacy of memory

Memories live in your SQLite file like everything else. Nothing about your daughter, your allergies or your bad night ever leaves the box except as prompt text to a provider **you** configured — and with per-provider **privacy mode**, PII is stripped first. Delete any memory, or clear the thread, and it is gone from the file too.

Related: [VOICE_AND_TALK.md](VOICE_AND_TALK.md) (the conversations memory is drawn from) · [SAFETY.md](SAFETY.md) (push delivery for SOS) · [API.md → Memory & briefing](API.md).
