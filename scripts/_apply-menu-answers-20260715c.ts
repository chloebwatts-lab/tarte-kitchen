// Chloe 2026-07-15 evening: real prices + venue corrections.
//  - Hash Bagel $21.50 (stays BOTH: Burleigh now, Currumbin being added)
//  - Spanish Baked Beans $24.90, venue BEACH_HOUSE -> BURLEIGH
//  - Spanish Baked Beans - Chorizo $27.90 (+$3 add), venue -> BURLEIGH
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const updates: Array<{ name: string; venue: "BOTH" | "BEACH_HOUSE"; price: number; newVenue?: "BURLEIGH" }> = [
    { name: "Hash Bagel", venue: "BOTH", price: 21.5 },
    { name: "Spanish Baked Beans", venue: "BEACH_HOUSE", price: 24.9, newVenue: "BURLEIGH" },
    { name: "Spanish Baked Beans - Chorizo", venue: "BEACH_HOUSE", price: 27.9, newVenue: "BURLEIGH" },
  ]
  for (const u of updates) {
    const d = await db.dish.findUnique({ where: { name_venue: { name: u.name, venue: u.venue } } })
    if (!d) { console.log(`NOT FOUND: ${u.name} @ ${u.venue}`); continue }
    const exGst = +(u.price / 1.1).toFixed(4)
    await db.dish.update({
      where: { id: d.id },
      data: {
        sellingPrice: u.price,
        sellingPriceExGst: exGst,
        ...(u.newVenue ? { venue: u.newVenue } : {}),
        notes: (d.notes ?? "").replace(/SELLING PRICE .* PLACEHOLDER[^.]*\./, "").replace(/PRICE \$\d+\.\d+ PLACEHOLDER[^.]*\./, "") + ` Price $${u.price} confirmed by Chloe 2026-07-15.`,
      },
    })
    console.log(`✅ ${u.name}: $${u.price} (ex $${exGst})${u.newVenue ? `, venue ${u.venue} -> ${u.newVenue}` : ""}`)
  }
  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
