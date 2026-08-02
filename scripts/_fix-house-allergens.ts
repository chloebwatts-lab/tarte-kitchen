// Targeted corrections from Chris's recipe knowledge. Dry-run unless --commit.
// These intentionally OVERWRITE (Muesli +sulphite; Puffed Grain rice = none).
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const COMMIT = process.argv.includes("--commit")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

// name -> final allergens (rolled up from house recipes)
const FIX: Record<string, string[]> = {
  "BBQ sauce": ["FISH", "SOY", "WHEAT", "GLUTEN"],          // house BBQ = Worcestershire + soy sauce
  "Hangover Sauce": ["EGG", "FISH", "SOY", "WHEAT", "GLUTEN"], // sriracha + Kewpie + BBQ
  "Muesli Tarte": ["TREE_NUT", "GLUTEN", "SULPHITE"],       // granola: nuts + oats + dried fruit (sulphite)
  "Puffed Grain": [],                                       // it's puffed RICE -> no allergens
}

async function main() {
  for (const [name, allergens] of Object.entries(FIX)) {
    const ing = await db.ingredient.findFirst({ where: { name }, select: { id: true, allergens: true } })
    if (!ing) { console.log(`?? not found: ${name}`); continue }
    console.log(`${name}: ${ing.allergens.join(",")||"(empty)"}  ->  ${allergens.join(",")||"(none)"}`)
    if (COMMIT) await db.ingredient.update({ where: { id: ing.id }, data: { allergens: allergens as any } })
  }
  console.log(COMMIT ? "\nCOMMITTED." : "\n(dry run)")
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
