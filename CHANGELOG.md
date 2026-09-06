# Changelog

## v1.0.0 — 2026-09-06

Initial public release.

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
