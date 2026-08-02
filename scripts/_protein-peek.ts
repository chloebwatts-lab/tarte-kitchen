// READ-ONLY: find protein ingredient names + supplier item names for provenance one-liners.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
const KEYS = ["salmon","barramundi","lobster","crab","gurnard","steak","sirloin","wagyu","beef","chicken","brisket","bacon","ham","pork"]
async function main() {
  const ings = await db.ingredient.findMany({
    where: { OR: KEYS.map(k => ({ name: { contains: k, mode: "insensitive" as const } })) },
    select: { name: true, category: true, supplier: { select: { name: true } } },
  })
  for (const i of ings) console.log("ING |", i.name, "|", i.category, "|", i.supplier?.name ?? "-")
  const items = await db.supplierItemMapping.findMany({
    where: { OR: KEYS.map(k => ({ rawDescription: { contains: k, mode: "insensitive" as const } })) },
    select: { rawDescription: true, supplier: { select: { name: true } } },
    take: 60,
  })
  const seen = new Set<string>()
  for (const m of items) { const k = `${m.rawDescription}|${m.supplier?.name}`; if (!seen.has(k)) { seen.add(k); console.log("MAP |", m.rawDescription, "|", m.supplier?.name ?? "-") } }
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
