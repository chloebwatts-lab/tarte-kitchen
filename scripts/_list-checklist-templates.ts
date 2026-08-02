import "dotenv/config"
import { Pool } from "pg"
const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 30000 })
async function main() {
  const r = await pool.query(`SELECT t.venue, t.area, t.name, t.cadence, t."isActive", COUNT(i.id)::int AS items
    FROM "ChecklistTemplate" t LEFT JOIN "ChecklistTemplateItem" i ON i."templateId" = t.id
    GROUP BY t.id ORDER BY t.venue, t.area, t.name`)
  for (const row of r.rows) console.log(`${row.venue.padEnd(12)} ${String(row.area).padEnd(14)} ${row.name.padEnd(40)} ${row.cadence.padEnd(8)} ${row.items} items ${row.isActive ? "" : "(inactive)"}`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
