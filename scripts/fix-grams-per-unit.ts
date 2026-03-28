/**
 * One-time fix: set gramsPerUnit on COUNT ingredients so that recipes which
 * measure them by weight (g/kg) cost correctly.
 *
 * Background: COUNT ingredients (ea, bunch) have no inherent gram weight.
 * When a recipe says "20g cos lettuce" the system needs to know that 1 head
 * of cos lettuce ≈ 300g, otherwise it calculates 20 × $2.10 = $42 instead of
 * (20/300) × $2.10 = $0.14.
 *
 * Usage:  npx tsx scripts/fix-grams-per-unit.ts
 *
 * Safe to re-run — it only updates where the name matches (case-insensitive
 * substring) and skips anything it can't find.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// Known weights per unit for common COUNT ingredients at Tarte Kitchen.
// Add more rows here as needed — name matching is case-insensitive substring.
const GRAMS_PER_UNIT: Array<{ nameContains: string; gramsPerUnit: number; note: string }> = [
  { nameContains: "avocado",           gramsPerUnit: 200,  note: "1 ea ≈ 200g (flesh + skin + seed)" },
  { nameContains: "cos lettuce",       gramsPerUnit: 300,  note: "1 head ≈ 300g" },
  { nameContains: "lime",              gramsPerUnit: 50,   note: "1 ea ≈ 50g" },
  { nameContains: "lemon",             gramsPerUnit: 80,   note: "1 ea ≈ 80g" },
  { nameContains: "flat parsley",      gramsPerUnit: 30,   note: "1 bunch ≈ 30g" },
  { nameContains: "watercress",        gramsPerUnit: 70,   note: "1 bunch ≈ 70g" },
  { nameContains: "gc eggs",           gramsPerUnit: 60,   note: "1 ea ≈ 60g" },
  { nameContains: "eggs",              gramsPerUnit: 60,   note: "1 ea ≈ 60g" },
  { nameContains: "french onion",      gramsPerUnit: 150,  note: "1 ea ≈ 150g" },
  { nameContains: "brown onion",       gramsPerUnit: 150,  note: "1 ea ≈ 150g" },
  { nameContains: "red onion",         gramsPerUnit: 150,  note: "1 ea ≈ 150g" },
  { nameContains: "garlic",            gramsPerUnit: 5,    note: "1 clove ≈ 5g" },
  { nameContains: "tomato roma",       gramsPerUnit: 120,  note: "1 ea ≈ 120g" },
  { nameContains: "sourdough",         gramsPerUnit: 35,   note: "1 slice ≈ 35g" },
  { nameContains: "cucumber",          gramsPerUnit: 300,  note: "1 ea ≈ 300g" },
  { nameContains: "capsicum",          gramsPerUnit: 160,  note: "1 ea ≈ 160g" },
  { nameContains: "zucchini",          gramsPerUnit: 200,  note: "1 ea ≈ 200g" },
  { nameContains: "eggplant",          gramsPerUnit: 350,  note: "1 ea ≈ 350g" },
  { nameContains: "broccolini",        gramsPerUnit: 200,  note: "1 bunch ≈ 200g" },
  { nameContains: "basil",             gramsPerUnit: 20,   note: "1 bunch ≈ 20g" },
  { nameContains: "coriander",         gramsPerUnit: 25,   note: "1 bunch ≈ 25g" },
  { nameContains: "mint",              gramsPerUnit: 20,   note: "1 bunch ≈ 20g" },
  { nameContains: "thyme",             gramsPerUnit: 15,   note: "1 bunch ≈ 15g" },
  { nameContains: "rosemary",          gramsPerUnit: 20,   note: "1 bunch ≈ 20g" },
  { nameContains: "chilli",            gramsPerUnit: 10,   note: "1 ea ≈ 10g" },
  { nameContains: "banana",            gramsPerUnit: 120,  note: "1 ea ≈ 120g" },
  { nameContains: "orange",            gramsPerUnit: 150,  note: "1 ea ≈ 150g" },
  { nameContains: "grapefruit",        gramsPerUnit: 200,  note: "1 ea ≈ 200g" },
  { nameContains: "mandarin",          gramsPerUnit: 75,   note: "1 ea ≈ 75g" },
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  console.log("🔍  Fetching COUNT ingredients...")
  const ingredients = await db.ingredient.findMany({
    where: { baseUnitType: "COUNT" },
    select: { id: true, name: true, gramsPerUnit: true },
    orderBy: { name: "asc" },
  })

  console.log(`   Found ${ingredients.length} COUNT ingredient(s).\n`)

  let updated = 0
  let skipped = 0

  for (const ing of ingredients) {
    const match = GRAMS_PER_UNIT.find((row) =>
      ing.name.toLowerCase().includes(row.nameContains.toLowerCase())
    )

    if (!match) {
      // Only warn if gramsPerUnit is not already set
      if (!ing.gramsPerUnit) {
        console.log(`⚠️   No rule for "${ing.name}" — skipping (you may want to add it manually)`)
      }
      skipped++
      continue
    }

    await db.ingredient.update({
      where: { id: ing.id },
      data: { gramsPerUnit: match.gramsPerUnit },
    })

    console.log(`✅  "${ing.name}" → ${match.gramsPerUnit}g/unit  (${match.note})`)
    updated++
  }

  console.log(`\n📊  Done. Updated: ${updated}  |  Skipped/no match: ${skipped}`)

  // Trigger full recalculation cascade via raw SQL is not possible here,
  // so print a reminder to use the in-app "Recalculate All Costs" button.
  console.log("\n⚡️  Next step: open the Tarte Kitchen app and click")
  console.log('   "Recalculate All Costs" on the Dishes or Preparations page')
  console.log("   to propagate the corrected costs through all recipes.\n")

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
