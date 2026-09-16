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

echo "▶ Restarting app..."
# Recreate app on its own. caddy and cron both depend_on app, and asking
# compose to bring all three up in one call had it recreate app twice in
# parallel whenever the image changed (three deploys in a row, 2026-09-16):
# the second attempt tripped over the first one's temporary
# "<id>_tarte-kitchen-app-1" rename with "Conflict. The container name ...
# is already in use", and the OLD image was left running. --no-deps keeps
# this call to app alone; the dependents come up in their own call below
# and see app already running.
docker compose up -d --no-deps app

echo "▶ Bringing up caddy and cron (cron's schedule lives in docker-compose.yml)..."
# The cron sidecar writes its crontab from the compose file at start-up, so a
# schedule change only takes effect when the container is recreated. Listing
# it here makes compose recreate it whenever its config changed, and leave it
# alone otherwise.
docker compose up -d caddy cron

echo "▶ Reloading Caddy config (bind-mounted Caddyfile, zero downtime)..."
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || echo "  (caddy reload failed; config unchanged or caddy not running)"

echo "▶ Checking the running app is the image just built..."
# "Deployed" has meant "old image still running" more than once. Compare the
# container's image to the freshly built one and refuse to call it done
# until they match; one retry covers a recreate that half-happened.
app_image="$(docker compose config --images | grep -- '-app$' | head -1)"
want="$(docker image inspect -f '{{.Id}}' "$app_image")"
# Right after a recreate, `compose ps -q app` can still list the old
# container while it is being removed, so only a RUNNING app container on
# the new image counts.
running_app_matches() {
  local id
  for id in $(docker compose ps -q --status running app); do
    [ "$(docker inspect -f '{{.Image}}' "$id")" = "$want" ] && return 0
  done
  return 1
}
if ! running_app_matches; then
  echo "  running app is not the new image, recreating once more..."
  docker compose up -d --no-deps --force-recreate app
fi
if ! running_app_matches; then
  echo "✗ No running app container is on the image just built. Not deployed." >&2
  echo "  built: $want" >&2
  docker ps -a --format '  {{.Names}} {{.Status}} {{.Image}}' | grep -- '-app' >&2 || true
  exit 1
fi

echo "▶ Waiting for the app to answer..."
# Port 3000 is published on the host; the staff login page needs no cookie.
if ! curl -fsS -o /dev/null --retry 20 --retry-delay 2 --retry-all-errors http://localhost:3000/staff-login; then
  echo "✗ App is not answering on :3000 after 40s. Check: docker compose logs app" >&2
  exit 1
fi
docker compose ps

echo "✓ Deployed $(git rev-parse --short HEAD), app on image ${want#sha256:}."
