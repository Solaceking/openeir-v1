#!/bin/bash
# OpenEir one-command local setup — the "everyone can set it up" script.
#
#   bash scripts/setup-local-services.sh
#
# Sets up (idempotent — safe to re-run):
#   1. openeir.service         the app itself (port 3000)
#   2. whisper-local.service   self-hosted Whisper large-v3 on :8630 (optional, skipped with --no-whisper)
#   3. openeir-backup.timer    automatic DB snapshots every 6h
#
# Requires: sudo (systemd units), bun, this repo cloned at ~/openeir.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKIP_WHISPER=0
[[ "${1:-}" == "--no-whisper" ]] && SKIP_WHISPER=1

echo "── OpenEir local setup ──────────────────────────────"

# 1) app service
sudo tee /etc/systemd/system/openeir.service > /dev/null <<EOF
[Unit]
Description=OpenEir - self-hosted AI medical assistant
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_DIR
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="DATABASE_URL=file:$REPO_DIR/db/custom.db"
ExecStart=$(which bun) .next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 2) local whisper (optional)
if [[ $SKIP_WHISPER -eq 0 ]] && [[ -d "$HOME/whisper-server" ]]; then
sudo tee /etc/systemd/system/whisper-local.service > /dev/null <<EOF
[Unit]
Description=OpenEir local Whisper (faster-whisper, OpenAI-compatible)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/whisper-server
Environment="WHISPER_MODEL=large-v3"
Environment="WHISPER_PORT=8630"
ExecStart=$HOME/whisper-env/bin/python server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
else
  echo "   (skipping whisper — no ~/whisper-server or --no-whisper)"
fi

# 3) backups
sudo cp "$REPO_DIR/scripts/openeir-backup.service" "$REPO_DIR/scripts/openeir-backup.timer" /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now openeir.service openeir-backup.timer
[[ $SKIP_WHISPER -eq 0 ]] && [[ -d "$HOME/whisper-server" ]] && sudo systemctl enable --now whisper-local.service || true

echo "── Done. Next steps ─────────────────────────────────"
echo "  1. Open http://localhost:3000 (or your tunnel URL)"
echo "  2. Settings → AI providers → connect one (e.g. OmniRoute/OpenRouter key)"
echo "  3. Settings → Voice & audio → pick your speech recognition"
echo "  4. Settings → Data & backup → System check should be all green"
