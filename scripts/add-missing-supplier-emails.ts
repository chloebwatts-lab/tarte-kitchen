/**
 * Map food/bev supplier sender addresses discovered in the
 * UnknownInvoiceSender queue (audit 2026-07-12) so check-invoices stops
 * skipping their emails. Additive + idempotent: creates the supplier only
 * if no name-match exists, upserts SupplierEmail rows, never deletes.
 *
 * Deliberately EXCLUDES non-food senders in the same queue (Elgas, Alsco,
 * Dishtec, JJ's Waste, Waterlogic, BOC, filter cleaning, plumbing, rent,
 * Bishopp, FCF, Commercial Kitchen Co, internal fwds from tarte.com.au
 * addresses) — mapping those would pull overheads into the COGS spend
 * tracker. Decide separately whether/how to track them.
 *
 * Run:  npx tsx --env-file=.env.local scripts/add-missing-supplier-emails.ts
 */
import { Pool } from "pg"
import { randomBytes } from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cuid = () => "c" + randomBytes(12).toString("hex")

/// match: ILIKE patterns to find an existing supplier row.
/// name: canonical name used if we have to create one.
const MAPPINGS: { name: string; match: string[]; emails: string[] }[] = [
  {
    name: "Fermex",
    match: ["%fermex%"],
    // New sender since 2026-06-30 — why Fermex looked 18d "overdue".
    emails: ["mail@fermexdistributors.com.au"],
  },
  {
    name: "Made Brands",
    match: ["%made brands%", "%made group%"],
    emails: ["do_not_reply@madegroup.com", "accounts@madegroup.com"],
  },
  {
    name: "Global Food & Wine",
    match: ["%global food%"],
    emails: ["stephanieh@globalfw.com.au", "kim.adams@globalfw.com.au"],
  },
  {
    name: "Eustralis",
    match: ["%eustralis%"],
    emails: ["accounts.qld@eustralis.com.au"],
  },
  {
    name: "Coastal Fresh",
    match: ["%coastal fresh%"],
    emails: ["ar@coastalfresh.com.au"],
  },
  {
    name: "Parallel Roasters",
    match: ["%parallel roasters%"],
    // Unleashed is a shared invoicing platform domain (cf. post.xero.com
    // shared by Pixel/Eustralis) — disambiguator resolves by display name.
    emails: ["noreply@unleashedsoftware.com"],
  },
  {
    name: "Mediterranean Markets",
    match: ["%mediterranean markets%"],
    emails: [
      "felicity@mediterraneanmarkets.com.au",
      "sara@mediterraneanmarkets.com.au",
    ],
  },
  {
    name: "Salumi",
    match: ["%salumi%"],
    emails: ["accounts@salumi.com.au"],
  },
  {
    name: "PE Foods",
    match: ["%pe foods%", "%p.e. foods%"],
    emails: ["accounts@pefoods.com.au"],
  },
  {
    name: "Cookers",
    match: ["%cookers%"],
    emails: ["invoices@cookers.com.au", "ar@cookers.com.au"],
  },
  {
    name: "Moet Hennessy",
    match: ["%moet%"],
    emails: ["do-not-reply@moethennessy.com"],
  },
]

async function main() {
  for (const m of MAPPINGS) {
    const where = m.match.map((_, i) => `name ILIKE $${i + 1}`).join(" OR ")
    const existing = await pool.query(
      `SELECT id, name FROM "Supplier" WHERE ${where} ORDER BY "createdAt" ASC`,
      m.match
    )
    let supplierId: string
    if (existing.rows.length > 0) {
      supplierId = existing.rows[0].id
      console.log(`✓ ${m.name}: using existing supplier "${existing.rows[0].name}"`)
      if (existing.rows.length > 1)
        console.warn(`  WARNING: multiple matches:`, existing.rows.map((r) => r.name))
    } else {
      supplierId = cuid()
      await pool.query(
        `INSERT INTO "Supplier" (id, name, email, "updatedAt") VALUES ($1, $2, $3, NOW())`,
        [supplierId, m.name, m.emails[0]]
      )
      console.log(`+ ${m.name}: created supplier`)
    }
    for (const email of m.emails) {
      const res = await pool.query(
        `INSERT INTO "SupplierEmail" (id, "supplierId", email)
         VALUES ($1, $2, $3) ON CONFLICT ("supplierId", email) DO NOTHING RETURNING id`,
        [cuid(), supplierId, email]
      )
      console.log(`  ${res.rows.length > 0 ? "mapped" : "already mapped"}: ${email}`)
    }
  }
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
