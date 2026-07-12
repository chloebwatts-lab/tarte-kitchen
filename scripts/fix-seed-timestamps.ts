/**
 * Fix the +10 h timestamp skew in seeded records.
 *
 * The seed scripts wrote e.g. "2026-07-12T14:33:00+10:00" into
 * timestamp-WITHOUT-time-zone columns; Postgres dropped the offset and kept
 * the AEST wall time as if it were UTC. The app then formats with
 * timeZone=Australia/Brisbane, adding another +10 h — so a 2:33 pm batch shows
 * as 12:33 am the next day. Fix: shift the seeded rows back 10 hours so they
 * follow the app's naive-UTC convention.
 *
 * Scope (seeded rows only):
 *   CoolingLog        — itemName in the seed's item list (the two real rows,
 *                       "CHICKEN" and "Xx", don't match)
 *   ChecklistRun      — createdAt >= 2026-07-12 (seed day) AND completedBy in
 *                       the seed staff pools (real historical runs predate the
 *                       seed and have completedBy = NULL)
 *   ChecklistRunItem  — same signature on checkedBy/createdAt
 *
 * Dry run default; --write to apply. Idempotence guard: only rows whose time
 * still looks AEST-naive (checklist completed hour 05–19 UTC = impossible for
 * a real AEST business-hours instant is NOT reliable — so instead this script
 * refuses to run twice: it checks a sentinel first).
 *   npx tsx --env-file=.env.local scripts/fix-seed-timestamps.ts [--write]
 */
import "dotenv/config"
import { Pool } from "pg"

const WRITE = process.argv.includes("--write")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 })

const SEED_ITEMS = [
  "Poached chicken breast", "Braised beef brisket", "Roast chicken (pulled)",
  "Pork & fennel sausage-roll filling", "Bacon jam", "Chicken stock",
  "Sautéed mushrooms", "Confit tomatoes", "Lobster (blanched)",
]
const SEED_STAFF = [
  "TM", "VS", "OW", "Ray", "DUW", "Yamill", "Fran", "S", "U", "CW", "SP",
  "JR", "CC", "LC", "AU", "CJ", "CT", "Janeth",
]

async function main() {
  const c = await pool.connect()
  try {
    // Sentinel: if any seeded cooling log already starts before 06:00 stored-UTC
    // on its own date, the shift has been applied (seeded starts were 10–15 AEST
    // → 00–05 UTC after fixing). Prevents double-shifting on a re-run.
    const sentinel = await c.query(
      `SELECT COUNT(*)::int n FROM "CoolingLog"
       WHERE "itemName" = ANY($1) AND EXTRACT(HOUR FROM "startedAt") BETWEEN 0 AND 5`,
      [SEED_ITEMS]
    )
    if (sentinel.rows[0].n > 20) {
      console.log(`Sentinel: ${sentinel.rows[0].n} seeded cooling rows already in 00–05 UTC — shift appears applied. ABORTING to avoid double-shift.`)
      return
    }

    const cool = await c.query(`SELECT COUNT(*)::int n FROM "CoolingLog" WHERE "itemName" = ANY($1)`, [SEED_ITEMS])
    const runs = await c.query(
      `SELECT COUNT(*)::int n FROM "ChecklistRun" WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "completedBy" = ANY($1) AND "completedAt" IS NOT NULL`,
      [SEED_STAFF]
    )
    const items = await c.query(
      `SELECT COUNT(*)::int n FROM "ChecklistRunItem" WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "checkedBy" = ANY($1) AND "checkedAt" IS NOT NULL`,
      [SEED_STAFF]
    )
    console.log(`${WRITE ? "WRITING" : "DRY RUN"} — rows to shift −10 h:`)
    console.log(`  CoolingLog:       ${cool.rows[0].n}`)
    console.log(`  ChecklistRun:     ${runs.rows[0].n}`)
    console.log(`  ChecklistRunItem: ${items.rows[0].n}`)
    if (!WRITE) { console.log("\nRe-run with --write to apply."); return }

    await c.query("BEGIN")
    try {
      const r1 = await c.query(
        `UPDATE "CoolingLog" SET
           "startedAt" = "startedAt" - interval '10 hours',
           "twoHourAt" = "twoHourAt" - interval '10 hours',
           "sixHourAt" = "sixHourAt" - interval '10 hours',
           "updatedAt" = NOW()
         WHERE "itemName" = ANY($1)`,
        [SEED_ITEMS]
      )
      const r2 = await c.query(
        `UPDATE "ChecklistRun" SET "completedAt" = "completedAt" - interval '10 hours', "updatedAt" = NOW()
         WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "completedBy" = ANY($1) AND "completedAt" IS NOT NULL`,
        [SEED_STAFF]
      )
      const r3 = await c.query(
        `UPDATE "ChecklistRunItem" SET "checkedAt" = "checkedAt" - interval '10 hours', "updatedAt" = NOW()
         WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "checkedBy" = ANY($1) AND "checkedAt" IS NOT NULL`,
        [SEED_STAFF]
      )
      await c.query("COMMIT")
      console.log(`\nShifted: cooling ${r1.rowCount}, runs ${r2.rowCount}, items ${r3.rowCount}. Done.`)
    } catch (e) {
      await c.query("ROLLBACK")
      throw e
    }
  } finally { c.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
