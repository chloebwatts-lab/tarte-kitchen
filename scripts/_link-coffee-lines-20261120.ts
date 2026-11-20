// One-off: link the existing unmatched invoice lines for the coffee card
// mappings (scripts/add-coffee-cost-cards.ts) now, the same way the nightly
// rematch-invoices route does, instead of waiting for tonight's run.
import { db } from "../src/lib/db"
import { matchLineItem } from "../src/lib/invoices/matcher"
import { evaluatePriceChange, effectiveUnitPrice } from "../src/lib/invoices/units"

const APPLY = process.argv.includes("--apply")
async function main() {
  const maps = await db.supplierItemMapping.findMany({
    where: { lastUsed: { gte: new Date("2026-11-20T00:00:00Z") }, ignored: false, ingredient: { OR: [{ name: { startsWith: "Coffee Beans" } }, { name: { startsWith: "Milk - " } }, { name: { startsWith: "Drinking Chocolate" } }, { name: { startsWith: "Hot Cup" } }] } },
    select: { supplierId: true, invoiceDescription: true },
  })
  const lines = await db.invoiceLineItem.findMany({
    where: { ingredientId: null, OR: maps.map((m) => ({ description: m.invoiceDescription, invoice: { supplierId: m.supplierId } })), invoice: { status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] } } },
    include: { invoice: { select: { supplierId: true } } },
  })
  const tally = new Map<string, { n: number; prices: Set<string>; nulls: number }>()
  for (const line of lines) {
    const match = await matchLineItem(line.description, line.invoice!.supplierId!)
    if (!match.matched) continue
    const ing = await db.ingredient.findUniqueOrThrow({ where: { id: match.ingredientId }, select: { name: true, purchasePrice: true, purchaseQuantity: true, purchaseUnit: true } })
    const mapping = match.mappingId ? await db.supplierItemMapping.findUnique({ where: { id: match.mappingId } }) : null
    const ev = line.unitPrice == null ? null : evaluatePriceChange(
      { purchaseUnit: ing.purchaseUnit, purchaseQuantity: Number(ing.purchaseQuantity), purchasePrice: Number(ing.purchasePrice) },
      { unit: line.unit, unitPrice: effectiveUnitPrice(Number(line.unitPrice), line.quantity != null ? Number(line.quantity) : null, line.lineTotal != null ? Number(line.lineTotal) : null), description: line.description },
      mapping?.conversionFactor ? Number(mapping.conversionFactor) : null,
      // Bidfood billed these cups as "pack" / "sleeve" in Apr-May 2026: the
      // same 50-cup sleeve as "SLV", so the mapping's 1/50 applies too.
      mapping?.invoiceUnit && /^(pack|sleeve)$/i.test(line.unit ?? "") ? line.unit : mapping?.invoiceUnit ?? null,
    )
    const t = tally.get(ing.name) ?? { n: 0, prices: new Set(), nulls: 0 }
    t.n++
    if (ev?.normalisedUnitPrice != null) t.prices.add(ev.normalisedUnitPrice.toFixed(4)); else t.nulls++
    tally.set(ing.name, t)
    if (APPLY) {
      await db.invoiceLineItem.update({
        where: { id: line.id },
        data: { ingredientId: match.ingredientId, mappingId: match.mappingId, priceChanged: ev?.priceChanged ?? false, unitChanged: ev?.unitChanged ?? false, currentPrice: ev?.currentPrice ?? null, normalisedUnitPrice: ev?.normalisedUnitPrice ?? null, suggestedConversionFactor: ev?.suggestedConversionFactor ?? null },
      })
    }
  }
  for (const [name, t] of tally) console.log(`${name.padEnd(40)} lines ${t.n}  per-unit prices ${[...t.prices].join(", ")}  unconverted ${t.nulls}`)
  console.log(APPLY ? "linked" : "dry run")
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
