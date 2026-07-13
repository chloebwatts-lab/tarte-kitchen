/**
 * Breadtop = EAC BUSINESS GROUP PTY LTD, invoicing via the shared Xero
 * sender with display name "Ka Wai Chan" (confirmed by Chris 2026-07-13).
 * Additive + idempotent: find/create the Breadtop supplier and map it to
 * the Xero sending address. The code-side sender hint (check-invoices)
 * does the disambiguation.
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cuid = () => "c" + randomBytes(12).toString("hex")
async function main() {
  const found = await pool.query(
    `SELECT id, name FROM "Supplier" WHERE name ILIKE '%breadtop%' OR name ILIKE '%eac business%' ORDER BY "createdAt" ASC`)
  let id: string
  if (found.rows.length > 0) {
    id = found.rows[0].id
    console.log(`✓ using existing "${found.rows[0].name}"`)
  } else {
    id = cuid()
    await pool.query(
      `INSERT INTO "Supplier" (id, name, notes, "updatedAt")
       VALUES ($1, 'Breadtop', 'Legal entity: EAC BUSINESS GROUP PTY LTD; Xero sender display name: Ka Wai Chan', NOW())`, [id])
    console.log(`+ created "Breadtop"`)
  }
  const r = await pool.query(
    `INSERT INTO "SupplierEmail" (id, "supplierId", email)
     VALUES ($1, $2, 'messaging-service@post.xero.com')
     ON CONFLICT ("supplierId", email) DO NOTHING RETURNING id`, [cuid(), id])
  console.log(r.rows.length > 0 ? "mapped to Xero sender" : "already mapped")
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
