// Read-only: inspect cost fields of preps/dishes behind suspicious wastage entries.
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const preps = await db.preparation.findMany({
    where: {
      OR: [
        { name: { contains: "MINI", mode: "insensitive" } },
        { name: { contains: "Slice", mode: "insensitive" } },
        { name: { contains: "Brownie Cookie", mode: "insensitive" } },
        { name: { contains: "Almond Croissant", mode: "insensitive" } },
        { name: { contains: "Friand", mode: "insensitive" } },
        { name: { contains: "Muffin Top", mode: "insensitive" } },
      ],
    },
    select: {
      name: true,
      batchCost: true,
      costPerServe: true,
      costPerGram: true,
      yieldQuantity: true,
      yieldUnit: true,
      yieldWeightGrams: true,
      _count: { select: { items: true } },
    },
    orderBy: { name: "asc" },
  })
  console.log("--- preparations ---")
  for (const p of preps) {
    console.log(
      `${p.name.padEnd(40)} batch=$${p.batchCost}  perServe=$${p.costPerServe}  perGram=$${p.costPerGram}  yield=${p.yieldQuantity}${p.yieldUnit}/${p.yieldWeightGrams}g  items=${p._count.items}`
    )
  }

  const dishes = await db.dish.findMany({
    where: {
      OR: [
        { name: { contains: "Ricotta Cheesecake", mode: "insensitive" } },
        { name: { contains: "Tarte - Strawberry", mode: "insensitive" } },
      ],
    },
    select: { name: true, totalCost: true, sellingPrice: true },
  })
  console.log("\n--- dishes ---")
  for (const d of dishes) console.log(`${d.name.padEnd(40)} cost=$${d.totalCost}  sell=$${d.sellingPrice}`)
}

main().finally(() => db.$disconnect())
