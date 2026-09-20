// Plain flour card: bring it into line with the Fermex invoices.
//
// Card before: $17.82 per "bag", bag = 25,000 g  ($0.713 a kg), no price history.
// Invoices:    every plain flour bag ever invoiced is 12.5 KG (Fermex code
//              PLAIN12.5 "FLOUR PLAIN WHITE MANILDRA 12.5KG", also the Bidfood
//              "GEM OF THE 12.5kg" mapping). Fermex charged $17.75 a bag from
//              8 Jul to 5 Aug 2026 and $14.75 on all 12 invoices since 11 Aug.
// Card after:  $14.75 per bag, bag = 12,500 g  ($1.18 a kg).
//
// The price change alone would have halved the true cost per kg, so the pack
// size is corrected in the same step (a pack-size bug, not a recipe change).
// Writes a PriceHistory row first. DRY RUN BY DEFAULT, pass --apply to write,
// then run scripts/recalculate-all.ts to cascade into preps and dishes.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const APPLY = process.argv.includes("--apply")
const ID = "cmn8ccehw00ce16qzyq9c03w1"
const NEW_PRICE = 14.75
const NEW_BASE_UNITS = 12500

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const ing = await db.ingredient.findUnique({ where: { id: ID } })
  if (!ing || ing.name !== "Plain flour") throw new Error("Plain flour card not found")
  const oldPrice = Number(ing.purchasePrice)
  const oldBase = Number(ing.baseUnitsPerPurchase)
  console.log(`before: $${oldPrice} per ${Number(ing.purchaseQuantity)} ${ing.purchaseUnit}, ${oldBase} g = $${((oldPrice / oldBase) * 1000).toFixed(4)}/kg`)
  console.log(`after:  $${NEW_PRICE} per ${Number(ing.purchaseQuantity)} ${ing.purchaseUnit}, ${NEW_BASE_UNITS} g = $${((NEW_PRICE / NEW_BASE_UNITS) * 1000).toFixed(4)}/kg`)
  if (oldPrice === NEW_PRICE && oldBase === NEW_BASE_UNITS) { console.log("already applied"); return }
  if (oldPrice !== 17.82 || oldBase !== 25000) throw new Error("card is not in the expected before state, stopping")
  if (!APPLY) { console.log("DRY RUN, nothing written"); return }

  await db.$transaction([
    db.priceHistory.create({
      data: {
        ingredientId: ID,
        oldPrice,
        newPrice: NEW_PRICE,
        oldUnit: ing.purchaseUnit,
        oldQuantity: Number(ing.purchaseQuantity),
      },
    }),
    db.ingredient.update({
      where: { id: ID },
      data: {
        purchasePrice: NEW_PRICE,
        baseUnitsPerPurchase: NEW_BASE_UNITS,
        notes:
          "2026-09-20: price $17.82 to $14.75 and bag 25 kg to 12.5 kg, per Fermex invoices (PLAIN12.5 Manildra 12.5KG, $14.75 a bag since 11 Aug 2026). Before: $17.82 / 25,000 g.",
      },
    }),
  ])
  console.log("written: PriceHistory row + card updated")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
