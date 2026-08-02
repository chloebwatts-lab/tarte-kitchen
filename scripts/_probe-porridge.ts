import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const rows = await db.dish.findMany({
    where: { OR: [{ name: { contains: "porridge", mode: "insensitive" } }, { name: { contains: "oats", mode: "insensitive" } }] },
    select: { id: true, name: true, venue: true, menuCategory: true, isActive: true, sellingPrice: true, totalCost: true,
      components: { select: { quantity: true, unit: true, ingredient: { select: { name: true, allergens: true } }, preparation: { select: { name: true } } } } },
  })
  for (const d of rows) {
    console.log(`${d.name} [${d.venue}] ${d.menuCategory} active=${d.isActive} $${d.sellingPrice} cost $${d.totalCost}`)
    for (const c of d.components) console.log(`   ${c.quantity}${c.unit} ${c.ingredient?.name ?? c.preparation?.name} ${c.ingredient ? `{${c.ingredient.allergens}}` : ""}`)
  }
  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
