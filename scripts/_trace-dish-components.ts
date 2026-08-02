// READ-ONLY: print full component tree (preps + ingredients with allergens)
// for a named list of dishes. Used for the 2026-07-15 allergen matrix review.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const TARGETS = [
  "B & E Roll", "BEC Bagel", "Maple Bacon Bagel", "Cheese Bagel & Tomato Soup",
  "Beef Burger", "Crab Linguine", "Chicken Parmigiana", "Chicken Miso Sandwich",
  "Wombok Miso Chicken Salad", "Mediterranean Grilled Barramundi", "Lobster Roll",
  "Full Fries", "Halloumi Side", "Hash", "Ketchup", "Sausage Roll",
  "Garden Tartine", "Morning After", "Spiced Mushroom Salad", "Steak Baguette",
  "Summer Yoghurt", "Thai Wagyu Beef Salad", "Winter Salad (Roast Vegetable)",
  "Hot Honey Sourdough", "Avo Toast", "Crispy Chilli Burrata",
]

async function main() {
  const preparations = await db.preparation.findMany({
    select: {
      id: true, name: true,
      items: {
        select: {
          ingredient: { select: { id: true, name: true, allergens: true } },
          subPreparationId: true,
        },
      },
    },
  })
  const prepById = new Map(preparations.map((p) => [p.id, p]))

  function printPrep(prepId: string, indent: string, seen = new Set<string>()) {
    if (seen.has(prepId)) return
    seen.add(prepId)
    const prep = prepById.get(prepId)
    if (!prep) return
    console.log(`${indent}[prep] ${prep.name}`)
    for (const item of prep.items) {
      if (item.ingredient) {
        console.log(`${indent}  - ${item.ingredient.name}  {${item.ingredient.allergens.join(",")}}`)
      }
      if (item.subPreparationId) printPrep(item.subPreparationId, indent + "  ", seen)
    }
  }

  const dishes = await db.dish.findMany({
    where: { name: { in: TARGETS } },
    select: {
      name: true, venue: true, isActive: true,
      components: {
        select: {
          ingredient: { select: { id: true, name: true, allergens: true } },
          preparationId: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  for (const d of dishes) {
    if (!d.isActive) continue
    console.log(`\n### ${d.name} (${d.venue})`)
    for (const c of d.components) {
      if (c.ingredient) {
        console.log(`  - ${c.ingredient.name}  {${c.ingredient.allergens.join(",")}}`)
      }
      if (c.preparationId) printPrep(c.preparationId, "  ")
    }
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
