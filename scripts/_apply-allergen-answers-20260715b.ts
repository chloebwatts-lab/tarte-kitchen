// 2026-07-15 follow-up: Chloe's answers to the matrix review.
//   - "Pate and House Pickles": taken off the menu -> isActive=false
//   - "Summer Yoghurt": not serving -> isActive=false
// No allergen changes (fries/hash/halloumi confirmed plain; Lamb Weston
// Stealth spec = allergens none; beef burger has no sesame; no butter on
// barramundi).
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  for (const name of ["Pate and House Pickles", "Summer Yoghurt"]) {
    const matches = await db.dish.findMany({
      where: { name },
      select: { id: true, name: true, venue: true, isActive: true },
    })
    for (const d of matches) {
      if (!d.isActive) {
        console.log(`NO-OP "${d.name}" (${d.venue}): already inactive`)
        continue
      }
      await db.dish.update({ where: { id: d.id }, data: { isActive: false } })
      console.log(`DEACTIVATED "${d.name}" (${d.venue})`)
    }
    if (!matches.length) console.log(`NOT FOUND: "${name}"`)
  }
  await db.$disconnect()
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
