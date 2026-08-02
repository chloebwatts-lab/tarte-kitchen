/**
 * Repair for the Fresho order-confirmation mess (audit 2026-07-23):
 *
 *  1. Every stored Coastal Fresh / Marrow Meats PDF whose text contains
 *     "THIS IS NOT AN INVOICE" / "INDICATIVE TOTAL" (per
 *     pdf_classification.json from scan_confirmations.py) →
 *     status ORDER_CONFIRMATION.
 *  2. Three April Marrow Meats confirmations that predate PDF storage
 *     (identified by nominal integer order quantities + received-day-before
 *     pattern, paired with a real actual-weight invoice) → same.
 *  3. Real tax invoices that the content-dedupe wrongly marked DUPLICATE of
 *     their own confirmation → reprocessed from extractedData via the (now
 *     idempotent) processInvoice, restoring line items, venue and status.
 *  4. EasyVend payment receipt ("Delivery Order: #6790 ..." + surcharge) →
 *     STATEMENT; Son Of A Bunn "Sale; Tarte Pty Ltd" remittance row →
 *     DUPLICATE of the real invoice it repeats.
 *
 * Usage: npx tsx --env-file=.env.local scripts/_fix-fresho-order-confirmations.ts <pdf_classification.json> [--apply]
 * Without --apply it only prints what it would do.
 */
import { readFileSync } from "fs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { processInvoice } from "../src/lib/invoices/processor"
import type { ParsedInvoice } from "../src/lib/invoices/parser"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

const APPLY = process.argv.includes("--apply")
const NOTE =
  "Fresho pre-delivery order confirmation (THIS IS NOT AN INVOICE) — reclassified by 2026-07-23 ingestion audit"

// April rows without stored PDFs: confirmation identified by nominal
// integer quantities vs the paired invoice's actual catch-weights.
const MANUAL_CONFIRMATION_IDS = [
  "cmnmwy8hh000001s2xgpfvvyc", // Marrow F52129599 $349 (pair kept: cmnobsahc001401pb8ywlpzr3 $370.69)
  "cmnobqorf000p01pby0s2roft", // Marrow F52166632 $101.50 (pair kept: cmnqh8uim005501mrctccszfl $613.32)
  "cmnxmdikg00k601mrzbg1ss8j", // Marrow F52395230 $225 (pair kept: cmnz1xgue00pl01mrt38i8e3t $378.34)
]

const EASYVEND_RECEIPT_ID = "cmnw6zqso00ij01mrdglqgw86" // "Delivery Order: #6790..." + payment surcharge
const SOB_REMITTANCE_ID = "cmnrwmuh6007h01mrk1ev0u8k" // "Sale; Tarte Pty Ltd" $995.72
const SOB_REAL_INVOICE_ID = "cmnqh6h83004l01mrx4v7cv61" // SOB 00238779 $995.72

async function main() {
  const classification: Record<string, { orderConfirmation: boolean }> = JSON.parse(
    readFileSync(process.argv[2], "utf8")
  )
  const confKeys = Object.keys(classification).filter(
    (k) => classification[k].orderConfirmation
  )

  // --- 1+2: reclassify confirmations -------------------------------------
  const confRows = await db.invoice.findMany({
    where: {
      OR: [
        { gmailMessageId: { in: confKeys } },
        { id: { in: MANUAL_CONFIRMATION_IDS } },
      ],
      status: { not: "ORDER_CONFIRMATION" },
    },
    select: { id: true, supplierName: true, invoiceNumber: true, total: true, status: true },
  })
  console.log(`[1] confirmations to reclassify: ${confRows.length}`)
  for (const r of confRows) {
    console.log(
      `    ${r.id} ${r.supplierName} ${r.invoiceNumber} $${r.total} (${r.status}) -> ORDER_CONFIRMATION`
    )
  }
  if (APPLY) {
    const res = await db.invoice.updateMany({
      where: { id: { in: confRows.map((r) => r.id) } },
      data: { status: "ORDER_CONFIRMATION", errorMessage: NOTE },
    })
    console.log(`    applied: ${res.count}`)
  }

  // --- 3: reactivate real invoices duped against a confirmation ----------
  const confIds = new Set(
    (
      await db.invoice.findMany({
        where: {
          OR: [
            { gmailMessageId: { in: confKeys } },
            { id: { in: MANUAL_CONFIRMATION_IDS } },
          ],
        },
        select: { id: true },
      })
    ).map((r) => r.id)
  )

  const dupRows = await db.invoice.findMany({
    where: {
      supplierName: { in: ["Coastal Fresh", "Marrow Meats"] },
      status: "DUPLICATE",
      errorMessage: { startsWith: "Duplicate of invoice " },
    },
    select: {
      id: true,
      gmailMessageId: true,
      supplierId: true,
      supplierName: true,
      invoiceNumber: true,
      total: true,
      errorMessage: true,
      extractedData: true,
    },
  })

  const toReactivate = dupRows.filter((d) => {
    // Only rows whose "kept" counterpart is a confirmation, and which are
    // NOT themselves confirmations.
    const keptId = d.errorMessage!.match(/Duplicate of invoice (\S+)/)?.[1]
    const selfIsConf =
      classification[d.gmailMessageId]?.orderConfirmation === true ||
      MANUAL_CONFIRMATION_IDS.includes(d.id)
    return !!keptId && confIds.has(keptId) && !selfIsConf
  })
  console.log(`\n[3] real invoices to reactivate (reprocess): ${toReactivate.length}`)
  let reactivated = 0
  let reactErrors = 0
  for (const d of toReactivate) {
    const parsed = d.extractedData as unknown as ParsedInvoice | null
    if (!parsed || !Array.isArray(parsed.lineItems) || !d.supplierId) {
      console.log(`    SKIP ${d.id} ${d.invoiceNumber} — no usable extractedData`)
      continue
    }
    console.log(
      `    ${d.id} ${d.supplierName} ${d.invoiceNumber} $${d.total} (${parsed.lineItems.length} lines)`
    )
    if (APPLY) {
      try {
        const res = await processInvoice(d.id, d.supplierId, parsed)
        reactivated++
        console.log(`      -> ${res.status}, ${res.totalItems} lines, ${res.matchedItems} matched`)
      } catch (e) {
        reactErrors++
        console.log(`      -> FAILED: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  if (APPLY) console.log(`    reactivated: ${reactivated}, failures: ${reactErrors}`)

  // --- 4: receipt / remittance one-offs -----------------------------------
  console.log(`\n[4] EasyVend receipt -> STATEMENT, SOB remittance -> DUPLICATE`)
  if (APPLY) {
    await db.invoice.update({
      where: { id: EASYVEND_RECEIPT_ID },
      data: {
        status: "STATEMENT",
        errorMessage:
          "Payment receipt covering delivery orders #6790/#7129/#7444/#7447 (incl. card surcharge), not a delivery invoice — reclassified by 2026-07-23 ingestion audit",
      },
    })
    await db.invoice.update({
      where: { id: SOB_REMITTANCE_ID },
      data: {
        status: "DUPLICATE",
        errorMessage: `Duplicate of invoice ${SOB_REAL_INVOICE_ID} (00238779) — remittance/receipt row, reclassified by 2026-07-23 ingestion audit`,
      },
    })
    console.log("    applied")
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
