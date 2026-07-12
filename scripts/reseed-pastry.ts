/**
 * Corrections pass (2026-07-12, per Chris):
 *   1. Cooling logs: rename seeded "Roast chicken (pulled)" → "Poached chicken
 *      breast" (Tarte poaches, doesn't roast).
 *   2. Pastry rotation: delete MY seeded entries (wrong staff + wrong pattern)
 *      and reseed from the REAL Sunday 2026-07-12 Burleigh entries the team
 *      filled in as the reference example:
 *        - weekday prepared = 70% of Sunday's numbers (Sat/Sun = 100%)
 *        - 6 AM bake always sells out (discarded 0)
 *        - 9 AM bake: everything in the base, modest numbers, ≤2% discard
 *        - 12 PM bake: discards auto-filled from the WasteEntry (wastage sheet)
 *          rows for that venue+date where the item name matches; small fallback
 *        - staff: Burleigh = JP/BM/BB · Currumbin venues = DE/BB/TZ
 *
 * Old-seed identification (safe): rows created on 2026-07-12 by the seed run,
 * never touched by the app (updatedAt = createdAt), staffName in the OLD
 * checklist-crew pool. Team entries (JP/BM/BB/DE/TZ or app-updated) can't match.
 *
 * Dry run default; --write to apply.
 *   npx tsx --env-file=.env.local scripts/reseed-pastry.ts [--write]
 */
import "dotenv/config"
import { Pool } from "pg"

const WRITE = process.argv.includes("--write")
const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

// The OLD (wrong) staff pool my first pastry seed used — identifies my rows.
const OLD_POOL = ["TM", "VS", "OW", "Ray", "DUW", "Yamill", "Fran", "S", "U", "CW", "SP", "JR", "CC", "LC", "AU", "CJ", "CT", "Janeth"]

// Correct pastry-rotation staff (per Chris, 2026-07-12).
const PASTRY_STAFF: Record<string, string[]> = {
  BURLEIGH: ["JP", "BM", "BB"],
  BEACH_HOUSE: ["DE", "BB", "TZ"],
  TEA_GARDEN: ["DE", "BB", "TZ"],
}
// Currumbin venues have no real reference day — scale Burleigh's base.
const VENUE_SCALE: Record<string, number> = { BURLEIGH: 1, BEACH_HOUSE: 0.8, TEA_GARDEN: 0.5 }

const WINDOW_FROM = "2026-05-17"
const WINDOW_TO = "2026-07-11" // never touch the real Sunday 12th

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng(seed: string) {
  let a = hash(seed)
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)]

function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += 86400000)
    out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())

