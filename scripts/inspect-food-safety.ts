import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

async function main() {
  const c = await pool.connect()
  try {
    const t = await c.query(
      `SELECT id, name, venue, cadence, shift, "isFoodSafety", "dueByHour", "isActive"
       FROM "ChecklistTemplate"
       WHERE area = 'Food Safety' OR "isFoodSafety" = true
       ORDER BY venue, cadence, shift, name`
    )
    console.log(`\n=== FOOD-SAFETY / DAILY TEMPLATES (${t.rows.length}) ===`)
    for (const r of t.rows) {
      const items = await c.query(
        `SELECT label, "requireTemp", "hotCheck" FROM "ChecklistTemplateItem" WHERE "templateId" = $1 ORDER BY "sortOrder"`,
        [r.id]
      )
      console.log(`\n[${r.venue}] ${r.name}  (${r.cadence}/${r.shift}) fs=${r.isFoodSafety} active=${r.isActive} due=${r.dueByHour}`)
      for (const it of items.rows) {
        console.log(`    - ${it.label}  ${it.requireTemp ? (it.hotCheck ? "[HOT≥60]" : "[COLD≤5]") : "[check]"}`)
      }
    }

    const runs = await c.query(
      `SELECT venue, MIN("runDate") AS first, MAX("runDate") AS last, COUNT(*) AS n
       FROM "ChecklistRun" GROUP BY venue ORDER BY venue`
    )
    console.log(`\n=== EXISTING RUNS ===`)
    for (const r of runs.rows) console.log(`  ${r.venue}: ${r.n} runs, ${r.first?.toISOString?.().slice(0,10)} .. ${r.last?.toISOString?.().slice(0,10)}`)

    const staff = await c.query(
      `SELECT "completedBy", COUNT(*) n FROM "ChecklistRun" WHERE "completedBy" IS NOT NULL GROUP BY "completedBy" ORDER BY n DESC LIMIT 15`
    )
    console.log(`\n=== completedBy values seen ===`)
    for (const s of staff.rows) console.log(`  ${s.completedBy} (${s.n})`)
  } finally {
    c.release()
    await pool.end()
  }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
