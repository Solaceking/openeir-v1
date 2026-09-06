# FAQ

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

**What's actually novel here vs. other trackers?**
The event-driven orchestrator (rules-first AI that cites your numbers), the weekly BP Story, the What-If simulator with published effect sizes, the explainable Eir Score, the early-warning trend system, and a first-class agent harness. See the README table.

**I found a bug in the health logic.**
Please open an issue with the reading pattern that triggered it — correctness of the deterministic layer is treated as the highest-priority class of bug.
