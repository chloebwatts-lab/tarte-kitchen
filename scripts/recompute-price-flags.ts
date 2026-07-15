/**
 * Re-evaluate every PENDING v1 price flag (InvoiceLineItem.priceChanged /
 * unitChanged with priceApproved IS NULL) using the fixed units.ts math
 * (inverted pack-conversion fix, "1L x 6" parsing, kg↔g metric scaling,
 * ≥1% threshold), then supersede duplicates so at most the LATEST pending
 * alert per ingredient remains (older ones → priceApproved=false).
 *
 * Flag rewrites on InvoiceLineItem are pre-authorised (blanket clearance
 * 2026-06-13 for alert noise); invoice rows themselves are never touched.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recompute-price-flags.ts           # dry run
 *   npx tsx --env-file=.env.local scripts/recompute-price-flags.ts --apply   # write
 */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { evaluatePriceChange } from "../src/lib/invoices/units"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})
const APPLY = process.argv.includes("--apply")

async function main() {
  const pending = await db.invoiceLineItem.findMany({
    where: {
      priceApproved: null,
      OR: [{ priceChanged: true }, { unitChanged: true }],
      ingredientId: { not: null },
    },
    include: {
      ingredient: {
        select: { purchaseUnit: true, purchaseQuantity: true, purchasePrice: true },
      },
      invoice: { select: { invoiceDate: true } },
    },
  })

  // No relation field for mappingId on InvoiceLineItem — fetch separately.
  const mappingIds = [...new Set(pending.map((p) => p.mappingId).filter((v): v is string => !!v))]
  const mappings = await db.supplierItemMapping.findMany({
    where: { id: { in: mappingIds } },
    select: { id: true, conversionFactor: true },
  })
  const conversionByMapping = new Map(
    mappings.map((m) => [m.id, m.conversionFactor ? Number(m.conversionFactor) : null])
  )
  console.log(`${pending.length} pending flagged lines`)
  console.log(APPLY ? "APPLY mode — writing." : "DRY RUN — pass --apply to write.")

  let cleared = 0
  let stillChanged = 0
  let stillUnit = 0
  const keptByIngredient = new Map<string, { id: string; date: number }>()

  for (const li of pending) {
    if (!li.ingredient) continue
    const evaln = evaluatePriceChange(
      {
        purchaseUnit: li.ingredient.purchaseUnit,
        purchaseQuantity: Number(li.ingredient.purchaseQuantity),
        purchasePrice: Number(li.ingredient.purchasePrice),
      },
      {
        unit: li.unit,
        unitPrice: li.unitPrice === null ? null : Number(li.unitPrice),
        description: li.description,
      },
      (li.mappingId ? conversionByMapping.get(li.mappingId) : null) ?? null
    )

    if (APPLY) {
      await db.invoiceLineItem.update({
        where: { id: li.id },
        data: {
          priceChanged: evaln.priceChanged,
          unitChanged: evaln.unitChanged,
          currentPrice: evaln.currentPrice,
          normalisedUnitPrice: evaln.normalisedUnitPrice,
          suggestedConversionFactor: evaln.suggestedConversionFactor,
        },
      })
    }

    if (evaln.priceChanged) {
      stillChanged++
      const d = li.invoice?.invoiceDate?.getTime() ?? 0
      const prev = keptByIngredient.get(li.ingredientId!)
      if (!prev || d > prev.date) keptByIngredient.set(li.ingredientId!, { id: li.id, date: d })
    } else if (evaln.unitChanged) {
      stillUnit++
    } else {
      cleared++
    }
  }

  // Supersede: any still-pending priceChanged line that is NOT the latest
  // for its ingredient → priceApproved=false (drops out of every pending view).
  let superseded = 0
  if (APPLY) {
    const keepIds = new Set(Array.from(keptByIngredient.values()).map((k) => k.id))
    const stillPending = await db.invoiceLineItem.findMany({
      where: { priceApproved: null, priceChanged: true, ingredientId: { not: null } },
      select: { id: true },
    })
    const toSupersede = stillPending.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
    if (toSupersede.length > 0) {
      await db.invoiceLineItem.updateMany({
        where: { id: { in: toSupersede } },
        data: { priceApproved: false },
      })
    }
    superseded = toSupersede.length
  }

  console.log({
    reEvaluated: pending.length,
    clearedNoLongerFlagged: cleared,
    stillPriceChanged: stillChanged,
    stillUnitChanged: stillUnit,
    supersededOlderDuplicates: superseded,
    distinctIngredientsRemaining: keptByIngredient.size,
  })
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
