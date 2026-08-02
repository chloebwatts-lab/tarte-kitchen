/**
 * New dish: "Croissant - Twice Baked Pistachio" (8 Jun 2026).
 *
 * A pistachio twin of the Almond Croissant: same build minus the flaked
 * almonds, with the new Pistachio Cream / Frangipane in place of Almond Cream
 * Pastry, and the Pistachio Cookie's garnish (15 g IRCA pistachio cream + 8 g
 * pistachio nuts) on top. Almond croissant is left untouched.
 *
 * Components (mirrors Croissant - Almond):
 *   130 g  Pistachio Cream / Frangipane   (was 130 g Almond Cream Pastry)
 *   1 ea   Croissant
 *   20 ml  Sugar Syrup
 *   5 g    Icing sugar
 *   15 g   IRCA Chococream Pistachio 15%   (garnish — "pistachio cream")
 *   8 g    Pistachio Nuts - Kernels no shell (garnish)
 *   (no Almonds blanched — "ditch the almond flakes on top")
 *
 * Sell $12.90 inc GST. Idempotent.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/add-pistachio-croissant.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, serve: 1, oz: 28.3495, lb: 453.592 }
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

const DISH_NAME = "Croissant - Twice Baked Pistachio"
const SELLING_PRICE = 12.9

function ingLineCost(ing: any, quantity: number, unit: string): Decimal {
  const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
  const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
  const u = unit.toLowerCase()
  if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero()) {
    return new Decimal(quantity).mul(UNIT_MULT[u] ?? 1).div(new Decimal(String(ing.gramsPerUnit))).mul(cpbu)
  }
  return new Decimal(quantity).mul(UNIT_MULT[u] ?? 1).mul(cpbu)
}
function prepLineCost(sub: any, quantity: number, unit: string): Decimal {
  const q = new Decimal(quantity), u = unit.toLowerCase(), yu = sub.yieldUnit.toLowerCase()
  if (COUNT_UNITS.has(u) && (yu === "serve" || yu === "ea")) {
    const baseY = new Decimal(String(sub.yieldQuantity)).mul(UNIT_MULT[yu] ?? 1)
    return baseY.gt(0) ? q.mul(UNIT_MULT[u] ?? 1).div(baseY).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
  }
  const yg = new Decimal(String(sub.yieldWeightGrams))
  return yg.gt(0) ? q.mul(UNIT_MULT[u] ?? 1).div(yg).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const getPrep = async (name: string) => {
    const p = await db.preparation.findUnique({ where: { name } })
    if (!p) throw new Error(`Preparation not found: "${name}"`)
    return p
  }
  const getIng = async (name: string) => {
    const i = await db.ingredient.findFirst({ where: { name } })
    if (!i) throw new Error(`Ingredient not found: "${name}"`)
    return i
  }

  const frangipane = await getPrep("Pistachio Cream / Frangipane")
  const sugarSyrup = await getPrep("Sugar Syrup")
  const croissant = await getIng("Croissant")
  const icingSugar = await getIng("Icing sugar")
  const pistCream = await getIng("IRCA Chococream Pistachio 15%")
  const pistNuts = await getIng("Pistachio Nuts - Kernels no shell")

  let dish = await db.dish.findFirst({ where: { name: DISH_NAME, venue: "BOTH" } })
  if (dish) {
    console.log(`  • dish "${DISH_NAME}" already exists (${dish.id}) — skipping create`)
  } else {
    dish = await db.dish.create({
      data: {
        name: DISH_NAME, menuCategory: "PASTRY", venue: "BOTH",
        sellingPrice: SELLING_PRICE,
        sellingPriceExGst: new Decimal(SELLING_PRICE).div(1.1).toDecimalPlaces(4).toNumber(),
        isActive: true,
        notes: "Twice-baked croissant filled with pistachio frangipane, soaked in syrup, finished with pistachio cream + chopped pistachios and an icing-sugar dust. Pistachio twin of the almond croissant (no flaked almonds).",
        components: {
          create: [
            { preparationId: frangipane.id, quantity: 130, unit: "g", sortOrder: 1 },
            { ingredientId: croissant.id, quantity: 1, unit: "ea", sortOrder: 2 },
            { preparationId: sugarSyrup.id, quantity: 20, unit: "ml", sortOrder: 3 },
            { ingredientId: icingSugar.id, quantity: 5, unit: "g", sortOrder: 4 },
            { ingredientId: pistCream.id, quantity: 15, unit: "g", sortOrder: 5 },
            { ingredientId: pistNuts.id, quantity: 8, unit: "g", sortOrder: 6 },
          ],
        },
      },
    })
    console.log(`  ✅ created dish "${DISH_NAME}" (${dish.id}) @ $${SELLING_PRICE}`)
  }

  // Recalc
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } })
  const prepMap = new Map(freshPreps.map((p) => [p.id, p]))
  const full = await db.dish.findFirst({ where: { id: dish.id }, include: { components: { include: { ingredient: true } } } })
  let total = new Decimal(0)
  for (const c of full!.components) {
    let lc = new Decimal(0)
    if (c.ingredient) lc = ingLineCost(c.ingredient, Number(c.quantity), c.unit)
    else if (c.preparationId) { const s = prepMap.get(c.preparationId); if (s) lc = prepLineCost(s, Number(c.quantity), c.unit) }
    lc = lc.toDecimalPlaces(4)
    total = total.plus(lc)
    await db.dishComponent.update({ where: { id: c.id }, data: { lineCost: Number(lc) } })
    const label = c.ingredient ? c.ingredient.name : `[prep ${c.preparationId}]`
    console.log(`     ${Number(c.quantity)} ${c.unit}  ${label}  $${lc.toFixed(4)}`)
  }
  const exGst = new Decimal(String(full!.sellingPrice)).div(1.1)
  const fc = exGst.gt(0) ? total.div(exGst).mul(100) : new Decimal(0)
  const gp = exGst.minus(total)
  await db.dish.update({
    where: { id: dish.id },
    data: { totalCost: Number(total.toDecimalPlaces(2)), foodCostPercentage: Number(fc.toDecimalPlaces(1)), grossProfit: Number(gp.toDecimalPlaces(2)) },
  })
  console.log(`\n  📊 ${DISH_NAME}: cost $${total.toFixed(2)}  sell $${SELLING_PRICE} (ex-GST $${exGst.toFixed(2)})  FC ${fc.toFixed(1)}%  GP $${gp.toFixed(2)}`)

  console.log("\n🎉 Done.")
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
