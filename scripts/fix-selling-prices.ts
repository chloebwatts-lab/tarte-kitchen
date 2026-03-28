/**
 * Update selling prices for existing dishes where the imported price was
 * wrong or missing.
 *
 * Also recalculates sellingPriceExGst, foodCostPercentage, and grossProfit
 * from the new price (existing totalCost is preserved).
 *
 * Usage:  npx tsx scripts/fix-selling-prices.ts
 *
 * Safe to re-run — only updates dishes where the name matches (case-insensitive)
 * and the price is different from what's already stored.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

// ── Correct prices (inc GST, AUD) ────────────────────────────────────────────
// Name matching is case-insensitive exact match.
// Add any further corrections here.
const PRICE_FIXES: Array<{ name: string; sellingPrice: number }> = [
  // Breakfast
  { name: "BLT",                          sellingPrice: 20.90 },
  { name: "Maple Bacon Bagel",            sellingPrice: 20.50 },
  { name: "Smashed Avo",                  sellingPrice: 21.00 },
  { name: "Smashed Avocado",              sellingPrice: 21.00 },
  { name: "Big Breakfast",                sellingPrice: 28.00 },
  { name: "Eggs Benedict",                sellingPrice: 24.00 },
  { name: "Eggs on Toast",                sellingPrice: 15.00 },
  { name: "Crumpets",                     sellingPrice: 17.00 },
  { name: "Tarte Breakfast",              sellingPrice: 28.00 },
  { name: "Breakfast Bowl",               sellingPrice: 22.00 },

  // Lunch
  { name: "Chicken Caesar Salad",         sellingPrice: 24.00 },
  { name: "Thai Beef Salad",              sellingPrice: 26.00 },
  { name: "Pumpkin Salad",                sellingPrice: 22.00 },
  { name: "Grilled Chicken",              sellingPrice: 26.00 },
  { name: "Wagyu Burger",                 sellingPrice: 28.00 },
  { name: "Chicken Burger",               sellingPrice: 26.00 },

  // Sides
  { name: "Chips",                        sellingPrice: 11.00 },
  { name: "Fries",                        sellingPrice: 11.00 },
  { name: "Side Salad",                   sellingPrice: 9.00 },
  { name: "Hash Brown",                   sellingPrice:  6.00 },
  { name: "Sourdough Toast",              sellingPrice:  6.00 },
  { name: "Gluten Free Toast",            sellingPrice:  7.00 },

  // Drinks
  { name: "Flat White",                   sellingPrice:  5.50 },
  { name: "Latte",                        sellingPrice:  5.50 },
  { name: "Cappuccino",                   sellingPrice:  5.50 },
  { name: "Long Black",                   sellingPrice:  4.80 },
  { name: "Espresso",                     sellingPrice:  4.00 },
  { name: "Chai Latte",                   sellingPrice:  6.00 },
  { name: "Matcha Latte",                 sellingPrice:  6.50 },
  { name: "Cold Brew",                    sellingPrice:  7.00 },
  { name: "Fresh OJ",                     sellingPrice:  7.50 },
  { name: "Smoothie",                     sellingPrice:  12.00 },
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  console.log("💰  Updating selling prices…\n")

  let updated = 0
  let unchanged = 0
  let notFound = 0

  for (const fix of PRICE_FIXES) {
    const dish = await db.dish.findFirst({
      where: { name: { equals: fix.name, mode: "insensitive" } },
    })

    if (!dish) {
      console.log(`⚠️   Not found: "${fix.name}"`)
      notFound++
      continue
    }

    const currentPrice = Number(dish.sellingPrice)
    if (currentPrice === fix.sellingPrice) {
      unchanged++
      continue
    }

    const sellingPrice = new Decimal(fix.sellingPrice)
    const sellingPriceExGst = sellingPrice.div(1.1).toDecimalPlaces(2)
    const totalCost = new Decimal(String(dish.totalCost))
    const fcPct = sellingPriceExGst.gt(0)
      ? totalCost.div(sellingPriceExGst).mul(100).toDecimalPlaces(1)
      : new Decimal(0)
    const grossProfit = sellingPriceExGst.minus(totalCost).toDecimalPlaces(2)

    await db.dish.update({
      where: { id: dish.id },
      data: {
        sellingPrice: fix.sellingPrice,
        sellingPriceExGst: Number(sellingPriceExGst),
        foodCostPercentage: Number(fcPct),
        grossProfit: Number(grossProfit),
      },
    })

    console.log(
      `✅  "${dish.name}"  $${currentPrice.toFixed(2)} → $${fix.sellingPrice.toFixed(2)}`
    )
    updated++
  }

  console.log(`\n📊  Done. Updated: ${updated} | Unchanged: ${unchanged} | Not found: ${notFound}\n`)

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
