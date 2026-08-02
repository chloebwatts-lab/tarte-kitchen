/**
 * Currumbin (BEACH_HOUSE) "reverse" version of the Tomato Soup:
 *   - cheese bagel toastie identical to Burleigh
 *   - soup side HALVED (1 ladle soup + 0.5 ladle stock + half pangrattato + half basil oil)
 *
 * Sits ALONGSIDE the existing "Tomato Soup Burrata" at Beach House (not touched).
 * Sell $22.90. Idempotent.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/add-currumbin-soup-bagel.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, serve: 1, bunch: 1, oz: 28.3495, lb: 453.592 }
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

const DISH = "Cheese Bagel & Tomato Soup"
const VENUE = "BEACH_HOUSE"   // = Currumbin
const PRICE = 22.9

function ingLineCost(ing: any, q: number, unit: string): Decimal {
  const wf = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
  const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wf)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
  const u = unit.toLowerCase()
  if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero())
    return new Decimal(q).mul(UNIT_MULT[u] ?? 1).div(new Decimal(String(ing.gramsPerUnit))).mul(cpbu)
  return new Decimal(q).mul(UNIT_MULT[u] ?? 1).mul(cpbu)
}
function prepLineCost(sub: any, q: number, unit: string): Decimal {
  const u = unit.toLowerCase(), yu = sub.yieldUnit.toLowerCase()
  if (COUNT_UNITS.has(u) && (yu === "serve" || yu === "ea")) {
    const baseY = new Decimal(String(sub.yieldQuantity)).mul(UNIT_MULT[yu] ?? 1)
    return baseY.gt(0) ? new Decimal(q).mul(UNIT_MULT[u] ?? 1).div(baseY).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
  }
  const yg = new Decimal(String(sub.yieldWeightGrams))
  return yg.gt(0) ? new Decimal(q).mul(UNIT_MULT[u] ?? 1).div(yg).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const getIng = async (n: string) => { const i = await db.ingredient.findFirst({ where: { name: n } }); if (!i) throw new Error(`ing ${n}`); return i }
  const getPrep = async (n: string) => { const p = await db.preparation.findUnique({ where: { name: n } }); if (!p) throw new Error(`prep ${n}`); return p }

  const soup = await getPrep("Tomato Soup")
  const pang = await getPrep("Pangrattato")

  let dish = await db.dish.findFirst({ where: { name: DISH, venue: VENUE as any } })
  if (dish) { console.log(`  • dish "${DISH}" @ ${VENUE} exists (${dish.id})`) }
  else {
    dish = await db.dish.create({
      data: {
        name: DISH, menuCategory: "LUNCH", venue: VENUE as any,
        sellingPrice: PRICE, sellingPriceExGst: new Decimal(PRICE).div(1.1).toDecimalPlaces(4).toNumber(),
        isActive: true,
        notes: "Currumbin reverse of the Burleigh Tomato Soup: cheese bagel toastie (provolone + tasty + butter) with a HALF cup of soup (1 ladle soup + 0.5 ladle stock + half pangrattato + half basil oil).",
        components: { create: [
          // half soup side
          { preparationId: soup.id, quantity: 177, unit: "g", sortOrder: 1 },
          { ingredientId: (await getIng("Vegetable Stock - Real Campbells")).id, quantity: 88.5, unit: "ml", sortOrder: 2 },
          { preparationId: pang.id, quantity: 25, unit: "g", sortOrder: 3 },
          { ingredientId: (await getIng("Basil Oil (house-made)")).id, quantity: 10, unit: "ml", sortOrder: 4 },
          // cheese bagel toastie (same as Burleigh)
          { ingredientId: (await getIng("Bagel (everything)")).id, quantity: 1, unit: "ea", sortOrder: 5 },
          { ingredientId: (await getIng("Cheese Provolone Dolce Sliced")).id, quantity: 20, unit: "g", sortOrder: 6 },
          { ingredientId: (await getIng("Cheese Tasty Shredded")).id, quantity: 100, unit: "g", sortOrder: 7 },
          { ingredientId: (await getIng("Salted butter")).id, quantity: 30, unit: "g", sortOrder: 8 },
        ] },
      },
    })
    console.log(`  ✅ dish "${DISH}" @ ${VENUE} (${dish.id}) $${PRICE}`)
  }

  // recalc
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } })
  const prepMap = new Map(freshPreps.map((p) => [p.id, p]))
  const full = await db.dish.findFirst({ where: { id: dish.id }, include: { components: { include: { ingredient: true, preparation: true } } } })
  let total = new Decimal(0)
  console.log(`\n  breakdown:`)
  for (const c of full!.components) {
    let lc = new Decimal(0)
    if (c.ingredient) lc = ingLineCost(c.ingredient, Number(c.quantity), c.unit)
    else if (c.preparationId) { const s = prepMap.get(c.preparationId); if (s) lc = prepLineCost(s, Number(c.quantity), c.unit) }
    lc = lc.toDecimalPlaces(4); total = total.plus(lc)
    await db.dishComponent.update({ where: { id: c.id }, data: { lineCost: Number(lc) } })
    console.log(`     ${Number(c.quantity)} ${c.unit}  ${c.ingredient?.name ?? c.preparation?.name}  $${lc.toFixed(4)}`)
  }
  const exGst = new Decimal(String(full!.sellingPrice)).div(1.1)
  const fc = exGst.gt(0) ? total.div(exGst).mul(100) : new Decimal(0)
  const gp = exGst.minus(total)
  await db.dish.update({ where: { id: dish.id }, data: { totalCost: Number(total.toDecimalPlaces(2)), foodCostPercentage: Number(fc.toDecimalPlaces(1)), grossProfit: Number(gp.toDecimalPlaces(2)) } })
  console.log(`\n  📊 ${DISH} [${VENUE}]: cost $${total.toFixed(2)}  sell $${PRICE} (ex-GST $${exGst.toFixed(2)})  FC ${fc.toFixed(1)}%  GP $${gp.toFixed(2)}`)
  console.log("\n🎉 Done.")
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
