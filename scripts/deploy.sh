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

# One deploy at a time. Every push to main makes GitHub Actions run this
# script, and the same push is often deployed by hand as well; on 2026-09-20
# the two runs overlapped twice, both recreated app at once, and the loser
# died on "Conflict. The container name ... is already in use" with the site
# on 502. The second run now waits here for the first to finish, then finds
# nothing left to do. The lock rides on fd 9 across the exec below, so it is
# only taken once.
if [ -z "${DEPLOY_LOCKED:-}" ] && command -v flock >/dev/null; then
  exec 9>/var/lock/tarte-kitchen-deploy.lock
  if ! flock -n 9; then
    echo "▶ Another deploy is running, waiting for it to finish..."
    if ! flock -w 1800 9; then
      echo "✗ The other deploy is still running after 30 min. Not deployed." >&2
      exit 1
    fi
  fi
  export DEPLOY_LOCKED=1
fi

if [ -z "${DEPLOY_PULLED:-}" ]; then
  echo "▶ Pulling latest main..."
  git fetch origin main
  git reset --hard origin/main
  # The reset may have replaced this very file. Bash reads scripts as it
  # goes, so continuing here would run a mix of old and new lines. Hand
  # over to the freshly pulled copy instead, skipping the pull.
  DEPLOY_PULLED=1 exec "$0" "$@"
fi

# A deploy that waited on the lock above usually wakes up to the same commit
# the first one just shipped. The build is not byte-for-byte repeatable, so
# rebuilding it made a "new" image and restarted the app a second time for
# nothing (seen 2026-09-20). Each good deploy leaves its commit in
# .git/tarte-deployed-sha (reset --hard leaves that alone); when HEAD still
# matches and the image is there, skip the build, and everything after it
# finds nothing to change. DEPLOY_FORCE=1 ./scripts/deploy.sh rebuilds anyway.
head_sha="$(git rev-parse HEAD)"
deployed_marker=".git/tarte-deployed-sha"
app_image="$(docker compose config --images | grep -- '-app$' | head -1)"
if [ -z "${DEPLOY_FORCE:-}" ] \
  && [ "$(cat "$deployed_marker" 2>/dev/null)" = "$head_sha" ] \
  && docker image inspect "$app_image" >/dev/null 2>&1; then
  echo "▶ ${head_sha:0:7} is already built and deployed, skipping the rebuild..."
else
  echo "▶ Rebuilding app + migrate images..."
  docker compose build app
  docker compose --profile tools build migrate
fi

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
#
# The conflict still turned up twice on 2026-09-20, and with set -e it ended
# the script right here: caddy and cron never came up, nothing below ran,
# and the site sat on 502 until someone ran this same command again by
# hand. So do that here: clear any stopped "<id>_tarte-kitchen-app-1"
# leftover, wait a moment, try again, three times in all. If it still
# fails, carry on; the image check below has the last word on "deployed".
up_app() {
  local attempt stale
  for attempt in 1 2 3; do
    docker compose up -d --no-deps app && return 0
    echo "  app did not come up (attempt $attempt of 3), clearing stale renamed containers..."
    stale="$(docker ps -aq --filter name=_tarte-kitchen-app-1 \
      --filter status=created --filter status=exited --filter status=dead)"
    if [ -n "$stale" ]; then
      # shellcheck disable=SC2086
      docker rm $stale || true
    fi
    sleep 5
  done
  return 1
}
up_app || echo "  app still not up after 3 attempts; the checks below decide." >&2

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
echo "$head_sha" > "$deployed_marker"

echo "✓ Deployed $(git rev-parse --short HEAD), app on image ${want#sha256:}."
