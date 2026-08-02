import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  for (const name of ["Pate and House Pickles", "BLT", "Chilli Benny", "Guzzy Burrito", "OG Burrito", "Steak and Frites", "Tomato Soup Burrata"]) {
    const d = await db.dish.findFirst({
      where: { name },
      select: { name: true, components: { select: {
        ingredient: { select: { name: true, allergens: true } },
        preparation: { select: { name: true } },
      } } },
    })
    if (!d) { console.log(`!! not found: ${name}`); continue }
    console.log(`### ${d.name}`)
    for (const c of d.components) {
      if (c.ingredient) console.log(`  - ing: ${c.ingredient.name} {${c.ingredient.allergens.join(",")}}`)
      if (c.preparation) console.log(`  - prep: ${c.preparation.name}`)
    }
  }
  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
