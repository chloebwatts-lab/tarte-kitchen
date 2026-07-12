import "dotenv/config"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 })

async function main() {
  const c = await pool.connect()
  try {
    const t = await c.query(
      `SELECT t.id, t.name, t.venue, t.cadence, t.shift, t.area, t."isFoodSafety", t."isActive",
              COUNT(ti.id)::int AS items
       FROM "ChecklistTemplate" t
       LEFT JOIN "ChecklistTemplateItem" ti ON ti."templateId" = t.id
       GROUP BY t.id ORDER BY t."isActive" DESC, t.venue, t.cadence, t.name`
    )
    console.log(`=== ALL CHECKLIST TEMPLATES (${t.rows.length}) ===`)
    for (const r of t.rows) {
      console.log(`${r.isActive ? "●" : "○"} [${r.venue}] ${r.name} — ${r.cadence}/${r.shift} · area=${r.area ?? "—"} · fs=${r.isFoodSafety} · ${r.items} items`)
    }

    const pp = await c.query(
      `SELECT venue, COUNT(*)::int n, COUNT(*) FILTER (WHERE "isActive")::int active
       FROM "PastryProduct" GROUP BY venue ORDER BY venue`
    )
    console.log(`\n=== PASTRY PRODUCTS ===`)
    if (pp.rows.length === 0) console.log("  (none)")
    for (const r of pp.rows) console.log(`  ${r.venue}: ${r.n} products (${r.active} active)`)

    const pr = await c.query(`SELECT COUNT(*)::int n, MIN("entryDate") a, MAX("entryDate") b FROM "PastryRotationEntry"`)
    console.log(`\n=== PastryRotationEntry rows: ${pr.rows[0].n} (${pr.rows[0].a?.toISOString?.().slice(0,10) ?? "-"} .. ${pr.rows[0].b?.toISOString?.().slice(0,10) ?? "-"}) ===`)
  } finally { c.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
