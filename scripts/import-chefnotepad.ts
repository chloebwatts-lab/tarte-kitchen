/**
 * Import Chef Notepad CSV exports into Tarte Kitchen
 *
 * Usage:  npx tsx scripts/import-chefnotepad.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { readFileSync } from "fs"
import { resolve } from "path"
import Decimal from "decimal.js"

// ── CSV Parser (handles quoted fields with commas) ──────────────
function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split("\n").filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = parseLine(lines[0])
  return lines.slice(1).map((line) => {
    const vals = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h.trim()] = (vals[i] ?? "").trim()))
    return row
  })
}

function parseLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ── Category Mappings ───────────────────────────────────────────
const INGREDIENT_CATEGORY_MAP: Record<string, string> = {
  Alcohol: "OTHER",
  Bakery: "BAKERY",
  Bread: "BREAD",
  Cheese: "CHEESE",
  Chocolate: "DRY_GOOD",
  Condiment: "CONDIMENT",
  Consumable: "OTHER",
  "Cured Meat": "MEAT",
  Dairy: "DAIRY",
  "Dry Fruit": "DRY_GOOD",
  "Dry Good": "DRY_GOOD",
  Egg: "EGG",
  Flour: "FLOUR",
  Flower: "HERB",
  "Fresh Nut": "DRY_GOOD",
  Frozen: "FROZEN",
  Fruit: "FRUIT",
  Grain: "GRAIN",
  "Grains/ Seeds": "GRAIN",
  Herb: "HERB",
  "Ice Cream": "FROZEN",
  Meat: "MEAT",
  Mushroom: "MUSHROOM",
  Nuts: "DRY_GOOD",
  Oil: "OIL",
  Salad: "SALAD",
  Seafood: "SEAFOOD",
  Spices: "SPICE",
  Sugar: "DRY_GOOD",
  Vegetable: "VEGETABLE",
  Vinegar: "VINEGAR",
  // Parsing artifacts from CSV
  bag: "OTHER",
  g: "OTHER",
}

const PREP_CATEGORY_MAP: Record<string, string> = {
  Sauce: "SAUCE",
  Dressing: "DRESSING",
  Jam: "PRESERVED",
  Pastry: "PASTRY",
  "Kitchen Recipe": "COMPONENT",
  Salad: "COMPONENT",
  Side: "COMPONENT",
  Sandwich: "COMPONENT",
  Lunch: "COMPONENT",
  Starter: "COMPONENT",
  Main: "COMPONENT",
  Burger: "COMPONENT",
  Breakfast: "COMPONENT",
  Appetiser: "COMPONENT",
  Dessert: "COMPONENT",
  Drinks: "COMPONENT",
  Other: "OTHER",
}

const DISH_CATEGORY_MAP: Record<string, string> = {
  Breakfast: "BREAKFAST",
  Starter: "BREAKFAST",
  Appetiser: "BREAKFAST",
  Main: "LUNCH",
  Lunch: "LUNCH",
  Burger: "LUNCH",
  Sandwich: "LUNCH",
  Salad: "LUNCH",
  Side: "SIDES",
  Dessert: "DESSERT",
  Drinks: "DRINKS",
  "Kitchen Recipe": "OTHER",
  Pastry: "OTHER",
  Sauce: "OTHER",
  Dressing: "OTHER",
  Jam: "OTHER",
  Other: "OTHER",
}

// ── Unit Mapping ────────────────────────────────────────────────
type UnitInfo = {
  baseUnitType: "WEIGHT" | "VOLUME" | "COUNT"
  baseUnitsPerPurchase: (qty: number) => number
}

const UNIT_MAP: Record<string, UnitInfo> = {
  g: { baseUnitType: "WEIGHT", baseUnitsPerPurchase: (qty) => qty },
  kg: { baseUnitType: "WEIGHT", baseUnitsPerPurchase: (qty) => qty * 1000 },
  ml: { baseUnitType: "VOLUME", baseUnitsPerPurchase: (qty) => qty },
  L: { baseUnitType: "VOLUME", baseUnitsPerPurchase: (qty) => qty * 1000 },
  dozen: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty * 12 },
  ea: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  piece: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  // Ambiguous units → COUNT, 1 per purchase (user can refine)
  bag: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  bottle: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  box: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  bunch: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  carton: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  container: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  jar: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  packet: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  punnet: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  tin: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  tray: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
  tub: { baseUnitType: "COUNT", baseUnitsPerPurchase: (qty) => qty },
}

// ── Main Import ─────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  const ingredientsCsv = readFileSync(
    "/Users/chris/Downloads/Ingredient_List_2026_03_26_07_36_47.csv",
    "utf-8"
  )
  const recipesCsv = readFileSync(
    "/Users/chris/Downloads/Recipe_List_2026_03_26_07_36_33.csv",
    "utf-8"
  )

  const ingredients = parseCSV(ingredientsCsv)
  const recipes = parseCSV(recipesCsv)

  console.log(`Parsed ${ingredients.length} ingredients, ${recipes.length} recipes`)

  // ── Clear existing data (reverse dependency order) ──────────
  console.log("Clearing existing data...")
  await db.dishComponent.deleteMany()
  await db.dish.deleteMany()
  await db.preparationItem.deleteMany()
  await db.preparation.deleteMany()
  await db.priceHistory.deleteMany()
  await db.supplierPrice.deleteMany()
  await db.ingredient.deleteMany()
  await db.supplier.deleteMany()
  console.log("Done.")

  // ── Create Suppliers ────────────────────────────────────────
  const supplierNames = [
    ...new Set(
      ingredients
        .map((r) => r["Supplier"])
        .filter((s) => s && s !== "")
    ),
  ]

  console.log(`Creating ${supplierNames.length} suppliers...`)
  const supplierMap: Record<string, string> = {}
  for (const name of supplierNames) {
    const s = await db.supplier.create({ data: { name } })
    supplierMap[name] = s.id
  }

  // ── Import Ingredients ──────────────────────────────────────
  console.log(`Importing ${ingredients.length} ingredients...`)
  let created = 0
  let skipped = 0
  const seenNames = new Set<string>()

  for (const row of ingredients) {
    const name = row["Ingredient Name"]
    if (!name) { skipped++; continue }

    // Dedupe by name (some have multiple entries)
    const key = name.toLowerCase().trim()
    if (seenNames.has(key)) { skipped++; continue }
    seenNames.add(key)

    const price = parseFloat(row["Price"] || "0")
    const qty = parseFloat(row["Quantity"] || "1") || 1
    const unit = row["Unit"] || "ea"
    const category = INGREDIENT_CATEGORY_MAP[row["Category"]] || "OTHER"
    const supplierName = row["Supplier"]
    const supplierCode = row["Supplier Product Code"] || null

    const unitInfo = UNIT_MAP[unit] || UNIT_MAP["ea"]
    const baseUnits = unitInfo.baseUnitsPerPurchase(qty)

    try {
      await db.ingredient.create({
        data: {
          name,
          category: category as any,
          baseUnitType: unitInfo.baseUnitType as any,
          purchaseQuantity: String(qty),
          purchaseUnit: unit,
          purchasePrice: String(price),
          baseUnitsPerPurchase: String(baseUnits),
          wastePercentage: "0",
          ...(supplierName && supplierMap[supplierName]
            ? { supplierId: supplierMap[supplierName], supplierProductCode: supplierCode }
            : {}),
        },
      })
      created++
    } catch (e: any) {
      console.warn(`  ⚠ Skipped "${name}": ${e.message?.slice(0, 80)}`)
      skipped++
    }
  }

  console.log(`  ✓ ${created} ingredients created, ${skipped} skipped`)

  // ── Import Recipes ──────────────────────────────────────────
  // Split into Preparations (selling price = 0) vs Dishes (selling price > 0)
  const preps = recipes.filter(
    (r) => !r["Selling Price"] || parseFloat(r["Selling Price"]) === 0
  )
  const dishes = recipes.filter(
    (r) => r["Selling Price"] && parseFloat(r["Selling Price"]) > 0
  )

  console.log(
    `Importing ${preps.length} preparations and ${dishes.length} dishes...`
  )

  // ── Preparations ────────────────────────────────────────────
  let prepCreated = 0
  const seenPreps = new Set<string>()
  for (const row of preps) {
    const name = row["Recipe Name"]?.trim()
    if (!name || seenPreps.has(name.toLowerCase())) continue
    seenPreps.add(name.toLowerCase())

    const batchCost = parseFloat(row["Recipe Cost"] || "0")
    const category = PREP_CATEGORY_MAP[row["Category"]] || "OTHER"

    try {
      await db.preparation.create({
        data: {
          name,
          category: category as any,
          yieldQuantity: "1",
          yieldUnit: "batch",
          yieldWeightGrams: "1000", // placeholder — user can update
          batchCost: String(batchCost),
          costPerGram: String(new Decimal(batchCost).div(1000).toFixed(6)),
          costPerServe: String(batchCost),
        },
      })
      prepCreated++
    } catch (e: any) {
      console.warn(`  ⚠ Skipped prep "${name}": ${e.message?.slice(0, 80)}`)
    }
  }
  console.log(`  ✓ ${prepCreated} preparations created`)

  // ── Dishes ──────────────────────────────────────────────────
  let dishCreated = 0
  const seenDishes = new Set<string>()
  for (const row of dishes) {
    const name = row["Recipe Name"]?.trim()
    if (!name || seenDishes.has(name.toLowerCase())) continue
    seenDishes.add(name.toLowerCase())

    const totalCost = parseFloat(row["Recipe Cost"] || "0")
    const sellingPrice = parseFloat(row["Selling Price"] || "0")
    const sellingPriceExGst = new Decimal(sellingPrice).div(1.1)
    const foodCostPct = sellingPriceExGst.gt(0)
      ? new Decimal(totalCost).div(sellingPriceExGst).mul(100)
      : new Decimal(0)
    const grossProfit = sellingPriceExGst.minus(totalCost)
    const category = DISH_CATEGORY_MAP[row["Category"]] || "OTHER"

    try {
      await db.dish.create({
        data: {
          name,
          menuCategory: category as any,
          venue: "BOTH",
          sellingPrice: String(sellingPrice),
          sellingPriceExGst: sellingPriceExGst.toFixed(2),
          totalCost: String(totalCost),
          foodCostPercentage: foodCostPct.toFixed(2),
          grossProfit: grossProfit.toFixed(2),
        },
      })
      dishCreated++
    } catch (e: any) {
      console.warn(`  ⚠ Skipped dish "${name}": ${e.message?.slice(0, 80)}`)
    }
  }
  console.log(`  ✓ ${dishCreated} dishes created`)

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n═══ Import Complete ═══")
  console.log(`  Suppliers:    ${supplierNames.length}`)
  console.log(`  Ingredients:  ${created}`)
  console.log(`  Preparations: ${prepCreated}`)
  console.log(`  Dishes:       ${dishCreated}`)
  console.log(
    "\nNote: Recipes imported as shells (cost only, no ingredient breakdown)."
  )
  console.log(
    "You can add ingredient lists to each recipe in the app."
  )
  console.log(
    "Ambiguous units (bag, bunch, carton, etc.) imported as COUNT — refine in app."
  )

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
