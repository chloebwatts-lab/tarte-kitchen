/**
 * Writes Uber Eats daily figures pulled from Chloe's signed-in Chrome into
 * prod DailyUberSales: the no-paste route (8 Nov 2026), run by the
 * "Uber sales from Chrome" scheduled task after it runs
 * scripts/uber-chrome-pull.browser.js in the Uber Eats Manager tab.
 *
 *   npx tsx scripts/uber-chrome-ingest.ts /path/to/pull.json
 *
 * Only numbers travel (date, venue, sales inc GST, orders), validated by
 * src/lib/uber/chrome-pull.ts. Writes over ssh to the droplet's db
 * container (key auth, as in the deploy notes). Exit codes: 0 ok,
 * 3 Chrome signed out of Uber, 4 nothing usable, 5 database write failed.
 */
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { validateChromeRows, chromeIngestSql } from "../src/lib/uber/chrome-pull"

const file = process.argv[2]
if (!file) {
  console.error("usage: npx tsx scripts/uber-chrome-ingest.ts <pull.json>")
  process.exit(2)
}

let raw: unknown = JSON.parse(readFileSync(file, "utf8"))
// The browser script returns a JSON string; tolerate it being saved quoted.
if (typeof raw === "string") raw = JSON.parse(raw)
const pull = raw as { signedIn?: boolean; errors?: string[] }

const { rows, rejected } = validateChromeRows(raw)
if (pull?.signedIn === false && !rows.length) {
  console.error(`SIGNED_OUT: Chrome is not signed in to Uber Eats Manager. ${(pull.errors ?? []).join("; ")}`)
  process.exit(3)
}
if (!rows.length) {
  console.error(`NO_ROWS: nothing usable (rejected ${rejected}). ${(pull?.errors ?? []).join("; ")}`)
  process.exit(4)
}

const r = spawnSync(
  "ssh",
  ["-o", "ConnectTimeout=15", "-o", "BatchMode=yes", "root@134.199.157.138",
    "cd /root/tarte-kitchen && docker compose exec -T db psql -U tarte -d tarte_kitchen -v ON_ERROR_STOP=1 -q"],
  { input: chromeIngestSql(rows), encoding: "utf8" },
)
if (r.status !== 0) {
  const err = (r.stderr ?? "").split("\n").filter((l) => l.trim() && !l.includes("WASTAGE_SHEET_ID")).join("\n")
  console.error(`DB_WRITE_FAILED: ${err || `ssh exit ${r.status}`}`)
  process.exit(5)
}

console.log(`OK: ${rows.length} venue-days written${rejected ? `, ${rejected} rejected` : ""}${pull?.errors?.length ? `, warnings: ${pull.errors.join("; ")}` : ""}`)
for (const x of rows) console.log(`${x.date} ${x.venue.padEnd(11)} $${x.sales.toFixed(2).padStart(9)} ${String(x.orders).padStart(3)} orders`)
