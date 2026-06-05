/**
 * Backfill InvoiceLineItem.normalisedUnitPrice for rows created before the
 * new column existed.
 *
 * For each line where:
 *   - ingredientId is set
 *   - unit + unitPrice are set
 *   - normalisedUnitPrice is null
 * we re-run evaluatePriceChange against the current ingredient state and
 * write the normalised price (if the comparison produced one).
 *
 * Idempotent — rows with non-null normalisedUnitPrice are skipped on
 * subsequent runs. Safe to run while the app is up; updates are per-row
 * so no long-held locks.
 *
 * Usage on prod droplet:
 *   docker cp scripts/backfill-normalised-unit-price.ts tarte-kitchen-app-1:/tmp/
 *   docker exec -it tarte-kitchen-app-1 npx tsx /tmp/backfill-normalised-unit-price.ts
 */
import { db } from "../src/lib/db"
import { evaluatePriceChange } from "../src/lib/invoices/units"

async function main() {
  const totalToProcess = await db.invoiceLineItem.count({
    where: {
      ingredientId: { not: null },
      unit: { not: null },
      unitPrice: { not: null },
      normalisedUnitPrice: null,
    },
  })
  console.log(`Found ${totalToProcess} line items needing backfill`)

  const batchSize = 500
  let processed = 0
  let updated = 0
  let skipped = 0
  let cursor: string | undefined

  while (processed < totalToProcess) {
    const batch = await db.invoiceLineItem.findMany({
      where: {
        ingredientId: { not: null },
        unit: { not: null },
        unitPrice: { not: null },
        normalisedUnitPrice: null,
      },
      include: {
        ingredient: {
          select: { purchaseUnit: true, purchaseQuantity: true, purchasePrice: true },
        },
        mapping: { select: { conversionFactor: true } },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (batch.length === 0) break

    for (const line of batch) {
      processed++
      if (!line.ingredient) {
        skipped++
        continue
      }
      const evaluation = evaluatePriceChange(
        {
          purchaseUnit: line.ingredient.purchaseUnit,
          purchaseQuantity: Number(line.ingredient.purchaseQuantity),
          purchasePrice: Number(line.ingredient.purchasePrice),
        },
        {
          unit: line.unit,
          unitPrice: line.unitPrice ? Number(line.unitPrice) : null,
          description: line.description,
        },
        line.mapping?.conversionFactor ? Number(line.mapping.conversionFactor) : null
      )
      if (evaluation.normalisedUnitPrice == null) {
        skipped++
        continue
      }
      await db.invoiceLineItem.update({
        where: { id: line.id },
        data: { normalisedUnitPrice: evaluation.normalisedUnitPrice },
      })
      updated++
    }
    cursor = batch[batch.length - 1].id
    console.log(`  ...${processed}/${totalToProcess} processed (${updated} updated, ${skipped} skipped)`)
  }
  console.log(`Done. ${updated} rows updated, ${skipped} rows skipped (no usable conversion).`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