async function main() {
  const c = await pool.connect()
  try {
    // ── 1. cooling rename ────────────────────────────────────────────────
    const roast = await c.query(`SELECT COUNT(*)::int n FROM "CoolingLog" WHERE "itemName" = 'Roast chicken (pulled)'`)
    console.log(`Cooling rename: ${roast.rows[0].n} "Roast chicken (pulled)" rows → "Poached chicken breast"`)
    if (WRITE && roast.rows[0].n > 0) {
      await c.query(`UPDATE "CoolingLog" SET "itemName" = 'Poached chicken breast', "updatedAt" = NOW() WHERE "itemName" = 'Roast chicken (pulled)'`)
      console.log("  renamed ✓")
    }

    // ── 2. read the REAL Sunday base (rows NOT matching my old-seed signature) ──
    const base = await c.query(
      `SELECT e."productId", p.name, e."bakeTime", e.prepared, e.sold, e.discarded
       FROM "PastryRotationEntry" e JOIN "PastryProduct" p ON p.id = e."productId"
       WHERE e.venue = 'BURLEIGH' AND e."entryDate" = '2026-07-12'::date
         AND NOT (e."createdAt" >= '2026-07-12T00:00:00Z' AND e."updatedAt" = e."createdAt" AND e."staffName" = ANY($1))
       ORDER BY e."bakeTime", p."sortOrder"`,
      [OLD_POOL]
    )
    console.log(`\nReal Sunday 12th Burleigh base rows: ${base.rows.length}`)
    for (const b of base.rows) console.log(`  ${b.bakeTime}  ${b.name}: prep ${b.prepared} / sold ${b.sold} / binned ${b.discarded}`)
    if (base.rows.length === 0) {
      console.log("\nABORT: no real Sunday entries found to use as the base pattern. Nothing deleted or written.")
      return
    }

    // ── 3. delete my old seeded pastry rows ──────────────────────────────
    const oldRows = await c.query(
      `SELECT COUNT(*)::int n FROM "PastryRotationEntry"
       WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "updatedAt" = "createdAt" AND "staffName" = ANY($1)`,
      [OLD_POOL]
    )
    console.log(`\nOld seeded pastry entries matching my signature: ${oldRows.rows[0].n} (to delete)`)
    if (WRITE) {
      const del = await c.query(
        `DELETE FROM "PastryRotationEntry"
         WHERE "createdAt" >= '2026-07-12T00:00:00Z' AND "updatedAt" = "createdAt" AND "staffName" = ANY($1)`,
        [OLD_POOL]
      )
      console.log(`  deleted ${del.rowCount} ✓`)
    }

    // ── 4. wastage lookup (12 PM bake discards from the wastage sheet) ───
    const waste = await c.query(
      `SELECT venue, date::date AS d, LOWER("itemName") AS item, SUM(quantity)::float AS qty
       FROM "WasteEntry" WHERE date BETWEEN $1::date AND $2::date
       GROUP BY venue, date, LOWER("itemName")`,
      [WINDOW_FROM, WINDOW_TO]
    )
    const wasteMap = new Map<string, number>()
    for (const w of waste.rows) wasteMap.set(`${w.venue}|${w.d.toISOString().slice(0, 10)}|${w.item}`, w.qty)
    console.log(`\nWastage-sheet rows in window: ${waste.rows.length} (drives 12 PM bake discards where names match)`)

    function wastageFor(venue: string, date: string, productName: string): number | null {
      const pl = productName.toLowerCase()
      for (const [k, qty] of wasteMap) {
        const [v, d, item] = k.split("|")
        if (v === venue && d === date && (item.includes(pl) || pl.includes(item))) return Math.round(qty)
      }
      return null
    }

    // ── 5. reseed ─────────────────────────────────────────────────────────
    const dates = datesBetween(WINDOW_FROM, WINDOW_TO)
    let created = 0, wastageDriven = 0
    const sample: string[] = []

    for (const venue of Object.keys(PASTRY_STAFF)) {
      const scale = VENUE_SCALE[venue]
      for (const date of dates) {
        const dayFactor = isWeekend(date) ? 1.0 : 0.7
        for (const b of base.rows) {
          if (b.prepared === 0) continue // product not baked in the base example — keep it unbaked
          const r = rng(`pastry-v2|${venue}|${date}|${b.productId}|${b.bakeTime}`)
          const prepared = Math.max(1, Math.round(b.prepared * dayFactor * scale * (0.92 + r() * 0.16)))
          let discarded: number
          let notes: string | null = null
          if (b.bakeTime === "SIX_AM") {
            discarded = 0 // 6 AM bake always sells out
          } else if (b.bakeTime === "TWELVE_PM") {
            const w = wastageFor(venue, date, b.name)
            if (w !== null) { discarded = Math.min(w, Math.floor(prepared * 0.5)); notes = "EOD count per wastage sheet"; wastageDriven++ }
            else discarded = r() < 0.5 ? 0 : 1 + Math.floor(r() * 2)
          } else {
            // NINE_AM: ~2% overall discard
            discarded = r() < 0.7 ? 0 : 1 + Math.floor(r() * 2)
          }
          const sold = Math.max(0, prepared - discarded)
          const staffMember = pick(r, PASTRY_STAFF[venue])
          if (!WRITE) {
            created++
            if (sample.length < 10 && (venue === "BURLEIGH")) sample.push(`  ${date}${isWeekend(date) ? " (wknd)" : ""} [${venue}] ${b.name} ${b.bakeTime}: prep ${prepared}/sold ${sold}/binned ${discarded} by ${staffMember}${notes ? ` · ${notes}` : ""}`)
            continue
          }
          const res = await c.query(
            `INSERT INTO "PastryRotationEntry" (id, venue, "entryDate", "bakeTime", "productId", prepared, sold, discarded, "staffName", notes, "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2::date, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (venue, "entryDate", "bakeTime", "productId") DO NOTHING`,
            [venue, date, b.bakeTime, b.productId, prepared, sold, discarded, staffMember, notes]
          )
          if ((res.rowCount ?? 0) > 0) created++
        }
      }
    }

    if (!WRITE) {
      console.log("\nSAMPLE reseed (Burleigh):")
      sample.forEach((s) => console.log(s))
      console.log(`\nWould insert ~${created} entries (${wastageDriven} with wastage-sheet-driven discards).`)
      console.log("DRY RUN — nothing deleted or written. Re-run with --write.")
    } else {
      console.log(`\nReseeded ${created} entries (${wastageDriven} wastage-driven). Done.`)
    }
  } finally { c.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
