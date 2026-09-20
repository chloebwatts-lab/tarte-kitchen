// Plain scramble card ("Scrambled egg mix Recipe"): the card said one batch
// (9,500 g) makes 63 serves, which is 151 g a serve, but every dish plates
// 130 g (BEC Bagel, Brisket Bagel, Hash Bagel, Roti Canai; Morning After 80 g),
// as confirmed on the 17 Aug 2026 portion sheet pass.
//
// Fix: 63 serves to 73 serves (9,500 / 130 = 73.08, floored), so the card's
// serve is 130 g. Ingredients, batch weight and batch cost are untouched.
// Dishes cost this prep by the gram, so no dish cost moves; only the card's
// cost per serve ($1.71 to $1.47) and the coolroom serves calculator
// (/kitchen/serves, which reads serve size off the card) change.
//
// DRY RUN BY DEFAULT, pass --apply to write.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const APPLY = process.argv.includes("--apply")
const ID = "cmn8ccfmt00m416qz6k2vj5gt"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const p = await db.preparation.findUnique({ where: { id: ID } })
  if (!p || p.name !== "Scrambled egg mix Recipe") throw new Error("plain scramble card not found")
  const grams = Number(p.yieldWeightGrams)
  const oldQty = Number(p.yieldQuantity)
  const batch = Number(p.batchCost)
  const newQty = Math.floor(grams / 130)
  console.log(`before: ${oldQty} ${p.yieldUnit} from ${grams} g = ${(grams / oldQty).toFixed(1)} g a serve, $${(batch / oldQty).toFixed(2)} a serve (batch $${batch.toFixed(2)})`)
  console.log(`after:  ${newQty} ${p.yieldUnit} from ${grams} g = ${(grams / newQty).toFixed(1)} g a serve, $${(batch / newQty).toFixed(2)} a serve (batch $${batch.toFixed(2)})`)
  if (oldQty === newQty) { console.log("already applied"); return }
  if (oldQty !== 63 || grams !== 9500) throw new Error("card is not in the expected before state, stopping")
  if (!APPLY) { console.log("DRY RUN, nothing written"); return }
  await db.preparation.update({
    where: { id: ID },
    data: { yieldQuantity: newQty, costPerServe: Number((batch / newQty).toFixed(2)) },
  })
  console.log("written")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
