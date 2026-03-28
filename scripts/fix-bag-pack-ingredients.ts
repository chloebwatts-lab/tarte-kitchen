/**
 * One-time fix: correct ingredients imported as COUNT (bag/bottle/etc.) that
 * should be WEIGHT or VOLUME with the correct baseUnitsPerPurchase value.
 *
 * The original import mapped all ambiguous units (bag, bottle, carton, etc.)
 * to COUNT with baseUnitsPerPurchase = qty (usually 1). This causes massive
 * cost errors: e.g. 1980g flour × $17.82/ea = $35,283 instead of $1.41.
 *
 * This script:
 *  1. Finds all COUNT ingredients with a packaging purchase unit
 *  2. Matches them against the FIXES table (case-insensitive name substring)
 *  3. Updates baseUnitType + baseUnitsPerPurchase for matched rows
 *  4. Logs unmatched rows so they can be fixed manually in the app
 *
 * Usage:  npx tsx scripts/fix-bag-pack-ingredients.ts
 *
 * Safe to re-run — only updates where a FIXES rule matches.
 * After running, click "Recalculate All Costs" in the app.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

type Fix = {
  nameContains: string
  baseUnitType: "WEIGHT" | "VOLUME"
  gramsOrMl: number   // total grams (for WEIGHT) or ml (for VOLUME) per purchase
  note: string
}

/**
 * Known packaging sizes for Tarte Kitchen ingredients.
 * nameContains is matched case-insensitively anywhere in the ingredient name.
 * Add more rows here — more specific names should appear BEFORE generic ones.
 */
