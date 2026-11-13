#!/usr/bin/env bash
# Nightly Tarte Kitchen database dump (added 13 Nov 2026 with the Council
# sign-ons, which must never be lost). Keeps 14 days here in
# /root/backups/kitchen. The Shifts droplet (170.64.133.74) pulls the newest
# dump each night from its own crontab, so a dead droplet never means lost data.
# Runs from root's crontab on this droplet:
#   30 17 * * * /root/tarte-kitchen/scripts/backup.sh >> /var/log/tarte-kitchen-backup.log 2>&1   (03:30 AEST)
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=/root/backups/kitchen
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%d-%H%M)
OUT="$DIR/tarte_kitchen-$STAMP.sql.gz"
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT
docker compose exec -T db pg_dump -U tarte -d tarte_kitchen --no-owner --no-privileges | gzip -9 > "$TMP"
gzip -t "$TMP"
[ "$(stat -c %s "$TMP")" -gt 1000000 ] || { echo "$(date -u) backup too small, kept the last good one" >&2; exit 1; }
zcat "$TMP" | tail -n 5 | grep -q "PostgreSQL database dump complete" || { echo "$(date -u) dump incomplete, kept the last good one" >&2; exit 1; }
mv "$TMP" "$OUT"
find "$DIR" -name 'tarte_kitchen-*.sql.gz' -mtime +14 -delete
echo "$(date -u) backup ok $(du -h "$OUT" | cut -f1) $OUT"
