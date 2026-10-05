/**
 * Knotsbury Farm started invoicing Currumbin on 1 Oct 2026 through the shared
 * Xero relay (display name "eddie uzan"), with no supplier to match so every
 * invoice was parked. Additive + idempotent: find/create the supplier and map
 * it to the Xero sending address; the letterhead token does the matching.
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cuid = () => "c" + randomBytes(12).toString("hex")
async function main() {
  const found = await pool.query(
    `SELECT id, name FROM "Supplier" WHERE name ILIKE '%knotsbury%' ORDER BY "createdAt" ASC`)
  let id: string
  if (found.rows.length > 0) {
    id = found.rows[0].id
    console.log(`using existing "${found.rows[0].name}"`)
  } else {
    id = cuid()
    await pool.query(
      `INSERT INTO "Supplier" (id, name, notes, "updatedAt")
       VALUES ($1, 'Knotsbury Farm', 'Invoices via the shared Xero sender, display name: eddie uzan', NOW())`, [id])
    console.log(`+ created "Knotsbury Farm"`)
  }
  const r = await pool.query(
    `INSERT INTO "SupplierEmail" (id, "supplierId", email)
     VALUES ($1, $2, 'messaging-service@post.xero.com')
     ON CONFLICT ("supplierId", email) DO NOTHING RETURNING id`, [cuid(), id])
  console.log(r.rows.length > 0 ? "mapped to Xero sender" : "already mapped")
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
