#!/bin/sh
# OpenEir entrypoint — push schema (idempotent), then start.
set -e

echo "[openeir] ensuring database schema…"
bunx prisma db push --skip-generate --accept-data-loss || echo "[openeir] warning: db push failed (continuing — schema may already exist)"

case "$1" in
  server)
    echo "[openeir] starting server on :${PORT:-3000}"
    exec bun server.js
    ;;
  realtime)
    echo "[openeir] starting realtime service on :3030"
    exec bun mini-services/realtime/index.ts
    ;;
  *)
    exec "$@"
    ;;
esac
