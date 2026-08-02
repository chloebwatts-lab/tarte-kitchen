import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const prep = await db.preparation.findUnique({ where: { name: "Spanish Baked Beans (Vege Base)" }, select: { batchCost: true, costPerGram: true, yieldWeightGrams: true } })
  console.log(`PREP beans base: batch $${prep!.batchCost} / ${prep!.yieldWeightGrams}g = $${prep!.costPerGram}/g -> $${(Number(prep!.costPerGram) * 300).toFixed(2)} per 300g serve`)
  for (const [name, venue] of [["Hash Bagel", "BOTH"], ["Spanish Baked Beans", "BEACH_HOUSE"], ["Spanish Baked Beans - Chorizo", "BEACH_HOUSE"]] as const) {
    const d = await db.dish.findUnique({
      where: { name_venue: { name, venue } },
      select: { name: true, sellingPrice: true, totalCost: true, foodCostPercentage: true, grossProfit: true,
        components: { orderBy: { sortOrder: "asc" }, select: { quantity: true, unit: true, lineCost: true, ingredient: { select: { name: true } }, preparation: { select: { name: true } } } } },
    })
    console.log(`\n### ${d!.name}  sell $${d!.sellingPrice} | cost $${d!.totalCost} | FC ${d!.foodCostPercentage}% | GP $${d!.grossProfit}`)
    for (const c of d!.components) console.log(`  ${String(c.quantity).padStart(4)} ${c.unit.padEnd(5)} ${(c.ingredient?.name ?? c.preparation?.name)!.padEnd(35)} $${c.lineCost}`)
  }
  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
