# Roadmap

OpenEir is a **full AI medical assistant** — blood pressure and glucose were the first two domains, not the boundary. Everything on this list rides the same pipeline that already exists (event bus → rule engine → AI orchestrator → Eir Score → agent harness), so new domains light up the whole intelligence stack from day one. Signals come from the community first, and everything stays compatible with the core promise: self-hosted, private, rules-first.

## Health-domain expansion (platform priority)

Each item below lands as a domain module: schema + API + views + event emitters + rule pack + score contribution. The agent harness picks them up automatically.

- [ ] **Heart rate & SpO₂** — resting-HR trend, oximetry context (pairs with the 0x1822 pulse-oximeter adapter below)
- [ ] **Weight & body composition** — trend-aware goals, Bluetooth scale adapter (0x181B), BMI/feeding into What-If
- [ ] **Lab biomarkers** — manual entry for HbA1c, lipids, eGFR, creatinine; reference ranges; lab-report date tracking
- [ ] **Symptoms & journaling** — free-text symptom diary with structured extraction into tags the rule engine can correlate
- [ ] **Nutrition detail** — beyond carbs: sodium-first (hypertension-relevant), meal timing context
- [ ] **Sleep staging** — deeper sleep import (duration → stages) as correlation input for morning BP
- [ ] **Activity & exercise sessions** — structured workouts as first-class correlation inputs

## Next (1.1)
- [x] Unified capture pipeline: `source` tagging (manual/bluetooth/import/voice/ocr) + duplicate guard for machine captures with force-after-confirm
- [x] Photo scan (OCR): vision model via provider chain → local tesseract fallback → manual entry; human confirmation always required
- [ ] Voice logging: push-to-talk STT (Web Speech API, in-browser; server ASR as upgrade) → intent parser → readback confirm; TTS confirmations via SpeechSynthesis / server TTS
- [ ] Nightscout import bridge (CGM data)
- [ ] Weekly story via scheduled agent (cron in-core, no external agent needed)
- [ ] PDF rendering server-side (optional headless-chromium sidecar)
- [ ] More device adapters: weighing scales (0x181B), pulse oximeters (0x1822)
- [ ] Domain-module contributor guide (add a health domain without forking the core)

## Later
- [ ] Multi-profile with per-profile encryption at rest
- [ ] Family/caregiver read-only mode with scoped, expiring share links
- [ ] Voice diary with structured extraction ("What if" inputs by voice)
- [ ] Photographic meal logging with portion tagging
- [ ] Native mobile shells (Capacitor) for iOS + background BLE sync
- [ ] Weather & circadian correlation modules (community plugin examples)
- [ ] FHIR export for clinical interop (alongside CSV/JSON)

## Under consideration
- [ ] Optional Postgres adapter for multi-user households
- [ ] Plugin marketplace directory (static JSON, community-hosted)
- [ ] Federated backup across your own devices (Syncthing-style)
- [ ] Wearable ingest bridges (Health Connect / HealthKit via companion app)
