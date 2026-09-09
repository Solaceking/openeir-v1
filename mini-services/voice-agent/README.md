# OpenEir — Realtime Voice Agent (Pipecat)

Opt-in, live, interruptible spoken conversation with Eir. This container is
**optional infrastructure**: a plain `docker compose up` does not build or run
it, and nothing about push-to-talk changes when it is absent.

    docker compose --profile voice up -d     # opt-in
    docker compose --profile voice down      # back to push-to-talk only

## The design rule that matters

**This container holds no business logic.** Every conversational turn goes out
over the internal RPC (`/api/agent/rpc`) into the OpenEir app, which runs the
exact same chat engine as text — tool calling, the confirm-before-write
pipeline, the audit trail. There is no second implementation of anything to
drift out of sync.

```
browser ──WebRTC──▶ voice-agent (Pipecat)      OpenEir app
                     VAD (barge-in)              │
                     STT (pluggable)             ▼
                     OpenEirTurnProcessor ──▶ /api/agent/rpc (chat.turn)
                     TTS (pluggable)             │ same engine as text chat:
                                                 │ LLM + tools + audit
                                                 ▼
                                     writes NEVER execute directly:
                                     PendingAction → spoken yes/no (or the
                                     visual card) → audited, idempotent
                                     execution
```

## Setup

1. Choose a shared internal secret and give it to BOTH services:

       # .env (next to docker-compose.yml)
       OPENEIR_SERVICE_TOKEN=<long random string>

   The app fail-closes the RPC when the token is unset; the container refuses
   to start without one (`:?` in compose).

2. Start the profile:

       docker compose --profile voice up -d

3. In OpenEir: **Settings → Providers → Audio → Live conversation** — enable
   it and pick your engines. The Talk orb now starts a live session instead
   of the in-browser voice mode. Turn the setting off at any time to revert.

## Pluggable engines

Engines are configured in the app (not in this container) and fetched at
session start, mirroring the SttRouting settings philosophy:

| | Engine | Notes |
|---|---|---|
| STT | **Local Whisper** (default) | Uses the whisper server already configured in Settings → Audio (`stt.routing.localUrl`); falls back to in-process faster-whisper when no URL is set |
| STT | **Deepgram self-hosted** | Set `DEEPGRAM_URL` + `DEEPGRAM_API_KEY` on the container |
| TTS | **Edge neural voice** (default) | Reuses the app's own cached `/api/voice/tts` — same voice as everywhere else, free |
| TTS | **Piper** | Fully offline voices in-container (`pipecat-ai[piper]`, `PIPER_VOICE_PATH`) |
| TTS | **OpenAI-compatible** | Any compatible speech server (`LOCAL_TTS_URL`) |
| TTS | **Deepgram Aura** | Self-hosted or cloud endpoint |

## Barge-in

Interruption is the entire point of this mode: `allow_interruptions` stays
enabled and Silero VAD runs server-side, so the user can just start talking
while Eir speaks — remaining speech cancels and the next utterance is
transcribed fresh. If that ever stops working, the mode has failed; it would
be no better than push-to-talk.

## Confirmations in live mode

Writes proposed by the model are never saved by voice alone:

1. Eir asks a clear yes/no question ("Ready to save: blood pressure 118/76.
   Shall I save it?").
2. A conservative grammar classifies the answer — anything ambiguous is
   re-asked once, then falls back to the visual card (`grammar.py`, tested).
3. A spoken "yes" hits `actions.confirm` on the RPC — the SAME audited,
   idempotent, permission-checked execution path as the chat card.
4. While the app is open, the pending card also appears (live poll in the
   session modal), so the visual path is always available.
5. High-risk actions (e.g. deleting a reading) keep their typed-CONFIRM
   friction — voice can propose, only the card can authorize.

## Tests

    python -m pytest mini-services/voice-agent/tests -q

Covers the confirmation grammar (clear yes/no, mixtures never authorize,
refusal openers, word-boundary cases) and the flow state machine
(re-ask once → card fallback → terminal).

## Version note

`requirements.txt` pins the Pipecat line (`pipecat-ai~=0.0.66`). The
Pipecat-specific imports are isolated to `bot.py` / `server.py` /
`engines.py`; the OpenEir logic (`openeir.py`, `grammar.py`) is
framework-free and unit-tested without Pipecat installed. If a future bump
changes the small-WebRTC transport API, adjust those three files only.
