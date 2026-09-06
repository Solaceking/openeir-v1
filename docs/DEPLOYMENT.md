# Deployment guide

## Requirements

- Any machine with Docker (Debian homelab, Raspberry Pi 4+, NAS) — or Bun ≥ 1.2 for bare-metal
- ~300 MB RAM for core, +1–8 GB if you run local models via Ollama
- A browser for initial setup (the app itself is a PWA; install it to your home screen)

## Option A — Docker Compose (recommended)

```bash
git clone https://github.com/openeir/openeir.git
cd openeir

# essential only
docker compose --profile core up -d

# core + AI + agent sidecar
docker compose --profile core --profile ai --profile agent up -d
```

First boot: schema is pushed automatically, then the server starts on `:3000`. Open it and take the setup wizard.

### Profiles

| Profile | What you get |
|---|---|
| `core` | Web app + realtime service + persistent volume |
| `ai` | Ollama container pre-wired (`http://ollama:11434/v1` from Settings → AI providers) |
| `bluetooth` | BLE→MQTT bridge (host network, privileged — for headless device adapters) |
| `agent` | The example autonomous agent (`examples/agent-harness`) as a sidecar |

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `OPENEIR_PORT` | `3000` | Host port |
| `APP_KEY` | auto-generated | Encryption key for provider API keys (set it if you pre-provision `db/`) |
| `REALTIME_URL` | `http://127.0.0.1:3031` | Internal realtime control endpoint |
| `DATABASE_URL` | `file:/app/db/custom.db` | SQLite location (keep in the volume) |

## Option B — bare metal (bun)

```bash
bun install
bun run db:push
bun run scripts/seed.ts        # optional demo data
bun run dev                    # development
# production:
bun run build && bun run start
bun mini-services/realtime/index.ts   # in a second terminal/tmux
```

## HTTPS & remote access

OpenEir should be served behind your reverse proxy with TLS:

- **Caddy** (simplest):
  ```
  health.example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```
- **Traefik / Nginx**: standard proxy config, WebSocket upgrade support needed for socket.io (`/` path on port 3030 via the gateway, or expose the realtime service directly).

If you expose the **agent endpoints** outside your LAN, put auth in front of them (basic auth, mTLS, or SSO). They are designed as network-local surfaces.

## Backups

Everything that matters is one file:

```bash
docker exec openeir-app tar czf - -C /app db > openeir-backup-$(date +%F).tgz
```

Restore: stop the app, replace the volume contents, start. SQLite in WAL mode makes hot copies safe.

For provider keys to survive restore of a *different* database, set `APP_KEY` to a stable value instead of the auto-generated file.

## Updating

```bash
git pull
docker compose --profile core build
docker compose --profile core up -d
```

Schema changes are applied idempotently at boot (`prisma db push`). Releases follow semver; breaking changes to the export format are called out in `CHANGELOG.md`.

## Uninstall

Stop the containers, then delete the `openeir-data` volume. There is nothing else: no cloud account, no telemetry, no residue.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page after boot | Check `docker compose logs app`; ensure the db volume is writable |
| "Eir idle" badge | Realtime service unreachable — insights still work, they just arrive on refresh |
| AI answers fail | Settings → AI providers → Test. The error line shows which hop failed |
| Bluetooth button grey/absent | Web Bluetooth needs Chromium (Chrome/Edge) over HTTPS or on localhost |
| Time-of-day looks wrong | Set `TZ` for the container, e.g. `TZ=Europe/Vienna` |
