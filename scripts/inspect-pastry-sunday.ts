import "dotenv/config"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 })

async function main() {
  const c = await pool.connect()
  try {
    console.log("=== SUNDAY 2026-07-12 BURLEIGH pastry entries (the real example) ===")
    const sun = await c.query(
      `SELECT p.name, e."bakeTime", e.prepared, e.sold, e.discarded, e."staffName", e.notes,
              e."createdAt", e."updatedAt"
       FROM "PastryRotationEntry" e JOIN "PastryProduct" p ON p.id = e."productId"
       WHERE e.venue = 'BURLEIGH' AND e."entryDate" = '2026-07-12'::date
       ORDER BY e."bakeTime", p."sortOrder"`
    )
    for (const r of sun.rows) {
      const touched = r.updatedAt?.getTime() !== r.createdAt?.getTime() ? " [UPDATED]" : ""
      console.log(`  ${r.bakeTime}  ${r.name}: prep ${r.prepared} / sold ${r.sold} / binned ${r.discarded} by ${r.staffName ?? "—"}${r.notes ? ` · "${r.notes}"` : ""}${touched}`)
    }

    console.log("\n=== staffName distribution across ALL pastry entries ===")
    const staff = await c.query(
      `SELECT venue, "staffName", COUNT(*)::int n FROM "PastryRotationEntry" GROUP BY venue, "staffName" ORDER BY venue, n DESC`
    )
    for (const r of staff.rows) console.log(`  ${r.venue} ${r.staffName ?? "—"}: ${r.n}`)

    console.log("\n=== ALL pastry products ===")
    const prods = await c.query(`SELECT name, venue, "sortOrder", "isActive" FROM "PastryProduct" ORDER BY "sortOrder"`)
    for (const r of prods.rows) console.log(`  ${r.isActive ? "●" : "○"} ${r.name} (${r.venue})`)

    console.log("\n=== WasteEntry sample — recent pastry-ish waste ===")
    const waste = await c.query(
      `SELECT venue, date AS d, "itemName", quantity, unit, reason
       FROM "WasteEntry"
       WHERE date >= '2026-06-25'
       ORDER BY date DESC LIMIT 40`
    )
    if (waste.rows.length === 0) console.log("  (no waste entries since 2026-06-25)")
    for (const r of waste.rows) console.log(`  ${r.d.toISOString().slice(0,10)} [${r.venue}] ${r.itemName} × ${r.quantity} ${r.unit ?? ""} (${r.reason})`)

    console.log("\n=== bakeTime distribution in existing entries ===")
    const bt = await c.query(`SELECT "bakeTime", COUNT(*)::int n FROM "PastryRotationEntry" GROUP BY "bakeTime"`)
    for (const r of bt.rows) console.log(`  ${r.bakeTime}: ${r.n}`)
  } finally { c.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
