/**
 * 1) Creates the Eustralis Bridor Access Croissant Mini 30g as an ingredient
 *    (code 42855, $90/195 ea = $0.462/ea) and a per-piece prep so it appears
 *    in the wastage form.
 *
 * 2) Fixes the Scotch Loaf unit bug on `Cucumber Sandwich - Full`:
 *      2 ea  ->  200 g
 *    The "ea" unit against a WEIGHT-type ingredient (1100 g / $8.40) made the
 *    engine read it as 2 g of bread instead of two slices, so the full
 *    sandwich was costed ~$0.015 of bread. After the fix it picks up the
 *    correct ~$1.53 of bread for 200g.
 *
 *    The Mini Cucumber Sandwich prep we just created inherits the same
 *    line at 0.5 ea -> 50 g; that's fixed too. Both parent dish and mini
 *    prep are recalc'd at the end.
 *
 * Usage: npx tsx scripts/add-mini-croissant-and-fix-scotch.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, oz: 28.3495, lb: 453.592,
}
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  // ── 1. Mini Croissant ingredient + prep ────────────────────────────────
  const eustralis = await db.supplier.findFirst({ where: { name: "Eustralis" } })
  if (!eustralis) throw new Error("Eustralis supplier missing")

  let miniCroissantIng = await db.ingredient.findFirst({
    where: { name: "Croissant - Mini (Bridor)" },
  })
  if (!miniCroissantIng) {
    miniCroissantIng = await db.ingredient.create({
      data: {
        name: "Croissant - Mini (Bridor)",
        category: "BAKERY",
        baseUnitType: "COUNT",
        supplierId: eustralis.id,
        supplierProductCode: "42855",
        purchaseQuantity: 195,
        purchaseUnit: "ea",
        purchasePrice: 90,
        baseUnitsPerPurchase: 195,
        wastePercentage: 0,
        parLevel: 0,
        parUnit: "ea",
        notes: "Bridor Access Croissant Mini 30g — 195 pcs/box @ $90 (ex GST)",
        gramsPerUnit: 30,
      },
    })
    console.log(`  ✅ created ingredient ${miniCroissantIng.name} (code 42855, $90/195 ea)`)
  } else {
    console.log(`  • ingredient ${miniCroissantIng.name} already exists — skipping`)
  }

  let miniCroissantPrep = await db.preparation.findUnique({
    where: { name: "Mini Croissant - each" },
  })
  if (!miniCroissantPrep) {
    miniCroissantPrep = await db.preparation.create({
      data: {
        name: "Mini Croissant - each",
        category: "PASTRY",
        yieldQuantity: 1,
        yieldUnit: "ea",
        yieldWeightGrams: 30,
        batchCost: 0,
        costPerGram: 0,
        costPerServe: 0,
        items: {
          create: [{
            ingredientId: miniCroissantIng.id,
            quantity: 1,
            unit: "ea",
            sortOrder: 0,
          }],
        },
      },
    })
    console.log(`  ✅ created prep ${miniCroissantPrep.name}`)
  } else {
    console.log(`  • prep ${miniCroissantPrep.name} already exists — skipping`)
  }

  // ── 2. Scotch Loaf unit fix ────────────────────────────────────────────
  const scotchIngId = "cmn8ccet400ef16qzqbpqwkmu"
  const dishCompId = "cmna3kr6q00rd15pihnuziek0"      // Cucumber Sandwich - Full
  const prepItemId = "cmp7gffhl000e0upk1n8979q6"      // Mini Cucumber Sandwich - each

  const dishComp = await db.dishComponent.findUnique({ where: { id: dishCompId } })
  if (dishComp && dishComp.unit === "ea") {
    await db.dishComponent.update({
      where: { id: dishCompId },
      data: { quantity: 200, unit: "g" },
    })
    console.log(`  ✅ Cucumber Sandwich - Full: Scotch Loaf 2 ea  ->  200 g`)
  } else {
    console.log(`  • Cucumber Sandwich - Full Scotch line already non-ea (${dishComp?.unit}) — skipping`)
  }

  const prepItem = await db.preparationItem.findUnique({ where: { id: prepItemId } })
  if (prepItem && prepItem.unit === "ea") {
    await db.preparationItem.update({
      where: { id: prepItemId },
      data: { quantity: 50, unit: "g" },
    })
    console.log(`  ✅ Mini Cucumber Sandwich: Scotch Loaf 0.5 ea  ->  50 g`)
  } else {
    console.log(`  • Mini Cucumber Sandwich Scotch line already non-ea (${prepItem?.unit}) — skipping`)
  }

  // ── 3. Recalc the affected preps and dishes ────────────────────────────
  const prepsToRecalc = await db.preparation.findMany({
    where: { name: { in: ["Mini Croissant - each", "Mini Cucumber Sandwich - each"] } },
    include: { items: { include: { ingredient: true, subPreparation: true } } },
  })
  for (const prep of prepsToRecalc) {
    let batchCost = new Decimal(0)
    for (const item of prep.items) {
      let lineCost = new Decimal(0)
      if (item.ingredient) {
        const ing = item.ingredient
        const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
        const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
        if (usable.gt(0)) {
          const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
          const u = item.unit.toLowerCase()
          if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero()) {
            const baseInRecipe = new Decimal(String(item.quantity)).mul(UNIT_MULT[u] ?? 1)
            const unitsUsed = baseInRecipe.div(new Decimal(String(ing.gramsPerUnit)))
            lineCost = unitsUsed.mul(cpbu)
          } else {
            const baseQty = new Decimal(String(item.quantity)).mul(UNIT_MULT[u] ?? 1)
            lineCost = baseQty.mul(cpbu)
          }
        }
      } else if (item.subPreparation) {
        const sub = item.subPreparation
        const q = new Decimal(String(item.quantity))
        const u = item.unit.toLowerCase()
        const yu = sub.yieldUnit.toLowerCase()
        const unitIsCount = COUNT_UNITS.has(u)
        const yieldIsCount = yu === "serve" || yu === "ea"
        if (unitIsCount && yieldIsCount) {
          const baseQ = q.mul(UNIT_MULT[u] ?? 1)
          const baseY = new Decimal(String(sub.yieldQuantity)).mul(UNIT_MULT[yu] ?? 1)
          lineCost = baseY.gt(0) ? baseQ.div(baseY).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
        } else {
          const baseQty = q.mul(UNIT_MULT[u] ?? 1)
          const yieldGrams = new Decimal(String(sub.yieldWeightGrams))
          lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
        }
      }
      lineCost = lineCost.toDecimalPlaces(4)
      batchCost = batchCost.plus(lineCost)
      await db.preparationItem.update({ where: { id: item.id }, data: { lineCost: Number(lineCost) } })
    }
    const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
    const yieldQty = new Decimal(String(prep.yieldQuantity))
    const costPerGram = yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)
    const costPerServe = yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)
    await db.preparation.update({
      where: { id: prep.id },
      data: {
        batchCost: Number(batchCost.toDecimalPlaces(2)),
        costPerGram: Number(costPerGram.toDecimalPlaces(4)),
        costPerServe: Number(costPerServe.toDecimalPlaces(2)),
      },
    })
    console.log(`  ✅ recalc ${prep.name}  ->  $${batchCost.toFixed(2)}`)
  }

  // Recalc the parent dish so its totalCost / food cost % reflects the fix.
  const dish = await db.dish.findFirst({
    where: { name: "Cucumber Sandwich  - Full" },
    include: { components: { include: { ingredient: true, preparation: true } } },
  })
  if (dish) {
    const freshPreps = await db.preparation.findMany({
      select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true },
    })
    const prepMap = new Map(freshPreps.map((p) => [p.id, p]))
    let totalCost = new Decimal(0)
    for (const c of dish.components) {
      let lineCost = new Decimal(0)
      if (c.ingredient) {
        const ing = c.ingredient
        const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
        const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
        if (usable.gt(0)) {
          const cpbu = new Decimal(String(ing.purchasePrice)).div(usable)
          const u = c.unit.toLowerCase()
          if (ing.baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && ing.gramsPerUnit && !new Decimal(String(ing.gramsPerUnit)).isZero()) {
            const baseInRecipe = new Decimal(String(c.quantity)).mul(UNIT_MULT[u] ?? 1)
            const unitsUsed = baseInRecipe.div(new Decimal(String(ing.gramsPerUnit)))
            lineCost = unitsUsed.mul(cpbu)
          } else {
            const baseQty = new Decimal(String(c.quantity)).mul(UNIT_MULT[u] ?? 1)
            lineCost = baseQty.mul(cpbu)
          }
        }
      } else if (c.preparationId) {
        const sub = prepMap.get(c.preparationId)
        if (sub) {
          const q = new Decimal(String(c.quantity))
          const u = c.unit.toLowerCase()
          const yu = sub.yieldUnit.toLowerCase()
          const unitIsCount = COUNT_UNITS.has(u)
          const yieldIsCount = yu === "serve" || yu === "ea"
          if (unitIsCount && yieldIsCount) {
            const baseQ = q.mul(UNIT_MULT[u] ?? 1)
            const baseY = new Decimal(String(sub.yieldQuantity)).mul(UNIT_MULT[yu] ?? 1)
            lineCost = baseY.gt(0) ? baseQ.div(baseY).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
          } else {
            const baseQty = q.mul(UNIT_MULT[u] ?? 1)
            const yieldGrams = new Decimal(String(sub.yieldWeightGrams))
            lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(new Decimal(String(sub.batchCost))) : new Decimal(0)
          }
        }
      }
      lineCost = lineCost.toDecimalPlaces(4)
      totalCost = totalCost.plus(lineCost)
      await db.dishComponent.update({ where: { id: c.id }, data: { lineCost: Number(lineCost) } })
    }
    const sellingPriceExGst = new Decimal(String(dish.sellingPrice)).div(1.1)
    const fcPct = sellingPriceExGst.gt(0) ? totalCost.div(sellingPriceExGst).mul(100) : new Decimal(0)
    const gp = sellingPriceExGst.minus(totalCost)
    await db.dish.update({
      where: { id: dish.id },
      data: {
        totalCost: Number(totalCost.toDecimalPlaces(2)),
        foodCostPercentage: Number(fcPct.toDecimalPlaces(1)),
        grossProfit: Number(gp.toDecimalPlaces(2)),
      },
    })
    console.log(`  ✅ recalc ${dish.name}  ->  $${totalCost.toFixed(2)} (FC ${fcPct.toFixed(1)}%)`)
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
