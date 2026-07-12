/**
 * Map renee@gceggs.com.au → "Gold Coast Eggs" supplier so check-invoices
 * ingests their weekly invoice emails (confirmed arriving at accounts@
 * since at least June 2026 — subjects "Overdue account(s) GC Eggs" /
 * "Statements from GC Eggs", each carrying real per-delivery invoice
 * PDFs alongside activity statements).
 *
 * Additive + idempotent: finds an existing supplier matching
 * gold-coast-eggs/gc-eggs, creates one if absent, then upserts the
 * SupplierEmail row. No deletes, no overwrites of existing data.
 *
 * Run:  npx tsx --env-file=.env.local scripts/add-gc-eggs-supplier-email.ts
 * (needs the 15432 SSH tunnel to prod postgres — see tarte_deploy memory)
 *
 * After running, trigger a sweep (or wait for the daily one) so the last
 * 14 days of GC Eggs emails are picked up:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://kitchen.tarte.com.au/api/cron/check-invoices?mode=sweep"
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const GC_EMAIL = "renee@gceggs.com.au"

// Matches prisma cuid shape closely enough for a manual insert.
const cuid = () => "c" + randomBytes(12).toString("hex")

async function main() {
  const existing = await pool.query(
    `SELECT id, name, email FROM "Supplier"
     WHERE name ILIKE '%gold coast egg%' OR name ILIKE '%gc egg%'
     ORDER BY "createdAt" ASC`
  )
  let supplierId: string
  if (existing.rows.length > 0) {
    supplierId = existing.rows[0].id
    console.log(`Using existing supplier: ${existing.rows[0].name} (${supplierId})`)
    if (existing.rows.length > 1) {
      console.warn(
        "WARNING: multiple GC Eggs-ish suppliers found:",
        existing.rows.map((r) => r.name)
      )
    }
  } else {
    supplierId = cuid()
    await pool.query(
      `INSERT INTO "Supplier" (id, name, email, "updatedAt")
       VALUES ($1, 'Gold Coast Eggs', $2, NOW())`,
      [supplierId, GC_EMAIL]
    )
    console.log(`Created supplier "Gold Coast Eggs" (${supplierId})`)
  }

  const res = await pool.query(
    `INSERT INTO "SupplierEmail" (id, "supplierId", email)
     VALUES ($1, $2, $3)
     ON CONFLICT ("supplierId", email) DO NOTHING
     RETURNING id`,
    [cuid(), supplierId, GC_EMAIL]
  )
  console.log(
    res.rows.length > 0
      ? `Mapped ${GC_EMAIL} → supplier ${supplierId}`
      : `Mapping already existed — nothing to do`
  )
  await pool.end()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
