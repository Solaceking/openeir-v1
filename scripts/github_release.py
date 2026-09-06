#!/usr/bin/env python3
"""One-shot: set OpenEir repo description/topics + create v1.0.0 release.
Token passed via GITHUB_TOKEN env var. Prints API results, never echoes the token."""
import json, os, sys, urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Solaceking/openeir"
HDR = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
}

def api(method, path, payload=None):
    req = urllib.request.Request(
        f"https://api.github.com/{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=HDR, method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]

# 1) Repo description
s, r = api("PATCH", f"repos/{REPO}", {
    "description": (
        "Self-hosted AI medical assistant with an open agent harness. "
        "Ambient health intelligence on your own hardware — your data, your models, your rules. "
        "Starts with blood pressure & glucose; built to grow across every health domain."
    ),
})
print(f"description: {s}")

# 2) Topics
topics = [
    "self-hosted", "ai-assistant", "medical-assistant", "health-tracking",
    "blood-pressure", "glucose-monitor", "agent-harness", "ambient-intelligence",
    "llm", "mcp", "nextjs", "pwa", "docker", "sqlite",
    "personal-health-record", "ollama", "open-source",
]
s, r = api("PUT", f"repos/{REPO}/topics", {"names": topics})
print(f"topics: {s} -> {','.join(topics[:6])}... ({len(topics)} total)")

# 3) Release v1.0.0
notes = """**OpenEir v1.0.0 — first public release**

Self-hosted AI medical assistant with an open agent harness. *Your health, understood* — on your own hardware.

## Highlights

**Ambient intelligence, not a dumb notebook**
- Every reading, dose and lifestyle entry emits events; a deterministic rule engine responds instantly (free), and **Eir** — the ambient AI layer — adds insight cards that cite *your actual numbers*, never generic advice
- **Early Warning System**: rising trend, variability spikes, morning surges, adherence drops, glucose creep — firing *before* readings turn red
- Realtime ambient push via socket.io, quiet hours, de-duplication, autonomy dial (off / gentle / proactive)

**Signature features**
- :book: **Blood Pressure Story** — a weekly AI narrative of your week in plain language: what drove highs, what to watch, what went well
- :test_tube: **What-If Simulator** — evidence-informed projections from published effect sizes ("DASH + lose 5 kg + 2 exercise days" -> projected systolic, TIR, glucose)
- :bar_chart: **Eir Score** — one honest, explainable 0-100 composite with a radar breakdown of every lever

**Bring any model (or use the built-in one)**
- Built-in provider: **GLM 5.3 Flash** by default — free and zero config; any model id selectable per provider
- Fallback chain: OpenAI-compatible, Anthropic, Ollama (local-first), LM Studio, vLLM, LiteLLM, OpenRouter...
- Keys AES-256-GCM encrypted at rest; privacy mode strips PII; per-call latency & usage tracking

**Your agents, on the medical team**
- MCP-style **agent harness**: capability manifest, structured health-context polling, insight push governed by the same autonomy/quiet-hours rules
- A working example autonomous agent included (`examples/agent-harness`)
- Bring any framework — LangChain, CrewAI, a cron script, Home Assistant: if it speaks HTTP, it joins the nervous system

**Health domains — a growing assistant, not a two-metric tracker**
- Shipped in v1.0: blood pressure (ACC/AHA), glucose (context-aware + HbA1c estimate), medications (adherence, inventory, refill prediction, interaction education), lifestyle (mood, energy, sleep, stress, weight, sodium)
- Architecture-ready next: heart rate & SpO2, body composition, lab biomarkers, symptoms & journaling, nutrition detail (see [ROADMAP](docs/ROADMAP.md)) — every new domain lights up the whole intelligence stack from day one

**Platform**
- PWA: installable, offline capture with automatic sync
- Web Bluetooth: BP monitors (0x1810) & glucometers (0x1808) with SFLOAT parsing
- Doctor-ready A4 print report with AI narrative + suggested questions; CSV/JSON export of everything
- Docker Compose profiles: `core` / `ai` / `bluetooth` / `agent`
- Accessibility: WCAG 2.1 AA targets, high-contrast, large-text and simple modes
- Language packs: English ships complete; German, Simplified Chinese and Arabic/RTL packs in progress ("coming soon" until coverage is complete)

## Quick start

```bash
git clone https://github.com/Solaceking/openeir.git
cd openeir && cp .env.example .env
bun install && bun run db:push && bun run dev
# or: docker compose --profile core --profile ai up -d
```

## Notes
- Apache-2.0. No cloud, no account, no telemetry — one SQLite file is your entire health record.
- Not a medical device; it never replaces professional care. Crisis-level readings trigger a re-measure-and-contact-your-doctor message.
- Full details in [CHANGELOG.md](CHANGELOG.md).
"""

s, r = api("POST", f"repos/{REPO}/releases", {
    "tag_name": "v1.0.0",
    "target_commitish": "main",
    "name": "OpenEir v1.0.0 — first public release",
    "body": notes,
    "draft": False,
    "prerelease": False,
    "make_latest": "true",
})
if s == 201:
    print(f"release: 201 -> {r.get('html_url')}")
else:
    print(f"release: {s} -> {r if isinstance(r, str) else json.dumps(r)[:300]}")

# 4) Verify
s, r = api("GET", f"repos/{REPO}")
if isinstance(r, dict):
    print(f"verify: desc={bool(r.get('description'))} topics={len(r.get('topics', []))}")
