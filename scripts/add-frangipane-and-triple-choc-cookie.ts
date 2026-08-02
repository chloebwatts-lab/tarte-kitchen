/**
 * Food costing for two new recipe cards (8 Jun 2026):
 *
 *  1) "Pistachio Cream / Frangipane"  →  Preparation (MIX), standalone filling
 *     component. 1x batch = 8300 g.
 *
 *  2) "Dark Triple Chocolate Cookie"  →  batch Preparation (PASTRY, 60 ea /
 *     7500 g) + sellable Dish "Cookie - Dark Triple Chocolate" + a
 *     PastryProduct rotation entry (mirrors Choc Chip / Pistachio cookies).
 *
 * Ingredient choices mirror the existing "Choc Chip Cookie" / "Pistachio
 * Cookie" preps for consistency. White choc costed against Lindt Piccoli
 * (clean $35.96/kg) — the Veliche Belgian White record ($1.84/kg) looks like
 * a data error and is deliberately NOT used here.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/add-frangipane-and-triple-choc-cookie.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, oz: 28.3495, lb: 453.592, serve: 1,
}
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

const COOKIE_SELLING_PRICE = 8.5 // inc GST — premium tier, matches Pistachio Cookie

type Line = { ingredient: string; quantity: number; unit: string }

const FRANGIPANE: Line[] = [
  { ingredient: "Icing sugar", quantity: 2000, unit: "g" },
  { ingredient: "Unsalted butter", quantity: 2000, unit: "g" },
  { ingredient: "Pistachio Nuts - Kernels no shell", quantity: 2000, unit: "g" },
  { ingredient: "GC Eggs - Individual", quantity: 2000, unit: "g" }, // engine: 2000g / 60g = 33.3 eggs
  { ingredient: "Plain flour", quantity: 300, unit: "g" },
]

const COOKIE_BATCH: Line[] = [
  { ingredient: "Unsalted butter", quantity: 1134, unit: "g" },             // "Brown Butter (cooked)"
  { ingredient: "Brown sugar", quantity: 1026, unit: "g" },
  { ingredient: "Caster Sugar", quantity: 774, unit: "g" },                 // "Sugar"
  { ingredient: "Vanilla bean paste", quantity: 84, unit: "g" },           // "Vanilla"
  { ingredient: "GC Eggs - Individual", quantity: 10, unit: "ea" },        // "510 g (~10 ea)"
  { ingredient: "Plain flour", quantity: 1524, unit: "g" },
  { ingredient: "Cocoa powder, Veliche", quantity: 174, unit: "g" },       // "Cacao"
  { ingredient: "Bicarbonate", quantity: 25.8, unit: "g" },
  { ingredient: "Baking powder", quantity: 25.8, unit: "g" },
  { ingredient: "Table salt", quantity: 38.4, unit: "g" },
  { ingredient: "Chocolate Patissier Milk Choc 34.6%", quantity: 728, unit: "g" },
  { ingredient: "Chocolate Veliche Belgian Dark Choc Emotion", quantity: 728, unit: "g" },
  { ingredient: "Chocolate Lindt Piccoli White 2.5kg", quantity: 728, unit: "g" },
]

// Dish = 120 g scoop of the batch + the documented post-bake finish.
const COOKIE_DISH_TOPPING: Line[] = [
  { ingredient: "Chocolate Lindt Piccoli White 2.5kg", quantity: 10, unit: "g" }, // "extra chopped white chocolate"
  { ingredient: "Sea Salt Flakes natural", quantity: 0.5, unit: "g" },            // "sea salt flakes"
]

function ingLineCost(ing: any, quantity: number, unit: string): Decimal {
  const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
  const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
  const u = unit.toLowerCase()
  if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero()) {
    const baseInRecipe = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
    return baseInRecipe.div(new Decimal(String(ing.gramsPerUnit))).mul(cpbu)
  }
  return new Decimal(quantity).mul(UNIT_MULT[u] ?? 1).mul(cpbu)
}

function prepLineCost(sub: any, quantity: number, unit: string): Decimal {
  const q = new Decimal(quantity)
  const u = unit.toLowerCase()
  const yu = sub.yieldUnit.toLowerCase()
  if (COUNT_UNITS.has(u) && (yu === "serve" || yu === "ea")) {
    const baseQ = q.mul(UNIT_MULT[u] ?? 1)
    const baseY = new Decimal(String(sub.yieldQuantity)).mul(UNIT_MULT[yu] ?? 1)
    return baseY.gt(0) ? baseQ.div(baseY).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
  }
  const baseQty = q.mul(UNIT_MULT[u] ?? 1)
  const yieldGrams = new Decimal(String(sub.yieldWeightGrams))
  return yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  // ── resolve every ingredient by exact name up-front; fail loudly ──────────
  const names = [...new Set([...FRANGIPANE, ...COOKIE_BATCH, ...COOKIE_DISH_TOPPING].map((l) => l.ingredient))]
  const ingMap = new Map<string, any>()
  for (const n of names) {
    const ing = await db.ingredient.findFirst({ where: { name: n } })
    if (!ing) throw new Error(`Ingredient not found by exact name: "${n}"`)
    ingMap.set(n, ing)
  }
  console.log(`✓ resolved ${ingMap.size} ingredients`)

  async function createPrep(opts: {
    name: string; category: any; yieldQuantity: number; yieldUnit: string;
    yieldWeightGrams: number; method: string; lines: Line[];
  }) {
    const existing = await db.preparation.findUnique({ where: { name: opts.name } })
    if (existing) {
      console.log(`  • prep "${opts.name}" already exists (${existing.id}) — skipping create`)
      return existing.id
    }
    const prep = await db.preparation.create({
      data: {
        name: opts.name, category: opts.category, method: opts.method,
        yieldQuantity: opts.yieldQuantity, yieldUnit: opts.yieldUnit,
        yieldWeightGrams: opts.yieldWeightGrams,
        items: {
          create: opts.lines.map((l, i) => ({
            ingredientId: ingMap.get(l.ingredient)!.id,
            quantity: l.quantity, unit: l.unit, sortOrder: i,
          })),
        },
      },
    })
    console.log(`  ✅ created prep "${opts.name}" (${prep.id})`)
    return prep.id
  }

  // ── 1. Pistachio Cream / Frangipane ───────────────────────────────────────
  await createPrep({
    name: "Pistachio Cream / Frangipane",
    category: "MIX",
    yieldQuantity: 8300, yieldUnit: "g", yieldWeightGrams: 8300,
    method: [
      "1. Process pistachios, keeping small pieces throughout the mix.",
      "2. Beat soft butter and icing sugar until light and fluffy.",
      "3. Gradually add eggs and mix until fully combined.",
      "4. Add pistachios and plain flour.",
      "5. Mix very well until smooth and evenly combined.",
    ].join("\n"),
    lines: FRANGIPANE,
  })

  // ── 2. Dark Triple Chocolate Cookie batch ─────────────────────────────────
  const cookiePrepId = await createPrep({
    name: "Dark Triple Chocolate Cookie",
    category: "PASTRY",
    yieldQuantity: 60, yieldUnit: "ea", yieldWeightGrams: 7500,
    method: [
      "1. Use paddle to mix brown butter and sugars well, then add eggs and vanilla.",
      "2. Mix all dry ingredients and chocolates together. Mix only until combined.",
      "3. Scoop 120 g each and shape into cylinders.",
      "4. After baking, top with extra chopped white chocolate and sea salt flakes.",
    ].join("\n"),
    lines: COOKIE_BATCH,
  })

  // ── 3. Dish: Cookie - Dark Triple Chocolate ───────────────────────────────
  const dishName = "Cookie - Dark Triple Chocolate"
  let dish = await db.dish.findFirst({ where: { name: dishName, venue: "BOTH" } })
  if (!dish) {
    dish = await db.dish.create({
      data: {
        name: dishName, menuCategory: "PASTRY", venue: "BOTH",
        sellingPrice: COOKIE_SELLING_PRICE,
        sellingPriceExGst: new Decimal(COOKIE_SELLING_PRICE).div(1.1).toDecimalPlaces(4).toNumber(),
        isActive: true,
        notes: "120 g scoop of Dark Triple Chocolate Cookie batch, finished with chopped white choc + sea salt flakes.",
        components: {
          create: [
            { preparationId: cookiePrepId, quantity: 120, unit: "g", sortOrder: 0 },
            ...COOKIE_DISH_TOPPING.map((l, i) => ({
              ingredientId: ingMap.get(l.ingredient)!.id, quantity: l.quantity, unit: l.unit, sortOrder: i + 1,
            })),
          ],
        },
      },
    })
    console.log(`  ✅ created dish "${dishName}" (${dish.id}) @ $${COOKIE_SELLING_PRICE}`)
  } else {
    console.log(`  • dish "${dishName}" already exists (${dish.id}) — skipping create`)
  }

  // ── 4. PastryProduct rotation entry (mirrors other cookies) ───────────────
  const ppName = "Dark triple chocolate cookie"
  const ppExisting = await db.pastryProduct.findFirst({ where: { name: ppName, venue: "BOTH" } })
  if (!ppExisting) {
    const maxSort = await db.pastryProduct.aggregate({ _max: { sortOrder: true } })
    const pp = await db.pastryProduct.create({
      data: { name: ppName, venue: "BOTH", isActive: true, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
    })
    console.log(`  ✅ created PastryProduct "${ppName}" (${pp.id})`)
  } else {
    console.log(`  • PastryProduct "${ppName}" already exists — skipping`)
  }

  // ── 5. Recalc the two new preps, then the dish ────────────────────────────
  const preps = await db.preparation.findMany({
    where: { name: { in: ["Pistachio Cream / Frangipane", "Dark Triple Chocolate Cookie"] } },
    include: { items: { include: { ingredient: true, subPreparation: true } } },
  })
  for (const prep of preps) {
    let batchCost = new Decimal(0)
    for (const item of prep.items) {
      let lineCost = new Decimal(0)
      if (item.ingredient) lineCost = ingLineCost(item.ingredient, Number(item.quantity), item.unit)
      else if (item.subPreparation) lineCost = prepLineCost(item.subPreparation, Number(item.quantity), item.unit)
      lineCost = lineCost.toDecimalPlaces(4)
      batchCost = batchCost.plus(lineCost)
      await db.preparationItem.update({ where: { id: item.id }, data: { lineCost: Number(lineCost) } })
    }
    const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
    const yieldQty = new Decimal(String(prep.yieldQuantity))
    await db.preparation.update({
      where: { id: prep.id },
      data: {
        batchCost: Number(batchCost.toDecimalPlaces(2)),
        costPerGram: Number((yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)).toDecimalPlaces(4)),
        costPerServe: Number((yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)).toDecimalPlaces(2)),
      },
    })
    console.log(`  📊 ${prep.name}: batch $${batchCost.toFixed(2)} (${prep.yieldQuantity}${prep.yieldUnit}, $${batchCost.div(yieldQty).toFixed(2)}/unit)`)
  }

  // Dish recalc (fresh prep costs)
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } })
  const prepMap = new Map(freshPreps.map((p) => [p.id, p]))
  const dishFull = await db.dish.findFirst({
    where: { name: dishName, venue: "BOTH" },
    include: { components: { include: { ingredient: true, preparation: true } } },
  })
  if (dishFull) {
    let totalCost = new Decimal(0)
    for (const c of dishFull.components) {
      let lineCost = new Decimal(0)
      if (c.ingredient) lineCost = ingLineCost(c.ingredient, Number(c.quantity), c.unit)
      else if (c.preparationId) {
        const sub = prepMap.get(c.preparationId)
        if (sub) lineCost = prepLineCost(sub, Number(c.quantity), c.unit)
      }
      lineCost = lineCost.toDecimalPlaces(4)
      totalCost = totalCost.plus(lineCost)
      await db.dishComponent.update({ where: { id: c.id }, data: { lineCost: Number(lineCost) } })
    }
    const exGst = new Decimal(String(dishFull.sellingPrice)).div(1.1)
    const fc = exGst.gt(0) ? totalCost.div(exGst).mul(100) : new Decimal(0)
    const gp = exGst.minus(totalCost)
    await db.dish.update({
      where: { id: dishFull.id },
      data: {
        totalCost: Number(totalCost.toDecimalPlaces(2)),
        foodCostPercentage: Number(fc.toDecimalPlaces(1)),
        grossProfit: Number(gp.toDecimalPlaces(2)),
      },
    })
    console.log(`  📊 ${dishName}: cost $${totalCost.toFixed(2)}  sell $${dishFull.sellingPrice} (ex-GST $${exGst.toFixed(2)})  FC ${fc.toFixed(1)}%  GP $${gp.toFixed(2)}`)
  }

  console.log("\n🎉 Done.")
  await db.$disconnect()
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
