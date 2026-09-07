#!/usr/bin/env bash
# Deploy the latest main to the production host.
#
# Usage (on the production droplet, from the repo directory):
#     ./scripts/deploy.sh
#
# This is intentionally boring: git pull, rebuild, migrate, restart. Run it
# whenever the main branch has new commits you want live.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DEPLOY_PULLED:-}" ]; then
  echo "▶ Pulling latest main..."
  git fetch origin main
  git reset --hard origin/main
  # The reset may have replaced this very file. Bash reads scripts as it
  # goes, so continuing here would run a mix of old and new lines. Hand
  # over to the freshly pulled copy instead, skipping the pull.
  DEPLOY_PULLED=1 exec "$0" "$@"
fi

echo "▶ Rebuilding app + migrate images..."
docker compose build app
docker compose --profile tools build migrate

echo "▶ Applying pending DB migrations..."
docker compose --profile tools run --rm migrate

echo "▶ Restarting app (and cron, whose schedule lives in docker-compose.yml)..."
# The cron sidecar writes its crontab from the compose file at start-up, so a
# schedule change only takes effect when the container is recreated. Listing
# it here makes compose recreate it whenever its config changed, and leave it
# alone otherwise.
docker compose up -d app caddy cron

echo "▶ Waiting for health..."
sleep 3
docker compose ps

echo "✓ Deployed."
