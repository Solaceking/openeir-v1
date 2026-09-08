#!/bin/bash
# OpenEir automatic database backup — health data is irreplaceable.
# Keeps the last 30 snapshots in db/backups/, updates backup.lastAt for
# the in-app System Check. Installed as a systemd timer (every 6 hours).

set -u
DB="/home/david/openeir/db/custom.db"
BACKUP_DIR="/home/david/openeir/db/backups"
KEEP=30
STAMP=$(date +%Y-%m-%dT%H-%M-%S)

[ -f "$DB" ] || { echo "db missing: $DB"; exit 1; }
mkdir -p "$BACKUP_DIR"

# Safe online copy (WAL-aware) via sqlite3, falls back to plain copy
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB" ".backup '$BACKUP_DIR/openeir-$STAMP.db'"
else
    cp "$DB" "$BACKUP_DIR/openeir-$STAMP.db"
fi

# Record freshness for the in-app System Check
sqlite3 "$DB" "INSERT INTO AppSetting (key, value, updatedAt) VALUES ('backup.lastAt', '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt;" 2>/dev/null

# Retention: keep newest $KEEP
ls -1t "$BACKUP_DIR"/openeir-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup complete: openeir-$STAMP.db"
