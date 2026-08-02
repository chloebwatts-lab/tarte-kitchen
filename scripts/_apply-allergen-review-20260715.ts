// Applies the 2026-07-15 handwritten allergen-matrix review (kitchen copy).
// ADDITIVE ONLY: appends allergens to ingredients, never removes.
//   - Bagel (everything): +SESAME  (everything-bagel topping; chef marked
//     "Seeds" on BEC Bagel + Maple Bacon Bagel)
//   - Linguine: +EGG  (fresh egg pasta; chef ticked Egg on Crab Linguine)
import "dotenv/config"
import { PrismaClient, Allergen } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const ADDITIONS: Array<{ name: string; add: Allergen[] }> = [
  { name: "Bagel (everything)", add: ["SESAME"] },
  { name: "Linguine", add: ["EGG"] },
]

async function main() {
  for (const { name, add } of ADDITIONS) {
    const matches = await db.ingredient.findMany({
      where: { name },
      select: { id: true, name: true, allergens: true },
    })
    if (matches.length !== 1) {
      console.log(`SKIP "${name}": expected exactly 1 match, found ${matches.length}`)
      continue
    }
    const ing = matches[0]
    const merged = Array.from(new Set([...ing.allergens, ...add])).sort()
    if (merged.length === ing.allergens.length) {
      console.log(`NO-OP "${name}": already has ${ing.allergens.join(",")}`)
      continue
    }
    await db.ingredient.update({
      where: { id: ing.id },
      data: { allergens: merged as Allergen[] },
    })
    console.log(`UPDATED "${name}": {${ing.allergens.join(",")}} -> {${merged.join(",")}}`)
  }
  await db.$disconnect()
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
