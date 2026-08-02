// Writes allergen data to ingredients. SAFETY: only fills ingredients whose
// allergens field is currently EMPTY; never overwrites existing data.
// Dry-run by default; pass --commit to actually write.
import "dotenv/config"
import { readFileSync } from "fs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const COMMIT = process.argv.includes("--commit")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

// Invoice/brand-confirmed overrides (name -> contains[]). Applied over research.
const OVERRIDE: Record<string, string[]> = {
  "Worcestershire sauce": ["FISH"],                       // GF SKU (Bidfood) - no gluten
  "Gochujang Paste": ["SOY"],                             // Daesang rice-based, no wheat
  "Mirin": [],                                            // Kikkoman Manjo - none
  "Sriracha sauce": [],                                   // A&T Trading - none
  "Pancake Mix Buttermilk": ["MILK", "EGG", "WHEAT", "GLUTEN"],   // Edlyn
  "Pancake Mix Dry - Bidfood": ["MILK", "EGG", "WHEAT", "GLUTEN"],// Edlyn (same mix)
  "Vegetable Stock - Real Campbells": [],                 // Campbell's Real - none in scope
  "Herradura Agave Nectar": [],
  "Acai Mix Scoopable - Amazonia": [],
  "Fondant Soft White": [],                               // Allied - sugar/glucose
  "St Germain Elderflower Liqueur": [],
  "Triple Sec - Vok": [],
  "Sauce Red Hot Original Buffalo Wings": [],             // Frank's - no declared
  "Malt milk powder": ["MILK", "GLUTEN"],                 // Provedores malted milk
  "Veliche Chocolate Batons": ["SOY"],                    // Batons 44% - soy lecithin
}

const ORDER = ["MILK","EGG","FISH","CRUSTACEAN","SHELLFISH","MOLLUSC","PEANUT","TREE_NUT",
  "SOY","WHEAT","GLUTEN","SESAME","LUPIN","SULPHITE"]
const srt = (xs: string[]) => ORDER.filter((a) => xs.includes(a))

async function main() {
  const final = JSON.parse(readFileSync("/tmp/allergen-final-proposals.json", "utf8"))
  // build id -> contains, applying overrides
  const toWrite: { id: string; name: string; allergens: string[] }[] = []
  for (const x of final) {
    const contains = x.name in OVERRIDE ? srt(OVERRIDE[x.name]) : x.contains
    if (contains.length > 0) toWrite.push({ id: x.id, name: x.name, allergens: contains })
  }

  // re-read current DB state to guard against overwriting non-empty fields
  const current = await db.ingredient.findMany({
    where: { id: { in: toWrite.map((t) => t.id) } },
    select: { id: true, allergens: true },
  })
  const curMap = new Map(current.map((c) => [c.id, c.allergens]))

  const willWrite = toWrite.filter((t) => (curMap.get(t.id)?.length ?? 0) === 0)
  const skipped = toWrite.filter((t) => (curMap.get(t.id)?.length ?? 0) > 0)

  console.log(`proposals with allergens: ${toWrite.length}`)
  console.log(`  will fill (currently empty): ${willWrite.length}`)
  console.log(`  SKIP (already has allergens, not overwriting): ${skipped.length}`)
  if (skipped.length) for (const s of skipped) console.log(`    skip: ${s.name}`)

  if (!COMMIT) {
    console.log("\n--- DRY RUN (no writes). Sample of what would be written: ---")
    for (const w of willWrite.slice(0, 12)) console.log(`  ${w.name} -> ${w.allergens.join(", ")}`)
    console.log(`  ... and ${Math.max(0, willWrite.length - 12)} more`)
    await db.$disconnect(); await pool.end(); return
  }

  let n = 0
  for (const w of willWrite) {
    await db.ingredient.update({ where: { id: w.id }, data: { allergens: w.allergens as any } })
    n++
  }
  console.log(`\nCOMMITTED: ${n} ingredients updated.`)
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
