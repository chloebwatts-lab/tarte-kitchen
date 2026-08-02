// READ-ONLY: dump pastry-ish dish costs to pick the cheapest recovery giveaway.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const dishes = await db.dish.findMany({
    where: { OR: ["cruller","crueller","croissant","muffin","cookie","scroll","kouign","scone","tarte","tart","financier","cake"].map(k => ({ name: { contains: k, mode: "insensitive" as const } })) },
    select: { name: true, sellingPrice: true, totalCost: true, foodCostPercentage: true, isActive: true },
    orderBy: { totalCost: "asc" },
  })
  for (const d of dishes) console.log([d.isActive ? "A" : "-", d.name, "cost", d.totalCost?.toString(), "sell", d.sellingPrice?.toString(), "fc%", d.foodCostPercentage?.toString()].join(" | "))
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
