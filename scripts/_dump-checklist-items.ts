import "dotenv/config"
import { Pool } from "pg"
const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 30000 })
async function main() {
  const names = process.argv.slice(2)
  const r = await pool.query(
    `SELECT t.venue, t.name AS tname, t.cadence, i.id, i."sortOrder", i.label, i.instructions
     FROM "ChecklistTemplate" t JOIN "ChecklistTemplateItem" i ON i."templateId" = t.id
     WHERE t.name = ANY($1)
     ORDER BY t.venue, t.name, i."sortOrder"`, [names])
  let last = ""
  for (const row of r.rows) {
    const key = `${row.venue} / ${row.tname} (${row.cadence})`
    if (key !== last) { console.log(`\n=== ${key} ===`); last = key }
    console.log(`  [${row.sortOrder}] ${row.label}${row.instructions ? `  -- ${row.instructions}` : ""}`)
  }
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
