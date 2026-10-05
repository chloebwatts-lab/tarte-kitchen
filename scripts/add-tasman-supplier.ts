/**
 * Tasman Distribution (Tasman Star Seafood) bills Currumbin by card through
 * Stripe. The receipts go to shawna@, who forwards them to accounts@, so they
 * arrive from a staff mailbox that was mapped to Paramount Liquor only and
 * every one was parked as "contradicted by letterhead". Additive + idempotent:
 * find/create the supplier and map it to shawna@tarte.com.au.
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cuid = () => "c" + randomBytes(12).toString("hex")
async function main() {
  const found = await pool.query(
    `SELECT id, name FROM "Supplier" WHERE name ILIKE '%tasman%' ORDER BY "createdAt" ASC`)
  let id: string
  if (found.rows.length > 0) {
    id = found.rows[0].id
    console.log(`using existing "${found.rows[0].name}"`)
  } else {
    id = cuid()
    await pool.query(
      `INSERT INTO "Supplier" (id, name, notes, "updatedAt")
       VALUES ($1, 'Tasman Distribution', 'Tasman Star Seafood. Stripe receipts forwarded by shawna@tarte.com.au', NOW())`, [id])
    console.log(`+ created "Tasman Distribution"`)
  }
  const r = await pool.query(
    `INSERT INTO "SupplierEmail" (id, "supplierId", email)
     VALUES ($1, $2, 'shawna@tarte.com.au')
     ON CONFLICT ("supplierId", email) DO NOTHING RETURNING id`, [cuid(), id])
  console.log(r.rows.length > 0 ? "mapped to shawna@tarte.com.au" : "already mapped")
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
