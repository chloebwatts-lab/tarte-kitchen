#!/usr/bin/env bash
# Pre-deploy gate: typecheck + every unit test. Runs locally (pre-push hook,
# `npm run check`) and in GitHub Actions before the deploy job. Any failure
# stops the push/deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d src/generated/prisma ]; then
  echo "== prisma generate (client missing)"
  DATABASE_URL="${DATABASE_URL:-postgresql://x:x@localhost:5432/x}" npx prisma generate >/dev/null
fi

echo "== typecheck"
npx tsc --noEmit -p .

echo "== unit tests"
npm test --silent

echo "== all checks passed"
