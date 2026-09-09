# Settings realignment v2 — shipped in v3.5

Status: IMPLEMENTED (owner answered the four open questions on 2026-09-09; built same day).
Author: release review session, 2026-09-09.

## Owner decisions that shaped the build

1. **"Thoughts"** — was the owner asking for design thoughts, not a feature. No
   reasoning panel was built; Chat knobs are Persona / Reply length / Temperature (+ Memory).
2. **Safety** = alerts + emergency merged — **yes**.
3. **MCP** — remote-only client accepted, PLUS the owner asked that OpenEir itself be
   *accessible via MCP* → the Expose direction (server mode at `/api/mcp`, token-gated,
   four read-only tools) shipped alongside the client registry. WebMCP = coming soon.
4. **Plugins** — manifest-URL installs in v1 confirmed; anything not shipped yet shows
   as an explicit "Coming soon" card (gallery, calendar, WhatsApp/SMS, Bluetooth hub).

Owner also supplied a speech-engine screenshot from a meeting-notes app as design
inspiration for the Audio page: global-model picker, model library with
size/speed/accuracy chips, language selector, device configuration with input meter
and test sound. Everything we do not actually have yet (local ONNX model downloads)
is rendered honestly as "Coming soon" — installed rows map to real engines only.

## What exists today (verified in code)

- Settings sections: `profile · providers (llm|audio|chat) · mcp · integrations ·
  health · safety · appearance · data` (`src/lib/nav.ts`, RBAC via `adminOnly`).
  Old keys `ai/voice/alerts/emergency` resolve through `SETTINGS_SECTION_ALIASES`.
- Providers → LLM: provider chain, preset connect flow, agent harness (unchanged).
- Providers → Audio: speech-engine card (ear picker w/ detected badges, language
  incl. auto, engine library, server routing editor), Eir's voice (TTS) card, and
  an audio-configuration card (input device + live level meter, output device via
  setSinkId, test sound). `sttLang` preference persisted in the UI store (v3).
- Providers → Chat: persona presets + custom instructions, reply length
  (short/balanced/detailed), temperature slider (default 0.6 = the previously
  hardcoded value; >0.9 warning), stored in `AppSetting` `chat.config`
  (`src/lib/ai/chat-config.ts`, `PUT /api/chat-config` admin-only), wired into
  `systemPrompt` + `completeChat` in the chat route. Memory moved here from Health.
- MCP: client registry (`McpServer` table, `/api/mcp/servers*`, probe via
  `src/lib/mcp-client.ts`) + server mode (`/api/mcp` JSON-RPC, token via
  `mcp.access` AppSetting, tools in `src/lib/mcp-tools.ts`, audit via
  `MCP_TOOL_CALL` EventRecords). Docs: `docs/MCP.md`.
- Plugins: `Plugin` table, manifest-URL install with scope validation
  (`/api/plugins*`), scoped-token enforcement in the access proxy
  (`src/lib/plugin-auth.ts`, `PLUGIN_ROUTE_SCOPES`), instant revocation.
  Docs: `docs/PLUGINS.md`.

## Target IA (what you asked for, merged with what must stay)

```
Settings
├── Profile & accounts        (unchanged; role-agnostic password card from 3795eea)
├── Providers                 ★ new top level (was: ai + voice, split)
│   ├── LLM                   = today's AI providers + agent-harness rescan (CLIs are LLMs too)
│   └── Audio                 = TTS prefs + STT routing, side by side
├── Chat                      ★ new top level (new capability, see below)
├── MCP                       ★ new top level (new capability, see below)
├── Integrations              ★ new top level (plugin management lives here)
│   └── Plugins
├── Health                    (unchanged — targets, units)
├── Safety                    = alerts + emergency merged (one topic: "when Eir speaks up & who gets called")
├── Appearance                (unchanged — theme, text size, high contrast, simple mode)
└── Data & backup             (unchanged — snapshots, export, system check)
```

Rationale: your three AI-stack top levels (Providers / MCP / Integrations) each get real
estate; the five non-AI sections keep their homes; `alerts` + `emergency` merge because
they answer one question and are gated to the same roles.

