// READ-ONLY: check what data we have to compute "serves per bucket/tub" for preps.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const preps = await db.preparation.findMany({
    select: {
      id: true, name: true, category: true,
      yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true,
      dishComponents: {
        select: { quantity: true, unit: true, dish: { select: { name: true, isActive: true } } },
      },
      stockItems: { select: { venue: true, station: true, name: true, unit: true, parLevel: true } },
    },
    orderBy: { name: "asc" },
  })
  console.log("TOTAL PREPS:", preps.length)
  const interesting = ["scramble", "health", "bowl", "veg"]
  for (const p of preps) {
    const hit = interesting.some(k => p.name.toLowerCase().includes(k))
    const perServe =
      p.yieldUnit?.toLowerCase().startsWith("serve") && Number(p.yieldQuantity) > 0
        ? Number(p.yieldWeightGrams) / Number(p.yieldQuantity)
        : null
    const line = [
      hit ? ">>>" : "   ",
      p.name,
      `yield ${p.yieldQuantity} ${p.yieldUnit}`,
      `batch ${p.yieldWeightGrams}g`,
      perServe ? `≈${perServe.toFixed(0)}g/serve` : "",
      p.stockItems.length ? `stock:[${p.stockItems.map(s => `${s.venue}/${s.station}/${s.name}(${s.unit ?? "?"})`).join(", ")}]` : "",
    ].join(" | ")
    console.log(line)
    if (hit) {
      for (const c of p.dishComponents) {
        console.log(`      used in: ${c.dish.name}${c.dish.isActive ? "" : " (inactive)"} — ${c.quantity} ${c.unit}`)
      }
    }
  }
  // Also: stock items with no linked prep (Vini's coolroom list is probably these)
  const orphans = await db.prepStockItem.findMany({
    where: { preparationId: null, isActive: true },
    select: { venue: true, station: true, name: true, unit: true },
    orderBy: [{ venue: "asc" }, { station: "asc" }, { sortOrder: "asc" }],
  })
  console.log("\nSTOCK ITEMS WITH NO LINKED PREP:", orphans.length)
  for (const o of orphans) console.log(`  ${o.venue} / ${o.station} / ${o.name} (${o.unit ?? "no unit"})`)
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
