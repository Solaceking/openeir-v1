# Roadmap

OpenEir is a **full AI medical assistant** — blood pressure and glucose were the first two domains, not the boundary. Everything on this list rides the same pipeline that already exists (event bus → rule engine → AI orchestrator → Eir Score → agent harness), so new domains light up the whole intelligence stack from day one. Signals come from the community first, and everything stays compatible with the core promise: self-hosted, private, rules-first.

## Shipped — the story so far

| Version | Delivered |
|---|---|
| v1.0 | BP/glucose/meds/lifestyle tracking, event bus → rule engine → AI orchestrator, Eir Score, BP Story, What-If, doctor reports, agent harness, PWA, photo OCR (unified capture), Bluetooth BP/glucose adapters |
| v1.1 | **Talk** (WhatsApp-grade grounded thread + action cards) · **live voice** (WebGL orb, neural TTS, barge-in) · server-side Edge TTS with disk cache · **safety layer** (SOS engine, dispatcher card, map-searched GP, multi-channel emergency contacts) · **companion loop** (pairing, scoped dashboard, check-in, nudge) · **web push** (VAPID auto-provisioned) · **Morning Briefing** (deterministic, speakable, push-delivered) · **three-tier memory + nightly reflection** · provider presets + live models.dev catalog + CLI subscription harness · honest built-in AI (auto-seed, config guidance, voice-aware prompts) |

## Health-domain expansion (platform priority)

Each item below lands as a domain module: schema + API + views + event emitters + rule pack + score contribution. The agent harness picks them up automatically.

- [ ] **Heart rate & SpO₂** — resting-HR trend, oximetry context (pairs with the 0x1822 pulse-oximeter adapter below)
- [ ] **Weight & body composition** — trend-aware goals, Bluetooth scale adapter (0x181B), BMI/feeding into What-If
- [ ] **Lab biomarkers** — manual entry for HbA1c, lipids, eGFR, creatinine; reference ranges; lab-report date tracking
- [ ] **Symptoms & journaling** — free-text symptom diary with structured extraction into tags the rule engine can correlate
- [ ] **Nutrition detail** — beyond carbs: sodium-first (hypertension-relevant), meal timing context
- [ ] **Sleep staging** — deeper sleep import (duration → stages) as correlation input for morning BP
- [ ] **Activity & exercise sessions** — structured workouts as first-class correlation inputs

## Next (1.2)

- [ ] Missed-check-in escalation: configurable silence window → companion alerted → optional auto-SOS
- [ ] Fully offline STT (transformers.js Whisper) — voice that never leaves the box
- [ ] Continuous conversation (realtime duplex mic session beyond turn-taking barge-in)
- [ ] Outbound telephony: BYO-Twilio SMS/voice channel for SOS + reminders
- [ ] In-app docs wiki (Fumadocs) at `/docs` — this documentation rendered inside OpenEir
- [ ] Nightscout import bridge (CGM data)
- [ ] PDF rendering server-side (optional headless-chromium sidecar)
- [ ] More device adapters: weighing scales (0x181B), pulse oximeters (0x1822)
- [ ] Domain-module contributor guide (add a health domain without forking the core)
- [ ] Semantic (embedding) memory dedupe alongside lexical dedupe

## Later

- [ ] Multi-profile with per-profile encryption at rest
- [ ] Companion live-audio scope (explicit two-sided consent at session time)
- [ ] Photographic meal logging with portion tagging
- [ ] Native mobile shells (Capacitor) for iOS + background BLE sync
- [ ] Weather & circadian correlation modules (community plugin examples)
- [ ] FHIR export for clinical interop (alongside CSV/JSON)

## Under consideration

- [ ] Optional Postgres adapter for multi-user households
- [ ] Plugin marketplace directory (static JSON, community-hosted)
- [ ] Federated backup across your own devices (Syncthing-style)
- [ ] Wearable ingest bridges (Health Connect / HealthKit via companion app)
- [ ] Official one-click deploy templates per platform (Vercel/Railway/Coolify/Umbrel buttons — docs table is ready, see DEPLOYMENT.md §3)
