# AI providers — the complete guide

OpenEir's AI layer is provider-agnostic by architecture and *honest by default*: every failure names itself, every call is measured, and there is no hidden credential anywhere. This document explains every way an OpenEir instance can think.

---

## 1. No hidden AI — bring your own, honestly

OpenEir ships **no built-in AI provider and no hidden gateway credentials**. Nothing pre-seeds itself, nothing phones home, and no key exists that you didn't set. A fresh instance starts with an *empty provider chain*, and Talk says so honestly with a deep-link to Settings → **AI providers**.

**To make Eir think, connect exactly one provider** (you can add more later — the chain answers by priority):

1. Open Settings → **AI providers** → *Connect a provider*
2. Pick a preset (OpenRouter, OpenAI, Anthropic, Google Gemini, Z.ai, xAI, DeepSeek, Groq, Mistral, LM Studio, **Ollama** for fully-offline, custom/self-hosted…)
3. Paste the API key — it is encrypted (AES-256-GCM) before it touches the database
4. Pick a model from the live catalog and hit **Test**

Prefer your subscription over API keys? Use the **Agent harness** panel on the same page: OpenEir detects installed CLIs (Claude Code, Codex, Gemini CLI, OpenCode, Hermes Agent, OpenClaw, DeepSeek Harness, CLine, Cursor, Grok) on an expanded PATH, shows login recipes with copy-install buttons, and attaches them as providers — the subscription is used exactly as the vendor intended.

If every provider in the chain fails, Talk tells you which ones were attempted and why — never a silent failure.

## 2. The 16 provider presets

Settings → AI → **Add provider** opens the preset grid. Each preset knows its adapter, base URL, and where to get a key:

| Preset | Kind | Notes |
|---|---|---|
| **OpenEir Built-in** | gateway key | GLM via Z.ai gateway (see §1) |
| **OpenRouter** | API key | One key, hundreds of models — most flexible single choice |
| **OpenAI** | API key | GPT family |
| **Anthropic** | API key | Claude family (native adapter, not OpenAI-compatible shim) |
| **Google Gemini** | API key | Gemini family (OpenAI-compatible endpoint) |
| **Z.ai (GLM)** | API key | Direct GLM open-platform access |
| **Z.ai Coding Plan** | subscription | Coding-plan key; bridges via the CLI recipe (§4) |
| **xAI (Grok)** | API key | Grok family |
| **DeepSeek** | API key | DeepSeek V3/R1 family |
| **Moonshot (Kimi)** | API key | Kimi family |
| **NVIDIA NIM** | API key | Hosted NIM microservices |
| **Groq** | API key | Fastest inference tier |
| **Mistral** | API key | Mistral family |
| **LM Studio** | local | `http://localhost:1234/v1` — your downloaded models |
| **Ollama** | local | `http://localhost:11434/v1` (or `http://ollama:11434/v1` in the compose `ai` profile) |
| **Custom / self-hosted** | API key | Any OpenAI-compatible endpoint: vLLM, LocalAI, LiteLLM, llama.cpp server, your own gateway |

Every preset row gets a **live model dropdown** (next section), a kind badge (no-setup / gateway key / API key / local / subscription), and the provider's key URL when relevant.

## 3. The live model catalog (models.dev)

Hardcoded model lists age badly. OpenEir fetches [models.dev](https://models.dev)'s `api.json` (213 providers at time of writing) and serves, per preset:

- every model with **context window**, **$/M input/output pricing**, **release date**, and capability badges (**new**, **reasoning**, **vision**)
- **newest first** — a model released yesterday appears at the top today
- searchable (cmdk combobox with fuzzy search over name *and* id)

Caching: fetched responses are cached **12 hours** in the SQLite `AppSetting` table; on network failure the stale cache is served (`stale-on-error`). The catalog is also how custom model ids stay honest — type any id you like, but the dropdown shows you what's real.

## 4. Subscription auth — the CLI harness

Already paying for ChatGPT Plus, Claude Pro, Google AI or OpenCode? Their subscription tiers can't legally be used as raw APIs — but their CLIs can. OpenEir detects installed CLIs and attaches them as providers:

| CLI | Invocation used |
|---|---|
| Claude Code | `claude -p "<prompt>"` |
| OpenAI Codex | `codex exec "<prompt>"` |
| Gemini CLI | `gemini -p "<prompt>"` |
| OpenCode | `opencode run "<prompt>"` |

- **Discovery**: Settings → AI → *Agent harness* panel. OpenEir probes each CLI (`--version`, plus a best-effort credential-file check) and shows what's installed, logged-in, and attachable. Scans are **cached for 60s** and timestamped; press **Rescan** after installing a CLI or logging in — it re-probes immediately (Buzz-style: explicit, cheap, timestamped, never disruptive to attached providers) and toasts what changed ("New harness detected: Claude Code", "Login detected: Codex CLI", or "no changes").
- **Attach**: one click turns a detected CLI into a chain provider (adapter `cli`).
- **Limits**: CLI providers are text-only — vision requests (photo OCR) fail fast and the chain falls through to the next provider.
- **Z.ai bridge recipe**: a copy-paste env block (`ANTHROPIC_BASE_URL=api.z.ai/api/anthropic` + coding-plan key) lets Claude Code authenticate with a Z.ai Coding Plan — the recipe is shown in-app with a copy button.

## 5. The fallback chain, priority and cost

- Providers are tried in **ascending `priority`** (lower wins). The chain continues on any failure.
- Every attempt records **tokens in/out, latency, success, estimated cost** (per-model pricing you can set on the provider row) into `AiUsage`; Settings shows the usage panel.
- `POST /api/ai/providers/:id/test` sends a real ping and reports which chain member actually answered.
- The built-in provider is only *auto*-ensured when the chain is **empty** — if you deliberately removed it, OpenEir respects that.

## 6. Privacy controls

| Control | Effect |
|---|---|
| **Privacy mode** (per provider) | PII (names, exact dates, contact details) stripped from context before the request leaves the box |
| **Autonomy dial** | `off` — rules only; `gentle` — AI enrichment on your actions; `proactive` — Eir may initiate |
| **Local-only stack** | Ollama/LM Studio presets keep every token on your hardware; the orchestrator works fully offline |
| **Keys at rest** | AES-256-GCM (`db/.appkey` instance key or `APP_KEY` env); keys are write-only through the API |
| **No telemetry** | The app never phones home; the only outbound calls are the LLM endpoints *you* configure |

## 7. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Talk banner: "no AI provider configured" | Fresh clone → Settings → AI, connect any preset (Ollama = fully offline) or attach a CLI harness |
| Vision (photo OCR) skips my provider | CLI adapters are text-only → put an API/local provider with vision above it in the chain |
| Model dropdown empty | models.dev fetch failed and no cache yet → check server egress; dropdown works again on next fetch |
| Provider test fails but chat works | Chain answered with a *different* (higher-priority) provider — the test result names it |

See also [FAQ.md](FAQ.md) and [API.md → Providers](API.md).
