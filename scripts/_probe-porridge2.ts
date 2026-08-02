import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const rows = await db.dish.findMany({
    where: { OR: ["bircher","muesli","granola","oat","brekkie","breakfast bowl"].map(t => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, venue: true, menuCategory: true, isActive: true },
  })
  console.log(rows.length ? rows : "none")
  const burleighBrekkie = await db.dish.findMany({ where: { venue: "BURLEIGH", menuCategory: "BREAKFAST", isActive: true }, select: { name: true } })
  console.log("Burleigh-only active breakfast dishes:", burleighBrekkie.map(d => d.name))
  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
