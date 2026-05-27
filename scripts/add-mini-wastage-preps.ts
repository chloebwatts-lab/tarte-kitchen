/**
 * Adds per-piece Preparation rows so staff can log wastage of
 *   - Mini Bagel        (1/3 of a "Bagel (everything)" ingredient)
 *   - Mini Chicken Sand (1/4 of Chicken Miso Sandwich)
 *   - Mini Cucumber Sand (1/4 of Cucumber Sandwich - Full)
 *
 * Mini Croissant from Eustralis is intentionally not added here — no pack
 * price yet and Eustralis invoices arrive as gateway aggregates with no
 * line items, so it needs human input first.
 *
 * Pattern mirrors existing per-piece preps (Salmon/Tomato Bagel - MINI each,
 * Scone - MINI - each, Choc Chip Cookie - MINI - Each): yieldQuantity 1 ea,
 * placeholder yieldWeightGrams 100, category PASTRY.
 *
 * After insert, the script runs the same recalc logic as
 * scripts/recalculate-all.ts to fill batchCost / costPerGram / costPerServe.
 *
 * Usage: npx tsx scripts/add-mini-wastage-preps.ts
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

const MINI_PREPS: { name: string; fromDish?: string; fromIngredient?: { name: string; qty: number; unit: string }; scale: number }[] = [
  {
    name: "Mini Bagel - each",
    fromIngredient: { name: "Bagel (everything)", qty: 0.33, unit: "ea" },
    scale: 1, // qty already pre-scaled
  },
  {
    name: "Mini Chicken Sandwich - each",
    fromDish: "Chicken Miso Sandwich",
    scale: 0.25,
  },
  {
    name: "Mini Cucumber Sandwich - each",
    fromDish: "Cucumber Sandwich  - Full", // two spaces — matches existing dish name
    scale: 0.25,
  },
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  for (const spec of MINI_PREPS) {
    const existing = await db.preparation.findUnique({ where: { name: spec.name } })
    if (existing) {
      console.log(`  • ${spec.name} already exists — skipping insert`)
      continue
    }

    // Build the list of (ingredientId|subPreparationId, qty, unit) to insert.
    const items: { ingredientId?: string; subPreparationId?: string; quantity: number; unit: string; sortOrder: number }[] = []

    if (spec.fromIngredient) {
      const ing = await db.ingredient.findFirst({ where: { name: spec.fromIngredient.name } })
      if (!ing) throw new Error(`Ingredient not found: ${spec.fromIngredient.name}`)
      items.push({
        ingredientId: ing.id,
        quantity: spec.fromIngredient.qty,
        unit: spec.fromIngredient.unit,
        sortOrder: 0,
      })
    } else if (spec.fromDish) {
      const dish = await db.dish.findFirst({
        where: { name: spec.fromDish },
        include: { components: { orderBy: { sortOrder: "asc" } } },
      })
      if (!dish) throw new Error(`Dish not found: ${spec.fromDish}`)
      for (const c of dish.components) {
        items.push({
          ingredientId: c.ingredientId ?? undefined,
          subPreparationId: c.preparationId ?? undefined,
          quantity: Number(new Decimal(String(c.quantity)).mul(spec.scale).toDecimalPlaces(6)),
          unit: c.unit,
          sortOrder: c.sortOrder,
        })
      }
    }

    const prep = await db.preparation.create({
      data: {
        name: spec.name,
        category: "PASTRY",
        yieldQuantity: 1,
        yieldUnit: "ea",
        yieldWeightGrams: 100, // placeholder — matches existing per-piece MINI preps
        batchCost: 0,
        costPerGram: 0,
        costPerServe: 0,
        items: { create: items },
      },
      include: { items: { include: { ingredient: true, subPreparation: true } } },
    })

    // Recalc using the same logic as scripts/recalculate-all.ts
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
    console.log(`  ✅ created ${prep.name}  →  $${batchCost.toFixed(2)} per piece (${prep.items.length} items)`)
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
