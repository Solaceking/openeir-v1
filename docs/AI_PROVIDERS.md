# AI providers — the complete guide

OpenEir's AI layer is provider-agnostic by architecture and *honest by default*: every failure names itself, every call is measured, and the built-in model either works or tells you exactly why it can't. This document explains every way an OpenEir instance can think.

---

## 1. The built-in model — how it works, honestly

### The short answer

The built-in provider talks to a **GLM model through the Z.ai gateway** using the server-side `z-ai-web-dev-sdk`. "Built-in" means *built into the app* — not a free anonymous cloud. It requires gateway credentials, and **where those credentials come from depends on where you run OpenEir**:

| Environment | What you get |
|---|---|
| **Managed / provisioned environments** (containers provisioned with `/etc/.z-ai-config`) | Works **truly out of the box**. Zero keys, zero clicks — first reply in ~1s. |
| **Your own server / laptop (fresh clone)** | The app **auto-seeds** the built-in provider row, detects no config, and shows an amber setup guide in Settings → AI. Add config (below) → works. Or connect any other provider. |
| **Docker** | Same as your own server — mount or env-in the credentials if you have them, or use any provider preset. |

### The credential scan (exact behavior)

The SDK looks for a `.z-ai-config` JSON file — `{"baseUrl": "…", "apiKey": "…"}` — in this order:

1. `./.z-ai-config` — the project root (where `package.json` lives)
2. `~/.z-ai-config` — the home directory of the user running the server
3. `/etc/.z-ai-config` — the system path used by managed provisioning

On top of that, OpenEir itself adds an **env bootstrap**: if `ZAI_API_KEY` and `ZAI_BASE_URL` are both set in the environment, OpenEir *writes* a `.z-ai-config` (mode `600`) from them on first use. So the full config precedence is:

```
ZAI_API_KEY + ZAI_BASE_URL env  →  bootstraps ./.z-ai-config
          ↓ (if no env)
existing .z-ai-config file      →  project root, then ~, then /etc
          ↓ (if no file)
built-in provider marked "not configured" — Settings shows the amber guide,
Talk replies with an honest banner instead of a silent failure
```

### The auto-seed (new behavior — this is the "out of the box" fix)

Older builds only created the built-in provider row via the seed script, so a fresh clone had *no provider at all* and Talk failed with an opaque 502. Current behavior:

- The first time any AI feature runs with an **empty provider chain**, OpenEir calls `ensureBuiltinProvider()` (30s TTL memo) which:
  1. Creates the `builtin` provider row (adapter `builtin_zai`, priority 1).
  2. Marks it **enabled** if gateway config was found, **disabled with guidance** if not.
- A gateway configuration error from the SDK is translated into a human sentence that names the exact paths checked (`./.z-ai-config`, `~/.z-ai-config`, `/etc/.z-ai-config`) and the Settings deep-link.
- Settings → **AI providers** shows a status strip: **green** with the config origin when configured, **amber** with a step-by-step guide when not, and the preset badge honestly reads *gateway key* rather than *no setup*.

### Changing the built-in model

The built-in provider is not locked to one model. Settings → AI → ✏️ edit → set *any* model id the gateway supports. The `Z.ai` preset gives you the same gateway with your own key if you prefer explicit ownership.

### Do users truly need to connect a provider to start?

**In managed/provisioned environments: no.** **On your own hardware: you need one of (a) gateway credentials for the built-in, or (b) any provider from §2 — one of which can be a fully local Ollama with no cloud at all.** What you never get is a silent failure: every path either works or tells you precisely what to do.

---

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
| Talk banner: "no AI provider configured" | Fresh clone without config → Settings → AI, follow the amber guide, or add any preset |
| Banner names `.z-ai-config` paths | Built-in selected but gateway config missing → create the file/env (§1) or switch provider |
| Vision (photo OCR) skips my provider | CLI adapters are text-only → put an API/local provider with vision above it in the chain |
| Model dropdown empty | models.dev fetch failed and no cache yet → check server egress; dropdown works again on next fetch |
| "Configuration file not found" in error detail | SDK ran without any of the three config paths → see §1 precedence |
| Provider test fails but chat works | Chain answered with a *different* (higher-priority) provider — the test result names it |

See also [FAQ.md](FAQ.md) and [API.md → Providers](API.md).
