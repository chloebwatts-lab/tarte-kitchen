// READ-ONLY: investigate "Hash" — any prep/ingredient named hash, its components,
// and everywhere hash appears (dishes/preps) to see if butter (milk) is involved.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  // preparations named hash + their items
  const preps = await db.preparation.findMany({
    where: { name: { contains: "hash", mode: "insensitive" } },
    select: { id: true, name: true,
      items: { select: {
        ingredient: { select: { name: true, allergens: true } },
        subPreparation: { select: { name: true } } } } },
  })
  console.log("=== PREPARATIONS named 'hash' ===")
  for (const p of preps) {
    console.log(`\n▸ ${p.name}`)
    for (const it of p.items) {
      const who = it.ingredient ? `${it.ingredient.name} [${it.ingredient.allergens.join(",")||"-"}]` : `(sub) ${it.subPreparation?.name}`
      console.log(`    - ${who}`)
    }
  }

  // ingredient named hash
  const ings = await db.ingredient.findMany({
    where: { name: { contains: "hash", mode: "insensitive" } },
    select: { id: true, name: true, allergens: true },
  })
  console.log("\n=== INGREDIENTS named 'hash' ===")
  for (const i of ings) console.log(`  ${i.name} -> ${i.allergens.join(",")||"(empty)"}  [id ${i.id}]`)

  // where does any hash prep/ingredient appear as a component?
  const hashPrepIds = preps.map((p) => p.id)
  const hashIngIds = ings.map((i) => i.id)
  const dcomp = await db.dishComponent.findMany({
    where: { OR: [{ preparationId: { in: hashPrepIds } }, { ingredientId: { in: hashIngIds } }] },
    select: { dish: { select: { name: true, venue: true } } },
  })
  const pcomp = await db.preparationItem.findMany({
    where: { OR: [{ subPreparationId: { in: hashPrepIds } }, { ingredientId: { in: hashIngIds } }] },
    select: { preparation: { select: { name: true } } },
  })
  console.log("\n=== Hash used in DISHES ===")
  for (const d of dcomp) console.log(`  ${d.dish.venue}  ${d.dish.name}`)
  console.log("=== Hash used in PREPARATIONS ===")
  for (const p of pcomp) console.log(`  ${p.preparation.name}`)

  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
