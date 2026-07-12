import "dotenv/config"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 })

async function main() {
  const c = await pool.connect()
  try {
    const staff = await c.query(
      `SELECT venue, "completedBy", COUNT(*) n FROM "ChecklistRun"
       WHERE "runDate" >= '2026-05-17' AND "completedBy" IS NOT NULL
       GROUP BY venue, "completedBy" ORDER BY venue, n DESC`
    )
    console.log("=== completedBy by venue (new window) ===")
    let cur = ""
    for (const r of staff.rows) {
      if (r.venue !== cur) { cur = r.venue; console.log(`\n[${cur}]`) }
      process.stdout.write(`  ${r.completedBy}:${r.n}`)
    }
    const breach = await c.query(
      `SELECT COUNT(*) FILTER (WHERE "tempCelsius" > 5 AND ti."hotCheck" = false) cold_breach,
              COUNT(*) FILTER (WHERE "tempCelsius" < 60 AND ti."hotCheck" = true) hot_breach,
              COUNT(*) FILTER (WHERE "tempCelsius" IS NOT NULL) total_temps
       FROM "ChecklistRunItem" ri
       JOIN "ChecklistRun" run ON run.id = ri."runId"
       JOIN "ChecklistTemplateItem" ti ON ti.id = ri."templateItemId"
       WHERE run."runDate" >= '2026-05-17'`
    )
    const b = breach.rows[0]
    console.log(`\n\n=== temp readings (new window) ===`)
    console.log(`  total temp readings: ${b.total_temps}`)
    console.log(`  cold breaches (>5°C on cold check): ${b.cold_breach}`)
    console.log(`  hot breaches (<60°C on hot hold): ${b.hot_breach}`)
    const cool = await c.query(
      `SELECT venue, COUNT(*) n, COUNT(*) FILTER (WHERE "sixHourTempC" > 5) discarded
       FROM "CoolingLog" WHERE "startedAt" >= '2026-05-17' GROUP BY venue`
    )
    console.log(`\n=== cooling logs (new window) ===`)
    for (const r of cool.rows) console.log(`  ${r.venue}: ${r.n} logs, ${r.discarded} failed final ≤5°C (discarded)`)
  } finally { c.release(); await pool.end() }
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1) })
