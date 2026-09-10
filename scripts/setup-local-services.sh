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

# 4) realtime voice sidecar (optional) — live, interruptible spoken conversation.
# Uses Docker (skipped automatically when Docker is missing or --no-voice given).
if [[ "${1:-}" != "--no-voice" ]] && command -v docker >/dev/null 2>&1; then
  echo ""
  echo "── Realtime voice sidecar (optional) ────────────────"
  echo "  Live conversation mode: talk to Eir hands-free and interrupt her"
  echo "  mid-sentence, like a phone call — instead of tap-to-talk."
  echo "  Runs as an opt-in Docker container (Pipecat). Skipping changes"
  echo "  nothing: tap-to-talk keeps working exactly as before."
  read -r -p "Set up the realtime voice sidecar now? [y/N] " ANSWER
  if [[ "$ANSWER" =~ ^[Yy]$ ]]; then
    if [[ ! -f "$REPO_DIR/.env" ]] || ! grep -q '^OPENEIR_SERVICE_TOKEN=' "$REPO_DIR/.env"; then
      TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 40)
      umask 177
      grep -q '^OPENEIR_SERVICE_TOKEN=' "$REPO_DIR/.env" 2>/dev/null || \
        echo "OPENEIR_SERVICE_TOKEN=$TOKEN" >> "$REPO_DIR/.env"
      chmod 600 "$REPO_DIR/.env"
      # the app must receive the SAME token
      if sudo grep -q 'OPENEIR_SERVICE_TOKEN' /etc/systemd/system/openeir.service; then
        sudo sed -i "s|^Environment=\"OPENEIR_SERVICE_TOKEN=.*|Environment=\"OPENEIR_SERVICE_TOKEN=$TOKEN\"|" /etc/systemd/system/openeir.service
      else
        sudo sed -i "/^Environment=\"APP_KEY=/a Environment=\"OPENEIR_SERVICE_TOKEN=$TOKEN\"" /etc/systemd/system/openeir.service
      fi
      sudo systemctl daemon-reload
    fi
    echo "  (Optional) add DEEPGRAM_API_KEY=<your key> to $REPO_DIR/.env for cloud-speed live transcription"
    docker compose -f "$REPO_DIR/docker-compose.yml" -f "$REPO_DIR/docker-compose.voice-host.yml" \
      --profile voice up -d --build
    echo "  → Voice container starting on :8021. Enable 'Live conversation' in"
    echo "    Settings → Providers → Audio to switch the Talk orb to live mode."
  else
    echo "  (skipped — tap-to-talk only; re-run setup anytime to add it)"
  fi
fi

sudo systemctl daemon-reload
sudo systemctl enable --now openeir.service openeir-backup.timer
[[ $SKIP_WHISPER -eq 0 ]] && [[ -d "$HOME/whisper-server" ]] && sudo systemctl enable --now whisper-local.service || true

echo "── Done. Next steps ─────────────────────────────────"
echo "  1. Open http://localhost:3000 (or your tunnel URL)"
echo "  2. Settings → AI providers → connect one (e.g. OmniRoute/OpenRouter key)"
echo "  3. Settings → Voice & audio → pick your speech recognition"
echo "  4. Settings → Data & backup → System check should be all green"
