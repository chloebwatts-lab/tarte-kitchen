/**
 * Maintenance contact updates from G's ordering/services doc (via Chloe,
 * 2026-08-05):
 *  - add Plumbing Doctor (blockages/leaks)
 *  - add Brian, pest control
 *  - append Kirra's mobile to Dishtec's notes
 *  - append the "call UNOX first, then Dishtec if out of warranty" tip
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-maint-contacts-20260805.ts
 * Idempotent — skips inserts that exist and appends notes only once.
 */
import "dotenv/config"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 })

async function main() {
  const client = await pool.connect()
  try {
    const inserts = [
      {
        name: "Plumbing Doctor",
        phone: "07 5530 6333",
        specialties: ["plumbing"],
        notes: "Blockages and leaks (per G's doc, Aug 26).",
        sortOrder: 11,
      },
      {
        name: "Brian — pest control",
        phone: "0488 996 337",
        specialties: ["pest-control"],
        notes: "Pest control (per G's doc, Aug 26). Also listed on the staff Ordering & supplies page.",
        sortOrder: 13,
      },
    ]
    for (const c of inserts) {
      const exists = await client.query(`SELECT id FROM "MaintenanceContact" WHERE name = $1`, [c.name])
      if (exists.rows.length > 0) {
        console.log(`  SKIP  ${c.name}`)
        continue
      }
      await client.query(
        `INSERT INTO "MaintenanceContact" (id, name, phone, specialties, notes, "sortOrder", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())`,
        [c.name, c.phone, c.specialties, c.notes, c.sortOrder]
      )
      console.log(`  ADD   ${c.name}`)
    }

    const appends = [
      {
        name: "Dishtec",
        marker: "Kirra",
        text: " Kirra (works for Dishtec): +61 459 077 733.",
      },
      {
        name: "UNOX Australia",
        marker: "walk you through",
        text:
          " If a message comes up on the oven screen, call UNOX first — they can often walk you through what to press, or tell you the problem (write it down). If it's not under warranty, book the repair through Dishtec instead (cheaper).",
      },
    ]
    for (const a of appends) {
      const r = await client.query(
        `UPDATE "MaintenanceContact"
         SET notes = COALESCE(notes, '') || $2, "updatedAt" = NOW()
         WHERE name = $1 AND (notes IS NULL OR notes NOT LIKE '%' || $3 || '%')`,
        [a.name, a.text, a.marker]
      )
      console.log(`  ${r.rowCount ? "NOTE " : "SKIP "} ${a.name}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
