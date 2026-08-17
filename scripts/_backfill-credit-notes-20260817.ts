/**
 * Backfill: repair supplier credit notes that were ingested as ordinary
 * positive-value invoices and so INFLATED spend by twice their value.
 *
 * Found 2026-08-17 when the live spend page showed Global Food & Wine at
 * $5,377 for the trading week of 12 Aug against a true net of $1,559.18.
 *
 * Every id below was verified individually by pulling the stored PDF off the
 * droplet and reading it: all twelve print "Credit Note" / "CREDIT NOTE" in
 * the document header. The list is a hard-coded allowlist rather than a
 * pattern match so this script can never touch a row nobody has eyeballed.
 *
 * Rows already carrying a negative total (Jensens, The Provedores, Pacific
 * Wholesale) are deliberately NOT touched: they always netted correctly, and
 * relabelling them would be churn with no numeric effect.
 *
 * Run with --apply to write. Default is a dry run.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const APPLY = process.argv.includes("--apply")

/** Credit notes stored with positive amounts -> negate + status CREDIT_NOTE. */
const TO_NEGATE: Array<{ id: string; num: string; supplier: string; expect: number }> = [
  { id: "cmsqr52du21or01nera022292", num: "CMBR-014121", supplier: "Global Food & Wine", expect: 174.82 },
  { id: "cmsqmvim01ufh01neg6cnzf95", num: "CMBR-014081", supplier: "Global Food & Wine", expect: 1734 },
  { id: "cmsmeo50200r301jy1bc1hz4x", num: "C7139711.GOL", supplier: "Bidfood", expect: 4.11 },
  { id: "cmsk337042u1001s1gv89dvdz", num: "CN306", supplier: "Pixel Bread", expect: 15 },
  { id: "cmryamt7m1lc401p7oj7izm9g", num: "CMBR-013695", supplier: "Global Food & Wine", expect: 174.27 },
  { id: "cmrx3qvbz00kz01oj5khpae4y", num: "C7123452.GOL", supplier: "Bidfood", expect: 102.2 },
  { id: "cmrsc9zfhakqh01mmyr3wf874", num: "C7118302.GOL", supplier: "Bidfood", expect: 98.45 },
  { id: "cmqm2i7yzbtmk01pizlv2sbsf", num: "CN280", supplier: "Pixel Bread", expect: 8.4 },
  { id: "cmpkx21hm0uui01qsgbjgaf5g", num: "CN260", supplier: "Pixel Bread", expect: 18.8 },
  { id: "cmoju0xhi004v01qst9ggxnrr", num: "CN1515", supplier: "Cheese Time", expect: 173.75 },
  { id: "cmntc8cnq00cj01mrp33u7c22", num: "C7021909.GOL", supplier: "Bidfood", expect: 12.21 },
]

/**
 * The one true duplicate the content-dedupe missed. Pixel Bakehouse sent
 * credit note CN306 twice, once from their portal and once from Xero. The
 * portal copy was wrongly attributed to supplier "Cheese Time", so the
 * dedupe (which is scoped to supplierId + invoiceNumber) never saw the pair.
 * Both PDFs read "Pixel Bakehouse Pty Ltd"; keeping the correctly-attributed
 * Pixel Bread row and marking the mis-attributed copy DUPLICATE.
 */
const TO_MARK_DUPLICATE = {
  id: "cmsk33b732u1201s1eqwakhei",
  num: "CN306",
  supplier: "Cheese Time (actually Pixel Bakehouse)",
  expect: 15,
  duplicateOf: "cmsk337042u1001s1gv89dvdz",
}

const neg = (n: unknown): number | null =>
  n == null ? null : -Math.abs(Number(n))

