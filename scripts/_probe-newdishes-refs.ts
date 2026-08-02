// READ-ONLY probe for building Hash Bagel + Spanish Baked Beans (2026-07-15).
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function dumpDish(name: string) {
  const dishes = await db.dish.findMany({
    where: { name },
    select: {
      id: true, name: true, venue: true, menuCategory: true, sellingPrice: true,
      totalCost: true, foodCostPercentage: true, isActive: true, notes: true,
      components: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true, quantity: true, unit: true, lineCost: true,
          ingredient: { select: { id: true, name: true } },
          preparation: { select: { id: true, name: true, costPerGram: true, yieldWeightGrams: true } },
        },
      },
    },
  })
  for (const d of dishes) {
    console.log(`\n### ${d.name} [${d.venue}] ${d.menuCategory} active=${d.isActive} sell=$${d.sellingPrice} cost=$${d.totalCost} fc=${d.foodCostPercentage}%`)
    for (const c of d.components) {
      const target = c.ingredient
        ? `ing ${c.ingredient.name} (${c.ingredient.id})`
        : `prep ${c.preparation!.name} (${c.preparation!.id}, $${c.preparation!.costPerGram}/g, batch ${c.preparation!.yieldWeightGrams}g)`
      console.log(`  ${c.sortOrder}. ${c.quantity} ${c.unit}  ${target}  $${c.lineCost}`)
    }
  }
}

async function findIngredients(term: string) {
  const rows = await db.ingredient.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true, allergens: true, purchaseQuantity: true, purchaseUnit: true, purchasePrice: true, baseUnitsPerPurchase: true, baseUnitType: true, supplier: { select: { name: true } } },
  })
  for (const r of rows) {
    console.log(`  [${term}] ${r.name} | ${r.purchaseQuantity}${r.purchaseUnit} @ $${r.purchasePrice} (${r.baseUnitsPerPurchase} base, ${r.baseUnitType}) | ${r.supplier?.name ?? "no supplier"} | {${r.allergens.join(",")}}`)
  }
  if (!rows.length) console.log(`  [${term}] — none`)
}

async function findInvoiceLines(term: string) {
  const rows = await db.invoiceLineItem.findMany({
    where: { description: { contains: term, mode: "insensitive" } },
    select: { description: true, unitPrice: true, quantity: true, invoice: { select: { invoiceDate: true, supplier: { select: { name: true } } } } },
    orderBy: { invoice: { invoiceDate: "desc" } },
    take: 5,
  })
  for (const r of rows) {
    console.log(`  [inv:${term}] ${r.description} | qty ${r.quantity} @ $${r.unitPrice} | ${r.invoice.supplier?.name} ${r.invoice.invoiceDate?.toISOString().slice(0, 10)}`)
  }
  if (!rows.length) console.log(`  [inv:${term}] — none`)
}

async function main() {
  await dumpDish("BEC Bagel")
  await dumpDish("Hash")
  await dumpDish("Miso Scramble")
  await dumpDish("Cheese Bagel & Tomato Soup")
  await dumpDish("Tomato Soup Burrata")

  console.log("\n--- ingredient lookups ---")
  for (const t of ["chorizo", "feta", "goat", "bean", "polpa", "crushed", "stock", "sherry", "kewpie", "chive", "parmesan", "sourdough", "capsicum", "cumin", "smoked paprika", "paprika sweet", "chilli flakes", "brown sugar", "parsley", "tomato paste", "honey - pure", "olive oil"]) {
    await findIngredients(t)
  }

  console.log("\n--- invoice price hunts ---")
  for (const t of ["chorizo", "feta", "bean", "meredith"]) {
    await findInvoiceLines(t)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
