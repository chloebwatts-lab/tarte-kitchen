/**
 * Re-run `evaluatePriceChange` over historical InvoiceLineItem rows so
 * legitimate alerts that the migration backfill blindly cleared (because
 * its SQL did a raw text compare on units, e.g. "piece" vs "ea") get
 * resurfaced.
 *
 * Scope:
 *   - Only rows with `priceApproved IS NULL` — never touches rows the
 *     user has already accepted/rejected.
 *   - Only invoices from the last 120 days — older alerts are stale.
 *   - Only matched rows (ingredientId set).
 *
 * Idempotent: re-running on the same DB produces the same end state.
 *
 * Usage:  npx tsx scripts/reevaluate-price-alerts.ts
 *         (run on the droplet against the live Postgres container)
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { evaluatePriceChange } from "../src/lib/invoices/units"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const SINCE = new Date()
SINCE.setDate(SINCE.getDate() - 120)

async function main() {
  const lines = await db.invoiceLineItem.findMany({
    where: {
      priceApproved: null,
      ingredientId: { not: null },
      invoice: {
        invoiceDate: { gte: SINCE },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] },
      },
    },
    include: {
      ingredient: {
        select: { purchasePrice: true, purchaseQuantity: true, purchaseUnit: true },
      },
      invoice: { select: { supplierId: true } },
    },
  })

  let flippedToPriceChanged = 0
  let flippedToUnitChanged = 0
  let unchanged = 0

  for (const li of lines) {
    if (!li.ingredient) continue

    let mappingConversion: number | null = null
    if (li.invoice.supplierId) {
      const mapping = await db.supplierItemMapping.findUnique({
        where: {
          supplierId_invoiceDescription: {
            supplierId: li.invoice.supplierId,
            invoiceDescription: li.description,
          },
        },
        select: { conversionFactor: true },
      })
      mappingConversion = mapping?.conversionFactor ? Number(mapping.conversionFactor) : null
    }

    const evaluation = evaluatePriceChange(
      {
        purchaseUnit: li.ingredient.purchaseUnit,
        purchaseQuantity: Number(li.ingredient.purchaseQuantity),
        purchasePrice: Number(li.ingredient.purchasePrice),
      },
      {
        unit: li.unit,
        unitPrice: li.unitPrice ? Number(li.unitPrice) : null,
        description: li.description,
      },
      mappingConversion
    )

    const needsUpdate =
      li.priceChanged !== evaluation.priceChanged ||
      li.unitChanged !== evaluation.unitChanged ||
      (li.suggestedConversionFactor ? Number(li.suggestedConversionFactor) : null) !==
        evaluation.suggestedConversionFactor

    if (!needsUpdate) {
      unchanged++
      continue
    }

    await db.invoiceLineItem.update({
      where: { id: li.id },
      data: {
        priceChanged: evaluation.priceChanged,
        unitChanged: evaluation.unitChanged,
        currentPrice: evaluation.currentPrice,
        suggestedConversionFactor: evaluation.suggestedConversionFactor,
      },
    })

    if (evaluation.priceChanged && !li.priceChanged) flippedToPriceChanged++
    if (evaluation.unitChanged && !li.unitChanged) flippedToUnitChanged++
  }

  console.log(`Scanned ${lines.length} rows from the last 120 days.`)
  console.log(`  → ${flippedToPriceChanged} resurfaced as real price changes`)
  console.log(`  → ${flippedToUnitChanged} resurfaced as pack/unit changes`)
  console.log(`  → ${unchanged} already correct`)

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