const FIXES: Fix[] = [
  // ── Flours ──────────────────────────────────────────────────────────────
  { nameContains: "plain flour",        baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "self raising flour", baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "self-raising flour", baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "bread flour",        baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "bakers flour",       baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "baker's flour",      baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "cake flour",         baseUnitType: "WEIGHT", gramsOrMl:  5000, note: "5kg bag" },
  { nameContains: "almond meal",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "almond flour",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "hazelnut meal",      baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "cornflour",          baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "corn starch",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "rice flour",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "flour",              baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag (generic flour)" },

  // ── Sugars ───────────────────────────────────────────────────────────────
  { nameContains: "icing sugar",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "icing mixture",      baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "caster sugar",       baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "castor sugar",       baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "brown sugar",        baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "raw sugar",          baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "white sugar",        baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "demerara sugar",     baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "sugar",              baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag (generic sugar)" },

  // ── Leaveners / Baking ───────────────────────────────────────────────────
  { nameContains: "baking powder",      baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "bicarbonate",        baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "bicarb soda",        baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "baking soda",        baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "cream of tartar",    baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "yeast",              baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },

  // ── Cocoa / Chocolate ────────────────────────────────────────────────────
  { nameContains: "cocoa powder",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "drinking chocolate", baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "chocolate chip",     baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "chocolate button",   baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "chocolate callet",   baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },

  // ── Nuts / Seeds / Dried Fruit ───────────────────────────────────────────
  { nameContains: "desiccated coconut", baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "shredded coconut",   baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "poppy seed",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "sesame seed",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "pine nut",           baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "walnut",             baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "pecan",              baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "pistachio",          baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "pumpkin seed",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "sunflower seed",     baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "rolled oat",         baseUnitType: "WEIGHT", gramsOrMl:  5000, note: "5kg bag" },
  { nameContains: "granola",            baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "raisin",             baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "sultana",            baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "dried cranberry",    baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "dried blueberry",    baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "medjool date",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "date",               baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },

  // ── Salt ─────────────────────────────────────────────────────────────────
  { nameContains: "sea salt flake",     baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag (Maldon-style)" },
  { nameContains: "sea salt",           baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "rock salt",          baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "table salt",         baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag" },
  { nameContains: "salt",               baseUnitType: "WEIGHT", gramsOrMl: 25000, note: "25kg bag (generic salt)" },

  // ── Spices (small bags/bottles typically 50–100g) ────────────────────────
  { nameContains: "cinnamon",           baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "paprika",            baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "cumin",              baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "turmeric",           baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "cardamom",           baseUnitType: "WEIGHT", gramsOrMl:   100, note: "100g bag" },
  { nameContains: "star anise",         baseUnitType: "WEIGHT", gramsOrMl:   100, note: "100g bag" },
  { nameContains: "clove",              baseUnitType: "WEIGHT", gramsOrMl:   100, note: "100g bag" },
  { nameContains: "nutmeg",             baseUnitType: "WEIGHT", gramsOrMl:   100, note: "100g bag" },
  { nameContains: "sumac",              baseUnitType: "WEIGHT", gramsOrMl:   200, note: "200g bag" },
  { nameContains: "za'atar",            baseUnitType: "WEIGHT", gramsOrMl:   200, note: "200g bag" },
  { nameContains: "zaatar",             baseUnitType: "WEIGHT", gramsOrMl:   200, note: "200g bag" },
  { nameContains: "harissa",            baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag/tin" },
  { nameContains: "dukkah",             baseUnitType: "WEIGHT", gramsOrMl:   250, note: "250g bag" },
  { nameContains: "toasted rice powder",baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },
  { nameContains: "rice powder",        baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g bag" },

  // ── Dairy (tubs / bottles) ───────────────────────────────────────────────
  { nameContains: "double cream",       baseUnitType: "VOLUME", gramsOrMl:  1000, note: "1L tub" },
  { nameContains: "sour cream",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "creme fraiche",      baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g tub" },
  { nameContains: "crème fraîche",      baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g tub" },
  { nameContains: "greek yoghurt",      baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "greek yogurt",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "yoghurt",            baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "yogurt",             baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "mascarpone",         baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g tub" },
  { nameContains: "ricotta",            baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "labneh",             baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g tub" },
  { nameContains: "clotted cream",      baseUnitType: "WEIGHT", gramsOrMl:   227, note: "227g jar" },
  { nameContains: "milk",               baseUnitType: "VOLUME", gramsOrMl:  2000, note: "2L bottle" },

  // ── Condiments / Sauces (bottles / jars) ─────────────────────────────────
  { nameContains: "soy sauce",          baseUnitType: "VOLUME", gramsOrMl:  1800, note: "1.8L bottle" },
  { nameContains: "fish sauce",         baseUnitType: "VOLUME", gramsOrMl:   700, note: "700ml bottle" },
  { nameContains: "oyster sauce",       baseUnitType: "VOLUME", gramsOrMl:  2270, note: "2.27L bottle" },
  { nameContains: "hoisin",             baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml jar" },
  { nameContains: "sriracha",           baseUnitType: "VOLUME", gramsOrMl:   700, note: "700ml bottle" },
  { nameContains: "tabasco",            baseUnitType: "VOLUME", gramsOrMl:   150, note: "150ml bottle" },
  { nameContains: "worcestershire",     baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml bottle" },
  { nameContains: "ketchup",            baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bottle" },
  { nameContains: "tomato sauce",       baseUnitType: "WEIGHT", gramsOrMl:  2200, note: "2.2kg bottle" },
  { nameContains: "tomato paste",       baseUnitType: "WEIGHT", gramsOrMl:  3000, note: "3kg tin" },
  { nameContains: "tomato puree",       baseUnitType: "WEIGHT", gramsOrMl:  2200, note: "2.2kg tin" },
  { nameContains: "dijon mustard",      baseUnitType: "WEIGHT", gramsOrMl:   370, note: "370g jar" },
  { nameContains: "wholegrain mustard", baseUnitType: "WEIGHT", gramsOrMl:   370, note: "370g jar" },
  { nameContains: "mustard",            baseUnitType: "WEIGHT", gramsOrMl:   370, note: "370g jar" },
  { nameContains: "mayonnaise",         baseUnitType: "WEIGHT", gramsOrMl:  4000, note: "4kg tub" },
  { nameContains: "aioli",              baseUnitType: "WEIGHT", gramsOrMl:  2000, note: "2kg tub" },
  { nameContains: "tahini",             baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g jar" },
  { nameContains: "hummus",             baseUnitType: "WEIGHT", gramsOrMl:  2000, note: "2kg tub" },
  { nameContains: "pesto",              baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g jar" },
  { nameContains: "jam",                baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g jar" },
  { nameContains: "honey",              baseUnitType: "WEIGHT", gramsOrMl:  3000, note: "3kg tub" },
  { nameContains: "maple syrup",        baseUnitType: "VOLUME", gramsOrMl:  1000, note: "1L bottle" },
  { nameContains: "vanilla extract",    baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml bottle" },
  { nameContains: "vanilla bean paste", baseUnitType: "VOLUME", gramsOrMl:   200, note: "200ml jar" },
  { nameContains: "miso paste",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "miso",               baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg tub" },
  { nameContains: "sambal",             baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g jar" },
  { nameContains: "nam jim",            baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml bottle" },
  { nameContains: "ketjap",             baseUnitType: "VOLUME", gramsOrMl:   600, note: "600ml bottle" },
  { nameContains: "coconut cream",      baseUnitType: "VOLUME", gramsOrMl:   400, note: "400ml tin" },
  { nameContains: "coconut milk",       baseUnitType: "VOLUME", gramsOrMl:   400, note: "400ml tin" },
  { nameContains: "lemon curd",         baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g jar" },

  // ── Oils / Vinegars (bottles) ────────────────────────────────────────────
  { nameContains: "olive oil",          baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "vegetable oil",      baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "canola oil",         baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "rice bran oil",      baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "sesame oil",         baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml bottle" },
  { nameContains: "truffle oil",        baseUnitType: "VOLUME", gramsOrMl:   250, note: "250ml bottle" },
  { nameContains: "white wine vinegar", baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "red wine vinegar",   baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "balsamic vinegar",   baseUnitType: "VOLUME", gramsOrMl:   500, note: "500ml bottle" },
  { nameContains: "rice wine vinegar",  baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },
  { nameContains: "apple cider vinegar",baseUnitType: "VOLUME", gramsOrMl:  5000, note: "5L bottle" },

  // ── Meat (cartons / bags) ────────────────────────────────────────────────
  { nameContains: "streaky bacon",      baseUnitType: "WEIGHT", gramsOrMl:  2000, note: "2kg pack" },
  { nameContains: "bacon",              baseUnitType: "WEIGHT", gramsOrMl:  2000, note: "2kg pack" },
  { nameContains: "prosciutto",         baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g pack" },
  { nameContains: "pancetta",           baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g pack" },
  { nameContains: "chorizo",            baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g pack" },
  { nameContains: "salami",             baseUnitType: "WEIGHT", gramsOrMl:   500, note: "500g pack" },
  { nameContains: "smoked salmon",      baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg pack" },
  { nameContains: "pulled pork",        baseUnitType: "WEIGHT", gramsOrMl:  2000, note: "2kg bag" },

  // ── Coffee / Beverages ───────────────────────────────────────────────────
  { nameContains: "coffee bean",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "espresso",           baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "matcha",             baseUnitType: "WEIGHT", gramsOrMl:   100, note: "100g tin/bag" },
  { nameContains: "chai",               baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },

  // ── Frozen ───────────────────────────────────────────────────────────────
  { nameContains: "frozen berry",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen blueberry",   baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen raspberry",   baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen strawberry",  baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen mango",       baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen corn",        baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "frozen pea",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },
  { nameContains: "roti canai",         baseUnitType: "WEIGHT", gramsOrMl:   800, note: "10 × 80g pack" },
  { nameContains: "hash brown",         baseUnitType: "WEIGHT", gramsOrMl:  1000, note: "1kg bag" },

  // ── Bread / Bakery (cartons) ─────────────────────────────────────────────
  { nameContains: "crumpet",            baseUnitType: "COUNT",  gramsOrMl:     6, note: "6-pack (treated as COUNT ea)" },
  { nameContains: "english muffin",     baseUnitType: "COUNT",  gramsOrMl:     6, note: "6-pack (treated as COUNT ea)" },
  { nameContains: "bagel",              baseUnitType: "COUNT",  gramsOrMl:     6, note: "6-pack (treated as COUNT ea)" },
]

const PACKAGING_UNITS = new Set([
  "bag", "pack", "packet", "bottle", "box", "carton",
  "tub", "container", "jar", "tin", "tray", "punnet",
])

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  console.log("🔍  Fetching COUNT ingredients with packaging purchase units…\n")

  const candidates = await db.ingredient.findMany({
    where: { baseUnitType: "COUNT" },
    select: {
      id: true, name: true,
      purchaseUnit: true, purchaseQuantity: true,
      baseUnitsPerPurchase: true,
    },
    orderBy: { name: "asc" },
  })

  const packagingCandidates = candidates.filter((i) =>
    PACKAGING_UNITS.has(i.purchaseUnit.toLowerCase())
  )

  console.log(
    `   ${candidates.length} COUNT ingredient(s) total, ` +
    `${packagingCandidates.length} use packaging units.\n`
  )

  let updated = 0
  const unmatched: string[] = []

  for (const ing of packagingCandidates) {
    const fix = FIXES.find((f) =>
      ing.name.toLowerCase().includes(f.nameContains.toLowerCase())
    )

    if (!fix) {
      unmatched.push(`  "${ing.name}" (${ing.purchaseQuantity} ${ing.purchaseUnit})`)
      continue
    }

    // For bread/bakery COUNT fixes, only update baseUnitsPerPurchase (keep COUNT)
    if (fix.baseUnitType === "COUNT") {
      await db.ingredient.update({
        where: { id: ing.id },
        data: { baseUnitsPerPurchase: String(fix.gramsOrMl) },
      })
      console.log(
        `✅  [COUNT] "${ing.name}" → baseUnitsPerPurchase=${fix.gramsOrMl}  (${fix.note})`
      )
    } else {
      await db.ingredient.update({
        where: { id: ing.id },
        data: {
          baseUnitType: fix.baseUnitType,
          baseUnitsPerPurchase: String(fix.gramsOrMl),
        },
      })
      console.log(
        `✅  [${fix.baseUnitType}] "${ing.name}" → ${fix.gramsOrMl}${fix.baseUnitType === "WEIGHT" ? "g" : "ml"}  (${fix.note})`
      )
    }
    updated++
  }

  console.log(`\n📊  Done. Updated: ${updated} | Unmatched: ${unmatched.length}\n`)

  if (unmatched.length > 0) {
    console.log("⚠️   These ingredients need manual review in the app:")
    unmatched.forEach((u) => console.log(u))
    console.log(
      "\n   For each: set the correct baseUnitType (WEIGHT/VOLUME) and baseUnitsPerPurchase"
    )
    console.log("   (total grams or ml per purchase unit).\n")
  }

  console.log("⚡️  Next step: click \"Recalculate All Costs\" in the app.\n")

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
