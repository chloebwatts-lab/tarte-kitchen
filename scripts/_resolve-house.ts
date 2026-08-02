// READ-ONLY: find house recipes (BBQ, granola/muesli, hangover) + key ingredients
// (Kewpie, bacon, puffed rice) to resolve their allergens from components.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  // 1) Preparations whose name hints at these recipes
  const preps = await db.preparation.findMany({
    where: { OR: ["bbq","granola","muesli","hangover","bacon"].map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) },
    select: { id: true, name: true,
      items: { select: { quantity: true, unit: true,
        ingredient: { select: { name: true, allergens: true } },
        subPreparation: { select: { name: true } } } } },
  })
  console.log("=== PREPARATIONS ===")
  for (const p of preps) {
    console.log(`\n▸ ${p.name}`)
    for (const it of p.items) {
      const who = it.ingredient ? `${it.ingredient.name} [${it.ingredient.allergens.join(",")||"-"}]` : `(sub) ${it.subPreparation?.name}`
      console.log(`    - ${who}`)
    }
  }

  // 2) Specific ingredients of interest
  const ings = await db.ingredient.findMany({
    where: { OR: ["kewpie","bacon","puffed","hangover","bbq","muesli","granola","mayonnaise"].map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) },
    select: { name: true, category: true, allergens: true },
    orderBy: { name: "asc" },
  })
  console.log("\n=== INGREDIENTS ===")
  for (const i of ings) console.log(`  ${i.name} [${i.category}] -> ${i.allergens.join(",")||"(empty)"}`)

  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
