# Deployment & operations

OpenEir is a stateful, self-hosted app: **one SQLite file is the entire health record.** Every deployment method below exists to protect that file, serve it over HTTPS (required for voice, push and service workers), and keep updates boring.

---

## 1. Requirements at a glance

| Requirement | Why |
|---|---|
| **Persistent volume for `/app/db`** (or `db/` on bare metal) | The database, the AES key file and VAPID keys live here. Lose it → lose the record. |
| **HTTPS or localhost** | Browsers gate **microphone** (live voice), **web push**, and **service workers** behind secure origins. |
| ~512 MB RAM, 1 vCPU | Ample for a household. The AI calls out; nothing heavy runs locally. |
| Outbound HTTPS | Only for the LLM endpoints you configure, Edge-TTS synthesis, and models.dev catalog refresh. |

---

## 2. Docker Compose (recommended)

```bash
# essential tracking only
docker compose --profile core up -d

# + AI (adds Ollama for fully-local models)
docker compose --profile core --profile ai up -d

# + agent harness sidecar
docker compose --profile core --profile ai --profile agent up -d
```

- `app` serves the PWA on `${OPENEIR_PORT:-3000}`; `realtime` serves socket.io on 3030.
- All state is in the `openeir-data` volume. **Back up that volume.**
- Image is built locally from the `Dockerfile` (multi-stage, standalone output, non-root-friendly).

<details>
<summary>Environment variables</summary>

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/app/db/custom.db` (image sets it) | SQLite path |
| `APP_KEY` | auto-generated into the volume | Master key for provider-key encryption. If you set one, back it up with the DB. |
| `OPENEIR_PORT` | `3000` | Host port |
| `ZAI_API_KEY` + `ZAI_BASE_URL` | — | Optional: bootstraps the built-in provider's gateway config |
| `REALTIME_URL` | `http://realtime:3031` | Internal control channel |
| `NEXT_TELEMETRY_DISABLED` | `1` | — |

</details>

---

## 3. One-click deploys (platform recipes)

OpenEir runs anywhere that gives a Node/Next.js container **plus a persistent disk**. The platform abstractions differ; the invariants do not:

> **The two invariants for every platform:**
> 1. Mount persistent storage at the database path (`/app/db` in the image, `db/` on bare metal).
> 2. Terminate HTTPS (platform edge or your proxy) — voice + push depend on it.

### Ready-to-use recipes

| Platform | Setup | Persistence |
|---|---|---|
| **Railway** | Deploy from GitHub → add a **volume** mounted at `/app/db` → start command `node .next/standalone/server.js` (build: `npm run build`) | Railway volume |
| **Render** | Web Service from repo → build `npm install && npm run db:push && npm run build` → start `npm run start` → add a **disk** at `/app/db` | Render disk |
| **Fly.io** | `fly launch` → `fly volumes create openeir_db --size 3` → mount at `/app/db` in `fly.toml` | Fly volume |
| **Coolify** | New resource from repo → attach persistent storage at `/app/db` → domain with HTTPS | Coolify volume |
| **Vercel** ⚠️ | Deploys fine, but the filesystem is **ephemeral** — SQLite resets per instance. Only sensible with a hosted Postgres (see below) or as a demo | ⚠️ none |
| **Umbrel / Runtipi / CasaOS** | Docker-compose app → map `db/` into the app-data dir — ships naturally as a one-click app | Host dir |
| **Synology / QNAP / TrueNAS** | Container Manager → import `docker-compose.yml` → map a shared folder to the db path | Host dir |
| **Portainer / any Docker host** | Stack → paste the compose file → volume → reverse proxy for HTTPS | Docker volume |

> 🚧 **This section is deploy-ready by design**: the upcoming official one-click templates (button-deploy manifests per platform) will slot in here — the app already satisfies both invariants. If you maintain a platform template, PR it into this table.

### Hosted database option

The Prisma layer makes a Postgres switch a one-line `provider` change in `prisma/schema.prisma` for platforms without persistent disks. SQLite remains the recommended default for privacy and simplicity — one file you can hold in your hand.

---

## 4. Reverse proxy & HTTPS

Minimum viable proxy (Caddy — automatic certificates):

```caddy
openeir.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx equivalent:

```nginx
server {
    listen 443 ssl;
    server_name openeir.example.com;
    ssl_certificate     /etc/letsencrypt/live/openeir/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openeir/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # websocket (socket.io)
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Why HTTPS is not optional: the **live-voice microphone**, **web push**, and the **PWA service worker** all require a secure context. On `http://192.168.x.x` they silently do not exist — this is the single most common self-host report ("talk live does nothing"). For LAN-only use, either use the host's HTTPS or accept text-mode Talk.

---

## 5. Web push on your domain

Nothing to configure: VAPID keys are **generated into your database** on first use of Settings → Alerts. The subscription endpoints, keys and error history all live in your SQLite file. Only requirements: HTTPS (above) and an allow-listed push service — browsers route through `fcm.googleapis.com` (Chrome/Edge), `push.apple.com` (Safari), `updates.push.services.mozilla.com` (Firefox). Corporate firewalls occasionally block these.

iOS/iPadOS Safari: the PWA must be **installed to the home screen** before iOS will grant notification permission. This is an Apple platform rule.

---

## 6. Backups

The whole state is:

```
db/custom.db      # the health record (SQLite, WAL mode)
db/.appkey        # instance AES key (if APP_KEY env not set)
.tts-cache/       # optional — disposable voice cache
```

Backup = copy `db/custom.db` (and `.appkey` if present). Hot-copy safely with SQLite's backup command:

```bash
sqlite3 db/custom.db ".backup '/backups/openeir-$(date +%F).db'"
```

Or stop the container and copy the volume. Restore = put the file back and start. `GET /api/export?format=json` is a portable second copy (readable anywhere, not encrypted).

---

## 7. Updates

```bash
git pull
bun install
bun run db:push      # applies schema changes, data-preserving
bun run build
```

Docker: `docker compose build && docker compose up -d` (rebuild replaces images; the volume persists). Updates are designed to be boring: `db push` adds columns/tables without destroying data; breaking changes are called out in the changelog. Snapshot the DB before major upgrades regardless — it's one file.

---

## 8. Monitoring

- `GET /api/health` — liveness for Docker healthchecks / uptime monitors.
- Settings → AI shows per-provider status, latency and usage; a failing chain member is visible before users feel it.
- The realtime mini-service logs to the container; the app writes `server.log` / `dev.log` in bare-metal mode.

---

## 9. Hardening checklist

- [ ] HTTPS via reverse proxy (also enables voice + push)
- [ ] `APP_KEY` set explicitly on multi-user hosts (and backed up)
- [ ] Agent endpoints (`/api/agent/*`) behind auth or kept network-local
- [ ] Automatic DB snapshots (cron the sqlite backup one-liner)
- [ ] Reverse proxy rate limits on `/api/*` if exposed beyond your LAN
- [ ] Companion invites sent only to people you trust — they carry live scope
