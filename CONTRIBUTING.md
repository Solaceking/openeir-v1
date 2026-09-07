# Contributing to OpenEir

First: thank you. Health tracking is intimate software — the bar for trust is high, and we can only clear it together.

## The golden rules

1. **People's health data flows through this code.** Privacy is not a feature; it is the floor. Never add telemetry, never add a "phone home", never log PII.
2. **Rules before AI.** If a behavior can be deterministic, cheap and explainable, build it that way first. AI enriches; it does not replace.
3. **Simple mode always works.** Every advanced feature must degrade gracefully — the app must remain lovable for a 70-year-old and a hacker at the same time.
4. **One SQLite file, zero cloud.** Any PR that adds an external dependency needs to justify itself in the PR description.

## Good first contributions

- 🗣️ **Language packs** — pure JSON, no code. See [docs/LANGUAGE_PACKS.md](docs/LANGUAGE_PACKS.md). Arabic-style RTL packs are especially welcome.
- 🔵 **Device adapters** — add tested device names to `src/lib/bluetooth.ts` or document BLE quirks in [docs/DEVICE_ADAPTERS.md](docs/DEVICE_ADAPTERS.md).
- 🧮 **Effect sizes** — improve the evidence citations in `src/lib/health/whatif.ts` (with references).
- 📊 **Insight rules** — new patterns in the orchestrator's rule engine. Deterministic, testable, cite your evidence.

## Development setup

```bash
bun install
bun run db:push && bun run scripts/seed.ts   # realistic demo data
bun run dev                                   # port 3000
bun run lint                                  # must pass
```

### Conventions

- TypeScript strict; no `any` unless annotated why.
- Components live in `src/components/views/*` (pages) and `src/components/*` (shared).
- All API input validated with zod at the boundary — no exceptions.
- Health logic lives in `src/lib/health/*` as pure functions; keep it unit-testable.
- UI: shadcn/ui primitives, Tailwind tokens only (no ad-hoc hex outside chart colors), 44px minimum touch targets.

### Testing your change like a person uses it

1. Record a BP reading that is out of range → an insight should appear.
2. Mark a dose missed → the recovery guidance should appear.
3. Toggle large-text + high-contrast → the dashboard must stay usable.
4. Go offline, record, come back → the reading should sync automatically.

## Pull request process

1. Fork, branch (`feat/…`, `fix/…`).
2. `bun run lint` must pass.
3. Describe **what a user experiences**, not just what changed.
4. One review approval required; two for anything touching `src/lib/crypto.ts`, auth surfaces, or data export.

## Issue triage

We label `good first issue` generously — if it looks intimidating, ask, and we will break it down together.

## Code of conduct

Be excellent to each other. Health topics can be personal and emotional — assume good faith, write kindly, remember many readers are patients first and developers second.

## Supporting the project (no code required)

OpenEir is a solo-developer project — built by someone who is both a patient and a carer. Code contributions are wonderful, but a **[coffee](https://www.buymeacoffee.com/codedave)**, a share, a translation, or deploying through the referral buttons in the README all fund and fuel the roadmap just as directly. If OpenEir lightened your caring journey, tell someone about it — that's how health software finds the people who need it.
