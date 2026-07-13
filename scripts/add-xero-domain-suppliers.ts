/**
 * Map three food suppliers whose invoices arrive via the shared Xero
 * sending domain (messaging-service@post.xero.com). The sender address
 * maps to MULTIPLE suppliers; check-invoices disambiguates by the
 * email display name / parsed invoice supplier, so adding candidates is
 * safe. Additive + idempotent.
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cuid = () => "c" + randomBytes(12).toString("hex")
const XERO = "messaging-service@post.xero.com"
const SUPPLIERS: { name: string; match: string[] }[] = [
  { name: "Parallel Roasters", match: ["%parallel roasters%"] },
  { name: "El Chori", match: ["%el chori%"] },
  { name: "Gold Coast Premium Foods", match: ["%gold coast premium%"] },
]
async function main() {
  for (const s of SUPPLIERS) {
    const where = s.match.map((_, i) => `name ILIKE $${i + 1}`).join(" OR ")
    const found = await pool.query(
      `SELECT id, name FROM "Supplier" WHERE ${where} ORDER BY "createdAt" ASC`, s.match)
    let id: string
    if (found.rows.length > 0) {
      id = found.rows[0].id
      console.log(`✓ using existing "${found.rows[0].name}"`)
    } else {
      id = cuid()
      await pool.query(
        `INSERT INTO "Supplier" (id, name, "updatedAt") VALUES ($1, $2, NOW())`, [id, s.name])
      console.log(`+ created "${s.name}"`)
    }
    const r = await pool.query(
      `INSERT INTO "SupplierEmail" (id, "supplierId", email)
       VALUES ($1, $2, $3) ON CONFLICT ("supplierId", email) DO NOTHING RETURNING id`,
      [cuid(), id, XERO])
    console.log(`  ${r.rows.length > 0 ? "mapped" : "already mapped"}: ${s.name} ↔ ${XERO}`)
  }
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
