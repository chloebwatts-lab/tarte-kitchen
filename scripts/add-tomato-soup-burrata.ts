/**
 * Tomato Soup Burrata — Currumbin (BEACH_HOUSE) version of the Tomato Soup,
 * per Chris 2026-06-12: same soup bowl, topped with 1 whole burrata ball,
 * 20g crispy chilli (house prep), 10g basil. No bagel toastie / pangrattato /
 * basil oil (those are the Burleigh assembly).
 *
 * Also: Basil price fix $3.40 → $4.15/bunch (Pacific inv 2026-06-09).
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const BASIL = "cmn8cccl2001o16qzmqxzk1q0"
const BURRATA = "cmn8ccczb002y16qzs1qfnjvq"
const VEG_STOCK = "cmn8ccf7g00h716qzb94onjnt"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  await db.ingredient.update({ where: { id: BASIL }, data: { purchasePrice: 4.15 } })
  console.log("✅ basil price → $4.15/bunch")

  const soupPrep = await db.preparation.findUnique({ where: { name: "Tomato Soup" } })
  const crispyChilli = await db.preparation.findUnique({ where: { name: "Crispy Chilli" } })
  if (!soupPrep || !crispyChilli) throw new Error("required preps missing")

  const existing = await db.dish.findUnique({
    where: { name_venue: { name: "Tomato Soup Burrata", venue: "BEACH_HOUSE" } },
  })
  if (existing) {
    console.log("⚠️ dish exists, skipping:", existing.id)
  } else {
    const dish = await db.dish.create({
      data: {
        name: "Tomato Soup Burrata",
        menuCategory: "LUNCH",
        venue: "BEACH_HOUSE",
        sellingPrice: 26.90,
        sellingPriceExGst: 24.4545,
        notes:
          "Currumbin winter menu. Assembly: 2x6oz ladles tomato soup + 1x6oz ladle bought-in veg stock, " +
          "1 whole burrata ball (125g), 20g crispy chilli, 10g basil. Per Chris 2026-06-12. " +
          "Selling price $26.90 is a PLACEHOLDER.",
        components: {
          create: [
            { preparationId: soupPrep.id, quantity: 355, unit: "g", sortOrder: 0 },
            { ingredientId: VEG_STOCK, quantity: 177, unit: "ml", sortOrder: 1 },
            { ingredientId: BURRATA, quantity: 1, unit: "ea", sortOrder: 2 },
            { preparationId: crispyChilli.id, quantity: 20, unit: "g", sortOrder: 3 },
            { ingredientId: BASIL, quantity: 10, unit: "g", sortOrder: 4 },
          ],
        },
      },
    })
    console.log("✅ dish Tomato Soup Burrata:", dish.id)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