async function main() {
  console.log(APPLY ? "APPLYING\n" : "DRY RUN (pass --apply to write)\n")
  let deltaTotal = 0

  for (const t of TO_NEGATE) {
    const inv = await db.invoice.findUnique({
      where: { id: t.id },
      select: {
        invoiceNumber: true, supplierName: true, invoiceDate: true, status: true,
        total: true, subtotal: true, gst: true,
        lineItems: { select: { id: true, description: true, quantity: true, lineTotal: true } },
      },
    })
    if (!inv) { console.log(`!! ${t.num} (${t.id}) NOT FOUND, skipping`); continue }

    // Guard: refuse to touch a row that isn't exactly what was verified.
    if (inv.invoiceNumber !== t.num) {
      console.log(`!! ${t.id}: invoiceNumber is "${inv.invoiceNumber}", expected "${t.num}" — SKIPPING`)
      continue
    }
    if (Math.abs(Number(inv.total) - t.expect) > 0.005) {
      console.log(`!! ${t.num}: total is ${inv.total}, expected ${t.expect} — SKIPPING`)
      continue
    }
    if (Number(inv.total) < 0) {
      console.log(`   ${t.num}: already negative, nothing to do`)
      continue
    }

    // Spend counts ex-GST (subtotal when present), so the swing on the
    // spend page is twice the subtotal, not twice the inc-GST total.
    const exGst = inv.subtotal != null ? Number(inv.subtotal) : Number(inv.total)
    deltaTotal += 2 * exGst

    console.log(
      `   ${t.num.padEnd(14)} ${t.supplier.padEnd(20)} ${inv.invoiceDate?.toISOString().slice(0, 10)}  ` +
        `${inv.status} -> CREDIT_NOTE   total ${inv.total} -> ${neg(inv.total)}   ` +
        `subtotal ${inv.subtotal} -> ${neg(inv.subtotal)}   (${inv.lineItems.length} lines)`
    )

    if (!APPLY) continue

    await db.$transaction([
      db.invoice.update({
        where: { id: t.id },
        data: {
          status: "CREDIT_NOTE",
          total: neg(inv.total),
          subtotal: neg(inv.subtotal),
          gst: neg(inv.gst),
          errorMessage: null,
        },
      }),
      ...inv.lineItems.map((l) =>
        db.invoiceLineItem.update({
          where: { id: l.id },
          data: {
            lineTotal: neg(l.lineTotal),
            quantity: neg(l.quantity),
            // A credit must never drive a price alert or an ingredient
            // price update; clear any flag set when it was ingested as an
            // ordinary invoice.
            priceChanged: false,
            unitChanged: false,
            normalisedUnitPrice: null,
          },
        })
      ),
    ])
  }

  // --- the missed duplicate -------------------------------------------
  const d = TO_MARK_DUPLICATE
  const dup = await db.invoice.findUnique({
    where: { id: d.id },
    select: { invoiceNumber: true, supplierName: true, total: true, status: true },
  })
  console.log()
  if (!dup) {
    console.log(`!! ${d.num} (${d.id}) NOT FOUND`)
  } else if (dup.invoiceNumber !== d.num || Math.abs(Number(dup.total) - d.expect) > 0.005) {
    console.log(`!! ${d.id}: expected ${d.num}/$${d.expect}, found ${dup.invoiceNumber}/$${dup.total} — SKIPPING`)
  } else if (dup.status === "DUPLICATE") {
    console.log(`   ${d.num}: already DUPLICATE, nothing to do`)
  } else {
    deltaTotal += Number(dup.total)
    console.log(`   ${d.num.padEnd(14)} ${d.supplier}  ${dup.status} -> DUPLICATE  ($${dup.total} removed from spend)`)
    if (APPLY) {
      await db.invoice.update({
        where: { id: d.id },
        data: {
          status: "DUPLICATE",
          errorMessage: `Duplicate of invoice ${d.duplicateOf} (CN306). Same Pixel Bakehouse credit note received twice; this copy was wrongly attributed to Cheese Time so the supplier-scoped dedupe missed it.`,
        },
      })
    }
  }

  console.log(`\n  total spend reduction across all venues/weeks: $${deltaTotal.toFixed(2)}`)
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
