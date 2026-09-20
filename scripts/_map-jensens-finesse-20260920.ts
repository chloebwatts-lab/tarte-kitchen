// Jensens "Gourmet - Finesse" was never mapped to its ingredient card, so the
// box price never reached the Charred Leek Salad.
//
// The card already exists: "Finesse (Gourmet Lettuce)", 1.5 kg box, 10% trim,
// created 17 Aug 2026 at the July price of $40.85, no supplier set.
// Invoices: list $40.85 less 10% = $36.76 paid to 18 Aug; since 20 Aug every
// box has been paid at $29.56 (printed as $29.56, then as list $32.85 less the
// 10% line discount Jensens applies, line total $29.56).
//
// This script (additive, idempotent, DRY RUN unless --apply):
//   1. maps Jensens "Gourmet - Finesse" to the card, 1 box = 1.5 kg
//      (conversionFactor = 1 / 1.5, the same convention confirmConversion uses)
//   2. sets the card's empty supplier to Jensens
//   3. moves the card price $40.85 to $29.56 (what is actually paid, line
//      total / qty, the same rule effectiveUnitPrice applies) with a
//      PriceHistory row
// The nightly rematch-invoices cron then links the existing invoice lines.
// Run scripts/recalculate-all.ts afterwards to cascade into the dish.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const APPLY = process.argv.includes("--apply")
const INGREDIENT_ID = "cmswr8s8m0001jkq0uolilomh"
const SUPPLIER_ID = "cmn8ccc1q000216qz6riuv60h" // Jensens
const DESCRIPTION = "Gourmet - Finesse"
const NEW_PRICE = 29.56

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const ing = await db.ingredient.findUnique({ where: { id: INGREDIENT_ID } })
  const sup = await db.supplier.findUnique({ where: { id: SUPPLIER_ID } })
  if (!ing || ing.name !== "Finesse (Gourmet Lettuce)") throw new Error("Finesse card not found")
  if (!sup || sup.name !== "Jensens") throw new Error("Jensens supplier not found")
  if (Number(ing.purchaseQuantity) !== 1.5 || ing.purchaseUnit !== "kg") throw new Error("card pack is not 1.5 kg, stopping")

  const latest = await db.invoiceLineItem.findFirst({
    where: { description: DESCRIPTION, unitPrice: { gt: 0 }, invoice: { supplierId: SUPPLIER_ID } },
    orderBy: { invoice: { invoiceDate: "desc" } },
    select: { unitPrice: true, unit: true, quantity: true, lineTotal: true, invoice: { select: { invoiceDate: true } } },
  })
  const paid = latest ? Number(latest.lineTotal) / Number(latest.quantity) : NaN
  console.log(`latest invoice line: list $${Number(latest?.unitPrice)}, paid $${paid.toFixed(2)} per ${latest?.unit} on ${latest?.invoice.invoiceDate?.toISOString().slice(0, 10)}`)
  if (!latest || Math.abs(paid - NEW_PRICE) > 0.005) throw new Error("latest paid price is not $29.56, stopping")

  const oldPrice = Number(ing.purchasePrice)
  console.log(`card before: $${oldPrice} per 1.5 kg, supplier ${ing.supplierId ?? "none"}`)
  console.log(`card after:  $${NEW_PRICE} per 1.5 kg, supplier Jensens, mapping "${DESCRIPTION}" box = 1.5 kg`)
  if (!APPLY) { console.log("DRY RUN, nothing written"); return }

  await db.supplierItemMapping.upsert({
    where: { supplierId_invoiceDescription: { supplierId: SUPPLIER_ID, invoiceDescription: DESCRIPTION } },
    update: { ingredientId: INGREDIENT_ID, invoiceUnit: "box", conversionFactor: 1 / 1.5, lastUsed: new Date() },
    create: { supplierId: SUPPLIER_ID, invoiceDescription: DESCRIPTION, ingredientId: INGREDIENT_ID, invoiceUnit: "box", conversionFactor: 1 / 1.5 },
  })
  if (oldPrice !== NEW_PRICE) {
    await db.priceHistory.create({
      data: { ingredientId: INGREDIENT_ID, oldPrice, newPrice: NEW_PRICE, oldUnit: ing.purchaseUnit, oldQuantity: Number(ing.purchaseQuantity) },
    })
  }
  await db.ingredient.update({
    where: { id: INGREDIENT_ID },
    data: {
      purchasePrice: NEW_PRICE,
      supplierId: ing.supplierId ?? SUPPLIER_ID,
      notes: "Jensens 'Gourmet - Finesse', 1.5 kg box. 2026-09-20: mapped to the invoice line and price moved $40.85 to $29.56 (paid per box since 20 Aug 2026: list $32.85 less Jensens' 10% line discount).",
    },
  })
  console.log("written: mapping + PriceHistory + card")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
