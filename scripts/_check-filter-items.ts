import "dotenv/config"
import { Pool } from "pg"
const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 30000 })
async function main() {
  const r = await pool.query(`
    SELECT t.venue, t.name AS tname, i.id, i.label, COUNT(ri.id)::int AS run_items,
           COUNT(ri."checkedAt")::int AS checked
    FROM "ChecklistTemplateItem" i
    JOIN "ChecklistTemplate" t ON t.id = i."templateId"
    LEFT JOIN "ChecklistRunItem" ri ON ri."templateItemId" = i.id
    WHERE i.label ILIKE '%exhaust%' OR i.label ILIKE '%canopy%' OR i.label ILIKE '%filter%'
    GROUP BY t.venue, t.name, i.id, i.label
    ORDER BY t.venue, t.name, i.label`)
  for (const row of r.rows)
    console.log(`${row.venue.padEnd(12)} ${row.tname.padEnd(42)} ${row.label.slice(0, 70).padEnd(72)} runs:${row.run_items} checked:${row.checked}  ${row.id}`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
