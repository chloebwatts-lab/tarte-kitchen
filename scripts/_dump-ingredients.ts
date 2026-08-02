// READ-ONLY: dump every ingredient (id, name, category, current allergens, usage count) to JSON.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const ings = await db.ingredient.findMany({
    select: {
      id: true, name: true, category: true, allergens: true,
      _count: { select: { preparationItems: true, dishComponents: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })
  const out = ings.map((i) => ({
    id: i.id, name: i.name, category: i.category, allergens: i.allergens,
    uses: i._count.preparationItems + i._count.dishComponents,
  }))
  console.log(JSON.stringify(out, null, 2))
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
