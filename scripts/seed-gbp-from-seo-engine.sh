#!/usr/bin/env bash
# Seed the prod GbpConnection row with the tarte-seo-engine refresh token.
#
# Background: chloe@'s GBP OAuth via kitchen.tarte.com.au resolves to a
# personal-unverified Google account that returns 0 locations from the
# Business Information API. The tarte-seo-engine project at
# /Users/chris/C/tarte-seo-engine/ has a refresh token tied to an
# account (accounts/103041246037960933753) that genuinely owns Beach
# House + Burleigh. Reusing that token here unblocks auto-posting.
#
# Run on the prod droplet:
#   bash /root/tarte-kitchen/scripts/seed-gbp-from-seo-engine.sh
#
# Idempotent: deletes any existing GbpConnection and inserts a fresh row.
set -euo pipefail

set -a
source /root/tarte-kitchen/.env
set +a

# Source token + account from the local tarte-seo-engine checkout if
# present (chris's machine), or from env vars passed in (anywhere else).
# Pass GBP_SEED_REFRESH_TOKEN + GBP_SEED_ACCOUNT explicitly to override.
if [[ -z "${GBP_SEED_REFRESH_TOKEN:-}" && -f "${HOME}/C/tarte-seo-engine/.env.local" ]]; then
  GBP_SEED_REFRESH_TOKEN=$(grep -E '^GOOGLE_REFRESH_TOKEN=' "${HOME}/C/tarte-seo-engine/.env.local" | cut -d= -f2-)
fi
if [[ -z "${GBP_SEED_ACCOUNT:-}" && -f "${HOME}/C/tarte-seo-engine/.env" ]]; then
  GBP_SEED_ACCOUNT=$(grep -E '^GBP_ACCOUNT=' "${HOME}/C/tarte-seo-engine/.env" | cut -d= -f2-)
fi
REFRESH_TOKEN="${GBP_SEED_REFRESH_TOKEN:?GBP_SEED_REFRESH_TOKEN required (or run on chris's mac with tarte-seo-engine checked out)}"
ACCOUNT_NAME="${GBP_SEED_ACCOUNT:?GBP_SEED_ACCOUNT required (e.g. accounts/103041246037960933753)}"
EMAIL="${GBP_SEED_EMAIL:-tarte-seo-engine}"

echo "▶ Exchanging refresh token for fresh access token..."
TOKEN_JSON=$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d grant_type=refresh_token \
  -d refresh_token="$REFRESH_TOKEN" \
  -d client_id="$GBP_CLIENT_ID" \
  -d client_secret="$GBP_CLIENT_SECRET")

ACCESS_TOKEN=$(echo "$TOKEN_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
EXPIRES_IN=$(echo "$TOKEN_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["expires_in"])')

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "✗ No access token returned — aborting. body: $TOKEN_JSON"
  exit 1
fi
echo "  access token len: ${#ACCESS_TOKEN}, expires in ${EXPIRES_IN}s"

ENC_SCRIPT='
const c = require("crypto");
const key = Buffer.from(process.env.KEY_B64, "base64");
const plaintext = process.env.PLAIN;
const iv = c.randomBytes(16);
const cipher = c.createCipheriv("aes-256-gcm", key, iv);
let enc = cipher.update(plaintext, "utf8", "hex");
enc += cipher.final("hex");
const tag = cipher.getAuthTag();
process.stdout.write(`${iv.toString("hex")}:${tag.toString("hex")}:${enc}`);
'

echo "▶ Encrypting refresh token (inside app container, has node + key)..."
ENCRYPTED_REFRESH=$(docker exec -e KEY_B64="$TOKEN_ENCRYPTION_KEY" -e PLAIN="$REFRESH_TOKEN" tarte-kitchen-app-1 node -e "$ENC_SCRIPT")
ENCRYPTED_ACCESS=$(docker exec -e KEY_B64="$TOKEN_ENCRYPTION_KEY" -e PLAIN="$ACCESS_TOKEN" tarte-kitchen-app-1 node -e "$ENC_SCRIPT")
echo "  refresh ciphertext: ${ENCRYPTED_REFRESH:0:60}... (len ${#ENCRYPTED_REFRESH})"
echo "  access  ciphertext: ${ENCRYPTED_ACCESS:0:60}... (len ${#ENCRYPTED_ACCESS})"

EXPIRY_ISO=$(date -u -d "+${EXPIRES_IN} seconds" +"%Y-%m-%dT%H:%M:%S.%3NZ")
ID="gbp_seo_engine_$(date +%s)"

echo "▶ Updating GbpConnection in DB..."
docker exec -i tarte-kitchen-db-1 psql -U tarte -d tarte_kitchen <<SQL
BEGIN;
DELETE FROM "GbpConnection";
INSERT INTO "GbpConnection" (id, "accessToken", "refreshToken", "tokenExpiry", email, "accountName", "createdAt", "updatedAt")
VALUES ('$ID', '$ENCRYPTED_ACCESS', '$ENCRYPTED_REFRESH', '$EXPIRY_ISO', '$EMAIL', '$ACCOUNT_NAME', NOW(), NOW());
COMMIT;
SELECT id, email, "accountName", "tokenExpiry" FROM "GbpConnection";
SQL

echo "✓ Done."
