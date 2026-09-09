# Plugin guide

OpenEir's extensibility is intentionally boring: HTTP APIs in, insight cards out. A plugin is anything that can speak that language. Two tiers:

## Tier 1 — external plugins (recommended)

Run anywhere, written in anything, zero in-process risk:

1. **Register** — Settings → Integrations → *Install from URL*. Paste a manifest URL.
2. **Think** — deterministic rules, a local model, a third-party API, a spreadsheet of your grandmother's folk wisdom.
3. **Contribute** — `POST /api/agent/insights` with `kind: "plugin"`, `agentName: "your-plugin"`. Cards appear in the ambient feed with an "agent" badge.

Ship it as a Docker sidecar (see `examples/agent-harness` and the `agent` compose profile). Suggested plugin ideas: weather-correlation analyzer, home-lab importer (CSV from your meter's proprietary app), caregiver digest to email, Ring doorbell → "measured BP while stressed" tagger (okay, maybe).

### Manifest format

A small JSON file, served anywhere the instance can reach:

```json
{
  "name": "Night Watch",
  "version": "1.2.0",
  "description": "Watches overnight readings and posts gentle summaries.",
  "baseUrl": "http://your-plugin-host:8080",
  "scopes": ["read:vitals", "post:insights"]
}
```

- `name` (required, 1–60 chars), `version`, `description`, `baseUrl` (optional, enables the health ping).
- `scopes` — the access you are asking for. Unknown scopes are dropped, not granted.

### Scopes and the scoped token

| Scope | Grants |
| --- | --- |
| `read:vitals` | `GET /api/readings/bp`, `GET /api/readings/glucose` |
| `read:meds` | `GET /api/medications` |
| `read:profile` | `GET /api/profile` |
| `read:export` | `GET /api/export` (full data export — grant deliberately) |
| `post:insights` | `POST /api/agent/insights` |

On install OpenEir mints a **scoped access token** (shown exactly once; only its
sha256 is stored). The plugin presents it as `Authorization: Bearer <token>`.
The access proxy admits plugin requests **only** for the route+method pairs
their scopes cover — a vitals plugin cannot read medications, and no scope
combination ever reaches the accounts, provider or plugin-management APIs.
Revocation (Settings → Integrations) is instant and total. Enabling/disabling
freezes access without forgetting the token.

A plugin gallery with one-click installs is on the roadmap (shown as
*Coming soon* in Settings → Integrations) — v1 is deliberately manifest-URL
only so every install is a conscious act.

## Tier 2 — in-process modules

For features that need UI surface area:

1. Put client components in `src/components/plugins/<name>.tsx` and render them via a view slot in `src/app/page.tsx`.
2. Register your API routes under `src/app/api/plugins/<name>/` with zod validation.

This stays a code-reviewed PR flow by design: no remote code loading in a medical app, ever.
