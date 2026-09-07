# Voice & Talk — the conversation stack

OpenEir's conversation layer has two surfaces: **Talk** (a persistent text thread that can log health data) and **live voice** (a full-duplex spoken session). This document is the complete map of how they work, what each browser can do, and every known failure mode.

---

## 1. Talk — the thread

### Design goals

A WhatsApp-grade conversation, not a chatbot widget: a single persistent thread stored in SQLite (`ChatMessage`), day separators, delivery ticks, spring-entrance bubbles, typewriter reveal, suggestion chips, retry, clear-thread with confirmation.

### Grounding — why Eir's answers aren't generic

Every reply is built from `contextForPrompt()`: profile + clinical targets, recent BP/glucose readings with categories, medication schedule and adherence, lifestyle logs, Eir Score components, active warnings and recent memories. A 16-turn conversation window keeps continuity. The system prompt states, in plain terms, that Eir **has a voice and ears** — so when you meet her in a live session she knows she can speak, and her replies are written to be spoken (short sentences, no markdown walls).

### Action cards — chat that *does* things

The reply pipeline runs `detectAction()` over every user message — the same deterministic parser the Voice view uses (number-words → digits, BP label detection, glucose context, medication fuzzy-match + schedule snapping). When a message contains a health intent, the reply carries a structured card:

- **Blood pressure** — systolic/diastolic/pulse fields, pre-filled, you tap **Save**
- **Glucose** — value + context, unit-aware (mmol/L ↔ mg/dL)
- **Medication** — matched medication (fuzzy), schedule slot (±90 min snap), taken/skipped

Nothing is ever saved without your confirmation. Saved entries carry `source: 'chat'` and pass through the same duplicate guard as every other capture path. On provider failure mid-turn, the orphan user-turn is cleaned up so the thread never shows a lie.

### Failure honesty

If the AI provider is unreachable, the failed send renders an **actionable banner** (exact error + a *Connect an AI provider* deep-link to Settings → AI) and a retry chip — never a silently dead bubble.

---

## 2. Live voice — the full-duplex session

### The loop

```
  open session ──► spoken greeting (proves audio instantly)
       │
       ▼
  LISTENING ◄──────────── you speak (Web Speech API)
       │ final transcript
       ▼
  THINKING  ──► provider chain (grounded, 16-turn window)
       │ reply
       ▼
  SPEAKING  ──► sentence-chunked Edge TTS, prefetched while speaking
       │        reply text shown on screen the whole time
       │  barge-in: sustained mic energy OR a new final transcript
       └────────► back to LISTENING
```

- **The orb** — a dependency-free WebGL engine: domain-warped fBm plasma with a 4-state palette (idle / listening / thinking / speaking), point-star field, film grain. Your microphone energy and Eir's actual audio amplitude drive the surface — it is a level meter, not a decoration.
- **Barge-in** — start talking while Eir is speaking and she stops *mid-sentence* and listens. Two triggers: a sustained mic-RMS gate (with echo cooldown so she doesn't interrupt herself) or a final speech-recognition result arriving during playback.
- **Sentence streaming** — replies are split into sentences; each is synthesized while the previous one plays (warm prefetch), so perceived latency is one sentence, not one paragraph.
- **The composer never dies** — mic loss, permission denial, unsupported browser or an embedded iframe without mic access degrade to the typed composer *inside the live session*. The session never kills itself.
- **Honest errors** — if synthesis or recognition fails structurally, Eir says so in text, and provider/setup errors get the Settings deep-link.

### Speech engines

| Direction | Engine | Where it runs | Keys needed |
|---|---|---|---|
| **Text → speech** | **Edge neural voices** (`msedge-tts`) — 14 curated voices across US/UK/AU/IE/IN accents, adjustable rate 0.6–1.6× | **Your server** (`POST /api/voice/tts`) → MP3 → cached on disk (`.tts-cache`, ETag/304, sha256 keys) | **None** |
| Text → speech (fallback) | Browser `SpeechSynthesis` | Device | None |
| **Speech → text** | Web Speech API (`SpeechRecognition`) | Browser (Chrome/Edge/Safari; Chrome needs network) | None |

TTS requests are zod-validated (`text ≤ 600 chars`, voice allow-list, rate clamp) and served as `audio/mpeg`. The client keeps an in-memory blob cache (~80 entries) and speaks via `Audio` elements; any failure falls back to device voices — **readbacks never go silent**.

### Browser support matrix

| Capability | Chrome | Edge | Safari | Firefox |
|---|---|---|---|---|
| Talk thread + action cards | ✅ | ✅ | ✅ | ✅ |
| Live voice: Eir speaks (Edge TTS) | ✅ | ✅ | ✅ | ✅ |
| Live voice: you speak (STT) | ✅¹ | ✅¹ | ✅ | ❌ → typed composer |
| Voice view dictation | ✅¹ | ✅¹ | ✅ | ❌ → typed form |
| Bluetooth devices | ✅ | ✅ | ❌ | ❌ |

¹ Chrome/Edge STT uses a network service; fully offline STT (transformers.js Whisper) is on the roadmap.

### Microphone permission & HTTPS — the #1 gotcha

Browsers only grant microphone access on **`https://`** or **`http://localhost`**. If you self-host on a LAN IP over plain HTTP and "talk live" does nothing, *that* is the reason — see [DEPLOYMENT.md → HTTPS](DEPLOYMENT.md) and [FAQ](FAQ.md). OpenEir detects denied/absent mic access and tells you in the UI instead of hanging.

---

## 3. The Voice view — structured capture

Separate from Talk, the **Voice** tab is a capture instrument: say a reading and get an **editable confirm card** (kind-aware: BP / glucose / med taken / med skipped / note), a confidence badge, spoken readback, and example chips. Confidence below the 0.75 threshold or unparseable input falls back to the typed form — always visible. Medication capture **always** requires confirmation (safety invariant), and unmatched medication names tell you *what* they matched, if anything.

The parser is **deterministic and on-device**: number words ("one twenty" → 120), times (at/colon/am-pm/named/relative), glucose unit heuristics (explicit words win; >40 → mg/dL), med name+dose extraction, filler stripping, confidence scoring. Pure TypeScript — identical behavior in every browser.

---

## 4. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| "Talk live" does nothing on self-host | Plain-HTTP LAN origin → serve HTTPS (see DEPLOYMENT.md) or use localhost |
| Greeting plays but Eir can't hear you | Mic permission denied → site settings; or Firefox → use the typed composer |
| Eir hears herself / interrupts herself | Rare without echo-cancelling hardware; the echo guard handles browser AEC — use headphones on speaker setups |
| Reply plays but is robotic | Fallback `SpeechSynthesis` engaged (server couldn't reach Microsoft's TTS) → check server egress; voices return automatically |
| First live reply slow | Provider cold start; subsequent sentences stream faster (warm prefetch) |
| "Connect an AI provider" banner | No reachable provider → [AI_PROVIDERS.md](AI_PROVIDERS.md) |
| STT dead but everything else fine | Chrome's speech service unreachable → Edge/Safari, or type |
| Action card didn't save | You didn't confirm — cards never auto-save; re-open the card and tap Save |
| Double reading logged | Duplicate guard covers minutes-apart captures from all sources; if you *want* both, space them or edit manually |

Related: [MEMORY_AND_BRIEFING.md](MEMORY_AND_BRIEFING.md) (how Eir remembers what you say), [AI_PROVIDERS.md](AI_PROVIDERS.md) (who answers).
