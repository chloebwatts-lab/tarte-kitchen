/**
 * Food costing — Tomato Soup + Pangrattato (9 Jun 2026).
 *
 * Creates:
 *   Ingredients (new):
 *     - Liquid Smoke (Wrights)            Bidfood   $12.74 / 103 ml   (invoice 7 Jun)
 *     - Basil Oil (house-made)            house     $13.50 / L        (EVOO $12.32/L + basil increment)
 *     - Cheese Provolone Dolce Sliced     Son Of A Bunn $34.25 / kg   (Burleigh's actual buy, invoice 11 Jun)
 *     - Bread - Dried (repurposed)        house     $0 / kg          (oven-dried day-old bread — waste reclaim)
 *   Preparations (new):
 *     - Tomato Soup Seasoning (Pre-Mix)   440 g
 *     - Pangrattato                       ~1000 g
 *     - Tomato Soup                       batch -> SOUP_SERVES serves
 *   Dish (new):
 *     - Tomato Soup  (soup + bought-in stock ladle + pangrattato + basil oil + bagel cheese toastie)
 *
 * ── ASSUMPTIONS (flagged to chef, easy to change) ─────────────────────────
 *   SOUP_SERVES        : batch yields 35 bowls (each bowl = 2 x 6 oz ladles soup prep = 354 ml)
 *   OZ_ML              : 6 oz = 6 fl oz = 177.44 ml
 *   PROVOLONE_SLICE_G  : one slice = 20 g
 *   Pangrattato bread  : costed at $0 (repurposed waste bread)
 *   Toastie            : BUNDLED into the Tomato Soup dish (soup served with toastie, one item)
 *   SELLING_PRICE      : $19.90 proposed (confirm)
 *
 * Idempotent. Usage: DATABASE_URL=... npx tsx scripts/add-tomato-soup-and-pangrattato.ts
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

// ── assumptions ───────────────────────────────────────────────────────────
const SOUP_SERVES = 35
const OZ_ML = 177.44
const SOUP_PER_SERVE_ML = 2 * OZ_ML          // 2 ladles of 6 oz
const STOCK_PER_SERVE_ML = 1 * OZ_ML         // 1 ladle bought-in stock
const SOUP_YIELD_G = Math.round(SOUP_SERVES * SOUP_PER_SERVE_ML)  // finished soup weight (g≈ml)
const PROVOLONE_SLICE_G = 20
const SELLING_PRICE = 19.9

function ingLineCost(ing: any, quantity: number, unit: string): Decimal {
  const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
  const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
  const u = unit.toLowerCase()
  if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero())
    return new Decimal(quantity).mul(UNIT_MULT[u] ?? 1).div(new Decimal(String(ing.gramsPerUnit))).mul(cpbu)
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

type Line = { ingredient?: string; subPrep?: string; quantity: number; unit: string }

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const supplier = async (name: string) => (await db.supplier.findFirst({ where: { name } }))

  // ── new ingredients (idempotent ensure) ──────────────────────────────────
  async function ensureIng(name: string, data: any) {
    let ing = await db.ingredient.findFirst({ where: { name } })
    if (ing) { console.log(`  • ingredient "${name}" exists (${ing.id})`); return ing }
    ing = await db.ingredient.create({ data: { name, ...data } })
    console.log(`  ✅ ingredient "${name}" (${ing.id})`)
    return ing
  }
  const bidfood = await supplier("Bidfood")
  const sonOfABunn = await supplier("Son Of A Bunn")

  await ensureIng("Liquid Smoke (Wrights)", {
    category: "CONDIMENT", baseUnitType: "VOLUME", supplierId: bidfood?.id ?? null,
    purchaseQuantity: 103, purchaseUnit: "ml", purchasePrice: 12.74, baseUnitsPerPurchase: 103,
    wastePercentage: 0, notes: "Wrights Liquid Smoke 103ml — Bidfood $12.74/btl (invoice 7 Jun 2026)",
  })
  await ensureIng("Basil Oil (house-made)", {
    category: "OIL", baseUnitType: "VOLUME", supplierId: null,
    purchaseQuantity: 1, purchaseUnit: "L", purchasePrice: 13.5, baseUnitsPerPurchase: 1000,
    wastePercentage: 0, notes: "House-made basil oil. Costed off EVOO ($12.32/L) + small basil increment = $13.50/L.",
  })
  await ensureIng("Cheese Provolone Dolce Sliced", {
    category: "CHEESE", baseUnitType: "WEIGHT", supplierId: sonOfABunn?.id ?? null,
    purchaseQuantity: 1, purchaseUnit: "kg", purchasePrice: 34.25, baseUnitsPerPurchase: 1000,
    wastePercentage: 0, notes: "Son Of A Bunn — Burleigh's regular sliced cheese, $34.25/kg (invoice 11 Jun 2026)",
  })
  await ensureIng("Bread - Dried (repurposed)", {
    category: "BREAD", baseUnitType: "WEIGHT", supplierId: null,
    purchaseQuantity: 1, purchaseUnit: "kg", purchasePrice: 0, baseUnitsPerPurchase: 1000,
    wastePercentage: 0, notes: "Oven-dried day-old bread, repurposed for pangrattato. Costed at $0 (waste reclaim).",
  })

  // ── ingredient resolver ──────────────────────────────────────────────────
  const ingCache = new Map<string, any>()
  const getIng = async (name: string) => {
    if (ingCache.has(name)) return ingCache.get(name)
    const i = await db.ingredient.findFirst({ where: { name } })
    if (!i) throw new Error(`Ingredient not found: "${name}"`)
    ingCache.set(name, i); return i
  }

  // ── prep creator (idempotent) ────────────────────────────────────────────
  async function ensurePrep(opts: { name: string; category: any; yieldQuantity: number; yieldUnit: string; yieldWeightGrams: number; method: string; lines: Line[] }) {
    const existing = await db.preparation.findUnique({ where: { name: opts.name } })
    if (existing) { console.log(`  • prep "${opts.name}" exists (${existing.id})`); return existing.id }
    const items = []
    for (let i = 0; i < opts.lines.length; i++) {
      const l = opts.lines[i]
      if (l.ingredient) items.push({ ingredientId: (await getIng(l.ingredient)).id, quantity: l.quantity, unit: l.unit, sortOrder: i })
      else if (l.subPrep) {
        const sp = await db.preparation.findUnique({ where: { name: l.subPrep } })
        if (!sp) throw new Error(`Sub-prep not found: "${l.subPrep}"`)
        items.push({ subPreparationId: sp.id, quantity: l.quantity, unit: l.unit, sortOrder: i })
      }
    }
    const prep = await db.preparation.create({
      data: { name: opts.name, category: opts.category, method: opts.method, yieldQuantity: opts.yieldQuantity, yieldUnit: opts.yieldUnit, yieldWeightGrams: opts.yieldWeightGrams, items: { create: items } },
    })
    console.log(`  ✅ prep "${opts.name}" (${prep.id})`)
    return prep.id
  }

  // 1) Seasoning pre-mix
  await ensurePrep({
    name: "Tomato Soup Seasoning (Pre-Mix)", category: "MIX",
    yieldQuantity: 440, yieldUnit: "g", yieldWeightGrams: 440,
    method: "Combine all spices. Store dry. Used at 130 g per tomato soup batch.",
    lines: [
      { ingredient: "Coriander seeds", quantity: 100, unit: "g" },
      { ingredient: "Smoked paprika", quantity: 70, unit: "g" },
      { ingredient: "Sumac", quantity: 70, unit: "g" },
      { ingredient: "Table salt", quantity: 170, unit: "g" },
      { ingredient: "Pepper - Ground White", quantity: 30, unit: "g" },
    ],
  })

  // 2) Pangrattato
  await ensurePrep({
    name: "Pangrattato", category: "COMPONENT",
    yieldQuantity: 1000, yieldUnit: "g", yieldWeightGrams: 1000,
    method: "1. Blitz dried bread to small crumbs. 2. Mix with chopped garlic + dried rosemary. 3. Toast in a little olive oil until dry & golden. 4. Cool, store dry.",
    lines: [
      { ingredient: "Bread - Dried (repurposed)", quantity: 1000, unit: "g" },
      { ingredient: "Garlic (peeled)", quantity: 5, unit: "g" },        // 1 clove
      { ingredient: "Rosemary leaves - dried", quantity: 15, unit: "g" },
      { ingredient: "Olive oil 2nd grade", quantity: 60, unit: "ml" },  // "as needed"
    ],
  })

  // 3) Tomato Soup (uses the seasoning pre-mix)
  await ensurePrep({
    name: "Tomato Soup", category: "SAUCE",
    yieldQuantity: SOUP_SERVES, yieldUnit: "serve", yieldWeightGrams: SOUP_YIELD_G,
    method: "1. Chop romas & onions. 2. Sweat onions+garlic. 3. Add carrots. 4. Add tomatoes, paste, stock, liquid smoke. 5. Simmer 45-60 min. 6. Add brown sugar, basil, seasoning pre-mix. 7. Blend smooth. 8. Pass if desired. Cool rapidly, ≤4°C, 5-day life.",
    lines: [
      { ingredient: "Tomato Roma", quantity: 8000, unit: "g" },
      { ingredient: "Carrot", quantity: 2000, unit: "g" },
      { ingredient: "Onion - Brown Large Bag", quantity: 1600, unit: "g" },
      { ingredient: "Garlic (peeled)", quantity: 1000, unit: "g" },     // 200 cloves ≈ 1 kg
      { ingredient: "Tomato Paste", quantity: 270, unit: "g" },
      { ingredient: "Liquid Smoke (Wrights)", quantity: 75, unit: "ml" },
      { ingredient: "Basil", quantity: 1, unit: "ea" },                  // 1 bunch
      { ingredient: "Brown sugar", quantity: 300, unit: "g" },
      { subPrep: "Tomato Soup Seasoning (Pre-Mix)", quantity: 130, unit: "g" },
      { ingredient: "Vegetable Stock - Real Campbells", quantity: 1000, unit: "ml" },
    ],
  })

  // ── recalc preps in dependency order: seasoning -> pangrattato -> soup ────
  const recalcPrep = async (name: string) => {
    const prep = await db.preparation.findUnique({ where: { name }, include: { items: { include: { ingredient: true, subPreparation: true } } } })
    if (!prep) throw new Error(`prep ${name} missing`)
    let batch = new Decimal(0)
    for (const it of prep.items) {
      let lc = new Decimal(0)
      if (it.ingredient) lc = ingLineCost(it.ingredient, Number(it.quantity), it.unit)
      else if (it.subPreparation) lc = prepLineCost(it.subPreparation, Number(it.quantity), it.unit)
      lc = lc.toDecimalPlaces(4)
      batch = batch.plus(lc)
      await db.preparationItem.update({ where: { id: it.id }, data: { lineCost: Number(lc) } })
    }
    const yg = new Decimal(String(prep.yieldWeightGrams)), yq = new Decimal(String(prep.yieldQuantity))
    await db.preparation.update({ where: { id: prep.id }, data: {
      batchCost: Number(batch.toDecimalPlaces(2)),
      costPerGram: Number((yg.gt(0) ? batch.div(yg) : new Decimal(0)).toDecimalPlaces(4)),
      costPerServe: Number((yq.gt(0) ? batch.div(yq) : new Decimal(0)).toDecimalPlaces(2)),
    } })
    console.log(`  📊 ${name}: batch $${batch.toFixed(2)}  (${Number(prep.yieldQuantity)}${prep.yieldUnit}, $${batch.div(yq).toFixed(2)}/unit)`)
  }
  await recalcPrep("Tomato Soup Seasoning (Pre-Mix)")
  await recalcPrep("Pangrattato")
  await recalcPrep("Tomato Soup")

  // ── Dish: Tomato Soup (+ bundled bagel cheese toastie) ───────────────────
  const DISH = "Tomato Soup"
  let dish = await db.dish.findFirst({ where: { name: DISH, venue: "BOTH" } })
  if (dish) { console.log(`  • dish "${DISH}" exists (${dish.id})`) }
  else {
    const soupPrep = await db.preparation.findUnique({ where: { name: "Tomato Soup" } })
    const pang = await db.preparation.findUnique({ where: { name: "Pangrattato" } })
    dish = await db.dish.create({
      data: {
        name: DISH, menuCategory: "LUNCH", venue: "BOTH",
        sellingPrice: SELLING_PRICE, sellingPriceExGst: new Decimal(SELLING_PRICE).div(1.1).toDecimalPlaces(4).toNumber(),
        isActive: true,
        notes: `Assembly: 2x6oz ladles tomato soup + 1x6oz ladle bought-in veg stock, 50g pangrattato, 20ml basil oil. Served with a bagel cheese toastie (provolone + tasty cheese + butter). Soup batch yields ~${SOUP_SERVES} serves.`,
        components: { create: [
          { preparationId: soupPrep!.id, quantity: Math.round(SOUP_PER_SERVE_ML), unit: "g", sortOrder: 1 },
          { ingredientId: (await getIng("Vegetable Stock - Real Campbells")).id, quantity: Math.round(STOCK_PER_SERVE_ML), unit: "ml", sortOrder: 2 },
          { preparationId: pang!.id, quantity: 50, unit: "g", sortOrder: 3 },
          { ingredientId: (await getIng("Basil Oil (house-made)")).id, quantity: 20, unit: "ml", sortOrder: 4 },
          // bagel cheese toastie
          { ingredientId: (await getIng("Bagel (everything)")).id, quantity: 1, unit: "ea", sortOrder: 5 },
          { ingredientId: (await getIng("Cheese Provolone Dolce Sliced")).id, quantity: PROVOLONE_SLICE_G, unit: "g", sortOrder: 6 },
          { ingredientId: (await getIng("Cheese Tasty Shredded")).id, quantity: 100, unit: "g", sortOrder: 7 },
          { ingredientId: (await getIng("Salted butter")).id, quantity: 30, unit: "g", sortOrder: 8 },
        ] },
      },
    })
    console.log(`  ✅ dish "${DISH}" (${dish.id}) @ $${SELLING_PRICE}`)
  }

  // recalc dish
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } })
  const prepMap = new Map(freshPreps.map((p) => [p.id, p]))
  const full = await db.dish.findFirst({ where: { id: dish.id }, include: { components: { include: { ingredient: true, preparation: true } } } })
  let total = new Decimal(0)
  console.log(`\n  Tomato Soup dish breakdown:`)
  for (const c of full!.components) {
    let lc = new Decimal(0)
    if (c.ingredient) lc = ingLineCost(c.ingredient, Number(c.quantity), c.unit)
    else if (c.preparationId) { const s = prepMap.get(c.preparationId); if (s) lc = prepLineCost(s, Number(c.quantity), c.unit) }
    lc = lc.toDecimalPlaces(4)
    total = total.plus(lc)
    await db.dishComponent.update({ where: { id: c.id }, data: { lineCost: Number(lc) } })
    console.log(`     ${Number(c.quantity)} ${c.unit}  ${c.ingredient?.name ?? c.preparation?.name}  $${lc.toFixed(4)}`)
  }
  const exGst = new Decimal(String(full!.sellingPrice)).div(1.1)
  const fc = exGst.gt(0) ? total.div(exGst).mul(100) : new Decimal(0)
  const gp = exGst.minus(total)
  await db.dish.update({ where: { id: dish.id }, data: { totalCost: Number(total.toDecimalPlaces(2)), foodCostPercentage: Number(fc.toDecimalPlaces(1)), grossProfit: Number(gp.toDecimalPlaces(2)) } })
  console.log(`\n  📊 ${DISH}: cost $${total.toFixed(2)}  sell $${SELLING_PRICE} (ex-GST $${exGst.toFixed(2)})  FC ${fc.toFixed(1)}%  GP $${gp.toFixed(2)}`)

  console.log("\n🎉 Done.")
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
