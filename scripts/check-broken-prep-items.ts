// Read-only: show the recipe items inside the preps with suspect per-piece costs.
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

const NAMES = [
  "Scone - MINI - each",
  "Crueller - Dulce De Leche MINI - each",
  "Tarte - Strawberry MINI - each",
  "Tarte - Passionfruit MINI - each",
  "Brownie Cookie - Each",
  "Muffin Top - Blueberry - Each",
  "Muffin Top - Strawberry - Each",
]

async function main() {
  for (const name of NAMES) {
    const p = await db.preparation.findUnique({
      where: { name },
      include: {
        items: {
          include: {
            ingredient: { select: { name: true } },
            subPreparation: {
              select: { name: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true, costPerServe: true },
            },
          },
        },
      },
    })
    if (!p) {
      console.log(`${name}: NOT FOUND`)
      continue
    }
    console.log(`\n${p.name} (batch=$${p.batchCost})`)
    for (const it of p.items) {
      const src = it.ingredient
        ? `ingredient: ${it.ingredient.name}`
        : it.subPreparation
          ? `prep: ${it.subPreparation.name} (batch=$${it.subPreparation.batchCost}, yield=${it.subPreparation.yieldQuantity}${it.subPreparation.yieldUnit}/${it.subPreparation.yieldWeightGrams}g, perServe=$${it.subPreparation.costPerServe})`
          : "??"
      console.log(`  ${it.quantity} ${it.unit}  ←  ${src}  lineCost=$${it.lineCost}`)
    }
  }

  const slice = await db.dish.findFirst({
    where: { name: "Ricotta Cheesecake - Slice" },
    include: {
      components: {
        include: {
          ingredient: { select: { name: true } },
          preparation: { select: { name: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } },
        },
      },
    },
  })
  if (slice) {
    console.log(`\nRicotta Cheesecake - Slice (dish, cost=$${slice.totalCost})`)
    for (const c of slice.components) {
      const src = c.ingredient
        ? `ingredient: ${c.ingredient.name}`
        : c.preparation
          ? `prep: ${c.preparation.name} (batch=$${c.preparation.batchCost}, yield=${c.preparation.yieldQuantity}${c.preparation.yieldUnit}/${c.preparation.yieldWeightGrams}g)`
          : "??"
      console.log(`  ${c.quantity} ${c.unit}  ←  ${src}`)
    }
  }
}

main().finally(() => db.$disconnect())
