/**
 * Fix pastry dishes: the original import mapped Chef Notepad "Pastry" category
 * to menuCategory "OTHER". This script recategorises them to "PASTRY" and
 * optionally updates selling prices.
 *
 * It also creates any pastry dishes that are missing from the DB entirely.
 *
 * Usage:  npx tsx scripts/fix-pastry-dishes.ts
 *
 * Safe to re-run — upserts by name (case-insensitive).
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

// ── Known pastry dish names + prices ────────────────────────────────────────
// sellingPrice is inc GST (AUD).
// Add/update rows here. set sellingPrice to 0 if unknown (will keep existing).
// Venue: "BOTH" | "BURLEIGH" | "CURRUMBIN"
type PastryRow = {
  name: string
  sellingPrice: number   // inc GST; 0 = keep existing / skip price update
  venue?: "BOTH" | "BURLEIGH" | "CURRUMBIN"
}

const PASTRY_DISHES: PastryRow[] = [
  // ── Croissants / Viennoiserie ────────────────────────────────────────────
  { name: "Butter Croissant",                     sellingPrice: 6.50 },
  { name: "Almond Croissant",                     sellingPrice: 7.50 },
  { name: "Pain au Chocolat",                     sellingPrice: 7.00 },
  { name: "Ham and Cheese Croissant",             sellingPrice: 9.00 },
  { name: "Cinnamon Scroll",                      sellingPrice: 7.50 },
  { name: "Cheese and Vegemite Scroll",           sellingPrice: 7.00 },
  { name: "Cheese Scroll",                        sellingPrice: 7.00 },
  { name: "Raspberry Danish",                     sellingPrice: 7.50 },
  { name: "Custard Danish",                       sellingPrice: 7.50 },
  { name: "Apple Danish",                         sellingPrice: 7.50 },

  // ── Muffins ──────────────────────────────────────────────────────────────
  { name: "Blueberry Muffin",                     sellingPrice: 6.50 },
  { name: "Double Choc Muffin",                   sellingPrice: 6.50 },
  { name: "Banana Muffin",                        sellingPrice: 6.50 },
  { name: "Bran Muffin",                          sellingPrice: 6.50 },
  { name: "Raspberry and White Choc Muffin",      sellingPrice: 6.50 },

  // ── Tarts / Slices ───────────────────────────────────────────────────────
  { name: "Lemon Tart",                           sellingPrice: 8.50 },
  { name: "Lemon Curd Tart",                      sellingPrice: 8.50 },
  { name: "Portuguese Tart",                      sellingPrice: 5.50 },
  { name: "Caramel Tart",                         sellingPrice: 8.50 },
  { name: "Chocolate Tart",                       sellingPrice: 8.50 },
  { name: "Fruit Tart",                           sellingPrice: 8.50 },
  { name: "Lemon Slice",                          sellingPrice: 7.50 },
  { name: "Caramel Slice",                        sellingPrice: 7.50 },
  { name: "Hedgehog Slice",                       sellingPrice: 7.00 },
  { name: "Coconut Rough Slice",                  sellingPrice: 7.00 },
  { name: "Raspberry Slice",                      sellingPrice: 7.50 },

  // ── Brownies / Blondies ──────────────────────────────────────────────────
  { name: "Brownie",                              sellingPrice: 7.00 },
  { name: "Chocolate Brownie",                    sellingPrice: 7.00 },
  { name: "Blondie",                              sellingPrice: 7.00 },
  { name: "Peanut Butter Brownie",                sellingPrice: 7.50 },

  // ── Cakes ────────────────────────────────────────────────────────────────
  { name: "Banana Bread",                         sellingPrice: 6.50 },
  { name: "Banana Loaf",                          sellingPrice: 6.50 },
  { name: "Zucchini Loaf",                        sellingPrice: 6.50 },
  { name: "Carrot Cake",                          sellingPrice: 8.50 },
  { name: "Hummingbird Cake",                     sellingPrice: 8.50 },
  { name: "Orange and Almond Cake",               sellingPrice: 8.50 },

  // ── Cookies / Biscuits ───────────────────────────────────────────────────
  { name: "Anzac Biscuit",                        sellingPrice: 4.50 },
  { name: "Choc Chip Cookie",                     sellingPrice: 5.00 },
  { name: "Shortbread",                           sellingPrice: 4.50 },

  // ── Friands / Small Bites ────────────────────────────────────────────────
  { name: "Raspberry Friand",                     sellingPrice: 6.50 },
  { name: "Hazelnut Friand",                      sellingPrice: 6.50 },
  { name: "Lemon Friand",                         sellingPrice: 6.50 },
  { name: "Friand",                               sellingPrice: 6.50 },

  // ── Scones ───────────────────────────────────────────────────────────────
  { name: "Scone",                                sellingPrice: 6.00 },
  { name: "Scones with Jam and Cream",            sellingPrice: 9.00 },
  { name: "Date Scone",                           sellingPrice: 6.50 },

  // ── Doughnuts ────────────────────────────────────────────────────────────
  { name: "Doughnut",                             sellingPrice: 6.50 },
  { name: "Jam Doughnut",                         sellingPrice: 6.50 },
  { name: "Cinnamon Doughnut",                    sellingPrice: 6.50 },
]

// ── Name-matching strategy ────────────────────────────────────────────────────
// First try exact match; then case-insensitive; then skip creation (don't
// duplicate dishes that already exist under a slightly different name).

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  console.log("🥐  Fixing pastry dishes…\n")

  // 1. Recategorize any existing OTHER dishes that match pastry names
  const allOther = await db.dish.findMany({
    where: { menuCategory: "OTHER" },
    select: { id: true, name: true, sellingPrice: true },
  })

  let recategorized = 0
  let created = 0
  let priceUpdated = 0

  // Build a lookup of known pastry names (lower-case → row)
  const nameMap = new Map(PASTRY_DISHES.map((r) => [r.name.toLowerCase(), r]))

  // Pass 1: update existing OTHER dishes that match our list
  for (const dish of allOther) {
    const row = nameMap.get(dish.name.toLowerCase())
    if (!row) continue

    const updateData: Record<string, unknown> = { menuCategory: "PASTRY" }
    if (row.sellingPrice > 0) {
      const newPrice = new Decimal(row.sellingPrice)
      const exGst = newPrice.div(1.1).toDecimalPlaces(2)
      updateData.sellingPrice = row.sellingPrice
      updateData.sellingPriceExGst = Number(exGst)
    }

    await db.dish.update({ where: { id: dish.id }, data: updateData })
    console.log(`✅  Recategorised "${dish.name}" → PASTRY${row.sellingPrice > 0 ? `  $${row.sellingPrice}` : ""}`)
    recategorized++
    if (row.sellingPrice > 0 && Number(dish.sellingPrice) !== row.sellingPrice) priceUpdated++
  }

  // Pass 2: also recategorize PASTRY-sounding dishes already in OTHER
  // (catch names not in our explicit list — uses keyword heuristic)
  const pastryKeywords = [
    "croissant", "danish", "scroll", "muffin", "tart", "slice",
    "brownie", "blondie", "scone", "friand", "biscuit", "cookie",
    "shortbread", "loaf", "doughnut", "donut", "pastry", "brioche",
    "pain au", "canelé", "eclair", "choux", "macaron", "financier",
  ]

  const remainingOther = await db.dish.findMany({
    where: { menuCategory: "OTHER" },
    select: { id: true, name: true },
  })

  for (const dish of remainingOther) {
    const nameLower = dish.name.toLowerCase()
    if (pastryKeywords.some((kw) => nameLower.includes(kw))) {
      await db.dish.update({
        where: { id: dish.id },
        data: { menuCategory: "PASTRY" },
      })
      console.log(`✅  Auto-recategorised "${dish.name}" → PASTRY (keyword match)`)
      recategorized++
    }
  }

  // Pass 3: create any dishes from PASTRY_DISHES that don't exist yet
  for (const row of PASTRY_DISHES) {
    const existing = await db.dish.findFirst({
      where: { name: { equals: row.name, mode: "insensitive" } },
    })
    if (existing) continue

    if (row.sellingPrice <= 0) {
      console.log(`⚠️   Skipping create for "${row.name}" — no selling price set`)
      continue
    }

    const sellingPrice = new Decimal(row.sellingPrice)
    const sellingPriceExGst = sellingPrice.div(1.1).toDecimalPlaces(2)

    await db.dish.create({
      data: {
        name: row.name,
        menuCategory: "PASTRY",
        venue: row.venue ?? "BOTH",
        sellingPrice: row.sellingPrice,
        sellingPriceExGst: Number(sellingPriceExGst),
        totalCost: 0,
        foodCostPercentage: 0,
        grossProfit: Number(sellingPriceExGst),
      },
    })
    console.log(`➕  Created "${row.name}"  $${row.sellingPrice}`)
    created++
  }

  console.log(`\n📊  Done.`)
  console.log(`   Recategorised: ${recategorized}`)
  console.log(`   Created new:   ${created}`)
  console.log(`   Price updated: ${priceUpdated}`)
  console.log(`\n⚡️  Next: add components to each pastry dish in the app, then`)
  console.log(`   click "Recalculate All Costs".\n`)

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
