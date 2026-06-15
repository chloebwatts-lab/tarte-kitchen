/**
 * Backfill venue on null-venue invoices using venue keywords already
 * captured in extractedData. The forward fix (processor.ts) now reads a
 * dedicated `billTo` block, but historical rows only ever captured
 * `deliveryAddress` + `supplierName` — and for portal/Pencilpay PDFs the
 * bill-to entity (e.g. "Tarte Beach House (Tarte Currumbin Pty Ltd)") was
 * mislabeled by Claude as `supplierName`. So we scan BOTH of those for a
 * venue keyword.
 *
 * Keyword-only on purpose: it will NOT apply the per-supplier default, so
 * the mis-matched junk wrongly tagged to "Paramount Liquor" (visa/software
 * invoices with no venue word) correctly stays null instead of polluting a
 * venue's spend.
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-invoice-venues-billto.ts
 *   npx tsx --env-file=.env.local scripts/backfill-invoice-venues-billto.ts --apply
 */
import { Pool } from "pg"
import { venueFromText } from "../src/lib/invoices/venue-from-address"

const apply = process.argv.includes("--apply")
const pool = new Pool({ connectionString: process.env.DATABASE_URL, statement_timeout: 30000 })

async function main() {
  const { rows } = await pool.query(
    `SELECT id, "supplierName" AS canonical,
            "invoiceDate"::date::text AS d,
            round(coalesce(total,0)::numeric,2) AS total,
            "extractedData"->>'deliveryAddress' AS delivery,
            "extractedData"->>'supplierName' AS pdf_name
     FROM "Invoice"
     WHERE venue IS NULL
       AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')`
  )

  const updates: { id: string; venue: string; why: string; canonical: string; total: string }[] = []
  for (const r of rows) {
    // 1. Ship-to address is fully reliable — trust any keyword.
    const vDelivery = venueFromText(r.delivery)
    // 2. The mislabeled bill-to (captured as supplierName) is reliable ONLY
    //    for the Tarte-venue concept names. A bare "Burleigh" match here is
    //    ambiguous — supplier trading names contain it (e.g. "Burleigh Marr
    //    Distribution" = Bidfood) — so reject a BURLEIGH-from-billTo result.
    const vBillRaw = venueFromText(r.pdf_name)
    const vBill = vBillRaw && vBillRaw !== "BURLEIGH" ? vBillRaw : null
    const venue = vDelivery ?? vBill
    if (venue) {
      const src = vDelivery ? `delivery="${r.delivery}"` : `billTo="${r.pdf_name}"`
      updates.push({ id: r.id, venue, why: src, canonical: r.canonical, total: r.total })
    }
  }

  console.log(`\nNull-venue invoices scanned: ${rows.length}`)
  console.log(`Resolvable by keyword: ${updates.length}\n`)
  console.table(
    updates.map((u) => ({ canonical: u.canonical, "→venue": u.venue, total: u.total, signal: u.why.slice(0, 55) }))
  )
  const byVenue = updates.reduce<Record<string, number>>((a, u) => {
    a[u.venue] = (a[u.venue] ?? 0) + Number(u.total)
    return a
  }, {})
  console.log("\n$ recovered per venue:", byVenue)

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to update.")
    await pool.end()
    return
  }

  let n = 0
  for (const u of updates) {
    await pool.query(`UPDATE "Invoice" SET venue = $1, "updatedAt" = now() WHERE id = $2 AND venue IS NULL`, [u.venue, u.id])
    n++
  }
  console.log(`\nAPPLIED — ${n} invoices updated.`)
  await pool.end()
}
main()