### Chat section (all of it is new — defaults = today's behavior)

| Knob | UI | Stored | Wired to |
| --- | --- | --- | --- |
| Persona | presets (Clinician / Friend / Coach) + custom system-prompt textarea with safe default | `AppSetting` JSON (`chat.persona`) | prepended to system messages in `providers.ts` |
| Verbosity | short / balanced / detailed + separate briefing verbosity | `chat.verbosity` | maps to system-prompt length guidance (model-agnostic, works with local models) |
| Temperature | slider 0–1, default 0.6 (= today's hardcoded), warning hint > 0.9 for medical answers | `chat.temperature` | replaces the hardcoded value |
| Thoughts | toggle "show model reasoning where available"; reasoning-effort (low/med/high) for providers that support it; collapsed `<details>` block in transcript | `chat.thoughts` | provider request flag + transcript render |
| Memory | moved here from old `ai` — it IS a chat-context knob | existing | existing |

Per-conversation overrides (e.g. temporary verbosity) are explicitly OUT of v1 — keep scope tight.

### Audio upgrade ("if possible")

- Unified provider-status row: which TTS/STT is live, last latency, fail count
- Fallback chain made visible & testable: `auto → webspeech → server` with a "test each ear" button
- Voice preview stays; add per-voice download/cache state for neural voices
- No new providers in v1 — Surface + polish first

### MCP (new capability — smallest safe core)

- v1 scope: **remote servers only** (streamable HTTP / SSE). No stdio spawning of local
  processes from a medical app's web UI in v1 — revisit later behind an explicit admin flag
- Flow: add server URL (+ optional header auth) → fetch tool list → inspect schemas →
  enable per tool → every tool call logged in an audit list (tool, args summary, timestamp)
- Roles: admin only. Quiet hours / autonomy settings from `src/lib/events.ts` apply to
  tool calls the same way they apply to agent insights
- Tag MCP servers as `kind: "mcp"` in the audit trail so Integrations→Plugins and MCP
  share one observability surface

### Plugins (evolution of docs/PLUGINS.md — not a rewrite)

- New `Plugin` registry table: `baseUrl, manifest, scopes[], enabled, lastSeen, health`
- Onboarding: paste a manifest URL → app shows permission card ("can read vitals,
  can post insights") → enable mints a **scoped token** the plugin must present
- Server-side scope enforcement on `/api/stats`, `/api/readings/*`, `/api/export` for
  plugin tokens (a plugin never sees more than its scopes)
- Management UI under Integrations → Plugins: enable/disable, health ping, revoke,
  see cards contributed per plugin ("agent" badge already exists)
- **Deliberate non-goal:** hot-loading in-process (Tier-2) plugins stays a code-reviewed
  PR flow. No remote code loading in a medical app, ever.

## Build order (phased, each phase ships green and standalone)

1. **Shell realignment** — nested section registry, move `voice`→Providers/Audio,
   split `ai`→Providers/LLM, add empty Chat/MCP/Integrations states, merge alerts+emergency
   → Safety. Old section keys aliased so nothing breaks.
2. **Chat knobs** — settings UI + storage + wire `providers.ts` (persona prefix, verbosity,
   temperature, thoughts flag). Defaults reproduce today exactly.
3. **Plugins** — registry + scoped tokens + Integrations UI (builds on existing insights API).
4. **Audio polish** — status rows, test-ears button, latency display.
5. **MCP client** — remote servers, allowlist, audit. Design doc reviewed separately before build.

Each phase: `tsc --noEmit` + eslint clean, production build boots, E2E click-through of the
changed flows, pushed only when green (same bar as the release checks).

## Open questions for the owner

1. **Thoughts** — interpreted as "show the model's reasoning + control reasoning effort".
   Correct, or did you mean something else (e.g. Eir's daily "thoughts" feed)?
2. Merge **alerts + emergency → Safety** — yes/no?
3. MCP v1 remote-only — acceptable, or is local stdio (desktop-class) a day-one must?
4. Plugin installs in v1 via **manifest URL only** (no one-click gallery yet) — fine?
