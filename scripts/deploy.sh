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

echo "▶ Pulling latest main..."
git fetch origin main
git reset --hard origin/main

echo "▶ Rebuilding app + migrate images..."
docker compose build app
docker compose --profile tools build migrate

echo "▶ Applying pending DB migrations..."
docker compose --profile tools run --rm migrate

echo "▶ Restarting app..."
docker compose up -d app caddy

echo "▶ Waiting for health..."
sleep 3
docker compose ps

echo "✓ Deployed."
