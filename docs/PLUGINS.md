# Plugin guide

OpenEir's extensibility is intentionally boring: HTTP APIs in, insight cards out. A plugin is anything that can speak that language. Two tiers:

## Tier 1 — external plugins (recommended)

Run anywhere, written in anything, zero in-process risk:

1. **Read data** — `GET /api/stats`, `/api/readings/*`, `/api/export`.
2. **Think** — deterministic rules, a local model, a third-party API, a spreadsheet of your grandmother's folk wisdom.
3. **Contribute** — `POST /api/agent/insights` with `kind: "plugin"`, `agentName: "your-plugin"`. Cards appear in the ambient feed with an "agent" badge.

Ship it as a Docker sidecar (see `examples/agent-harness` and the `agent` compose profile). Suggested plugin ideas: weather-correlation analyzer, home-lab importer (CSV from your meter's proprietary app), caregiver digest to email, Ring doorbell → "measured BP while stressed" tagger (okay, maybe).

## Tier 2 — in-process modules

For features that need UI surface area:

1. Put client components in `src/components/plugins/<name>.tsx` and render them via a view slot in `src/app/page.tsx`.
2. Register your API routes under `src/app/api/plugins/<name>/` with zod validation.
3. Health logic goes in `src/lib/health/` as pure functions if it belongs to the community commons.

Rules for in-process plugins: no telemetry, no remote code loading, no `eval`, respect quiet hours and autonomy settings via `src/lib/events.ts` instead of firing your own AI calls.

## Guidelines for both tiers

- Follow the ambient contract: **at most a few cards per day**, never a firehose. The orchestrator de-dupes by title within 6 hours — you should too.
- Cite real numbers or don't write the card.
- Severity is a responsibility: `high`/`critical` are for things that plausibly warrant medical attention.
