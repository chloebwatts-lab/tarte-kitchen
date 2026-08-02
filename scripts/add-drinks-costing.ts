/**
 * Cost the Beach House drinks menu — bar program pass.
 * Sources:
 *   - RESTAURANT DRINKS MENU BOOK-2.pdf  (selling prices)
 *   - Beach House Cocktails Recipe (2).pdf + Tarte Market Recipes.pdf  (pour specs)
 *   - liquor-cheatsheet.html  (invoice-verified per-bottle costs)
 *
 * Pattern (matches existing Margarita / Aperol Spritz / G&T):
 *   one Preparation per cocktail/mocktail (yield 1 serve) → one DRINKS Dish at menu price.
 *   Smoothies / juices / non-alc / beer → Dishes referencing ingredients or existing preps directly.
 *
 * New ingredients:
 *   - Mr Black Coffee Liqueur 700ml — Paramount $54.90/btl (cheatsheet, invoice-verified)
 *   - St Germain Elderflower Liqueur 750ml — Paramount $51.67/btl (cheatsheet)
 *   - Macadamia Liqueur (Mac by Brookie's) 700ml — Paramount $48.40/btl (cheatsheet)
 *   - Whisky (house pour) 700ml — $50 PLACEHOLDER (no invoice found in accounts@ — VERIFY)
 *   - Tomato Juice 1L — $4.00 PLACEHOLDER (no invoice found — VERIFY)
 *
 * Additive only: creates ingredients/preps/dishes if absent, skips if present. No deletes/overwrites.
 * Run scripts/recalculate-all.ts afterwards to populate cached costs.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const VENUE = "BEACH_HOUSE" as const

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const paramount = await db.supplier.findFirst({ where: { name: { contains: "Paramount" } } })

  // ── resolve existing ingredients/preps by name ───────────────────
  const ingNames = [
    "Tequila - El Jimador Blanco", "Triple Sec - Vok", "Lime Juice",
    "Agave Syrup Senor Maguey Organic", "Gin", "Vodka", "Aperol", "De Bortoli Prosecco",
    "Lemon juice - Bottled", "Watermelon - Seedless", "Coconut cream", "Raspberry - frozen",
    "Strawberry - frozen", "Mint", "Basil", "Mango puree (frozen)", "Passionfruit Pulp",
    "Banana", "Honey - pure", "Coconut water - Cocobella", "Oat Milk - UHT Barista",
    "Vanilla bean paste", "Coffee Beans - Espresso (House)", "Franks Hot Sauce",
    "Worcestershire sauce", "Togarashi", "Pineapple", "Dry figs", "Rosemary", "Caster Sugar",
    "Water (tap)", "Acai Mix Scoopable - Amazonia", "Orange Juice - Fresh (house)",
    "Fresh Jalapeno", "Macadamia Nuts Raw pieces", "Granny smith apple",
    "Garnish - Margarita (Salt Rim + Lime Wedge)",
  ]
  const ingMap = new Map<string, string>()
  for (const n of ingNames) {
    const i = await db.ingredient.findFirst({ where: { name: n }, select: { id: true } })
    if (!i) throw new Error(`MISSING ingredient: ${n}`)
    ingMap.set(n, i.id)
  }
  const I = (n: string) => { const id = ingMap.get(n); if (!id) throw new Error(`no ing ${n}`); return id }

  const prepNames = [
    "Margarita", "Sugar Syrup", "Raspberry Jam - 1 Batch", "Maple Bacon", "Iced Tea Batch",
    "Lemonade - Old Fashioned", "House Granola", "Corona", "Peroni", "Great Northern SC",
    "Stone and Wood Pacific Ale",
  ]
  const prepMap = new Map<string, string>()
  for (const n of prepNames) {
    const p = await db.preparation.findUnique({ where: { name: n }, select: { id: true } })
    if (!p) throw new Error(`MISSING prep: ${n}`)
    prepMap.set(n, p.id)
  }
  const P = (n: string) => { const id = prepMap.get(n); if (!id) throw new Error(`no prep ${n}`); return id }

  // ── new ingredients ──────────────────────────────────────────────
  async function upsertIng(name: string, qty: number, unit: string, price: number, base: number, notes: string) {
    const existing = await db.ingredient.findFirst({ where: { name } })
    if (existing) { ingMap.set(name, existing.id); console.log(`  · ingredient exists: ${name}`); return existing.id }
    const created = await db.ingredient.create({
      data: {
        name, category: "OTHER", baseUnitType: "VOLUME",
        supplierId: paramount?.id ?? null, purchaseQuantity: qty, purchaseUnit: unit,
        purchasePrice: price, baseUnitsPerPurchase: base, wastePercentage: 0, notes,
      },
    })
    ingMap.set(name, created.id); console.log(`  ✅ ingredient: ${name} ($${price}/${qty}${unit})`); return created.id
  }
  console.log("\n── ingredients ──")
  await upsertIng("Mr Black Coffee Liqueur", 700, "ml", 54.90, 700, "Paramount $54.90/700ml — liquor cheatsheet, invoice-verified 2026-06.")
  await upsertIng("St Germain Elderflower Liqueur", 750, "ml", 51.67, 750, "Paramount $51.67/750ml — liquor cheatsheet, invoice-verified 2026-06.")
  await upsertIng("Macadamia Liqueur (Mac by Brookie's)", 700, "ml", 48.40, 700, "Mac by Brookie's Macadamia Gin (Wattles) — Paramount $48.40/700ml — liquor cheatsheet.")
  await upsertIng("Whisky (house pour)", 700, "ml", 50.00, 700, "PLACEHOLDER $50/700ml — no invoice found in accounts@ mailbox. VERIFY actual bottle/price.")
  await upsertIng("Tomato Juice", 1000, "ml", 4.00, 1000, "PLACEHOLDER $4.00/1L — no invoice found in accounts@ mailbox. VERIFY brand/price.")

  // ── new prep: Fig & Rosemary Syrup ───────────────────────────────
  console.log("\n── preparations ──")
  async function upsertPrep(name: string, category: any, yieldQuantity: number, yieldUnit: string, yieldWeightGrams: number, method: string, items: Array<{ing?: string, prep?: string, quantity: number, unit: string}>) {
    const existing = await db.preparation.findUnique({ where: { name } })
    if (existing) { prepMap.set(name, existing.id); console.log(`  · prep exists: ${name}`); return existing.id }
    const created = await db.preparation.create({
      data: {
        name, category, yieldQuantity, yieldUnit, yieldWeightGrams, method,
        items: { create: items.map((it, idx) => ({
          ingredientId: it.ing ? I(it.ing) : undefined,
          subPreparationId: it.prep ? P(it.prep) : undefined,
          quantity: it.quantity, unit: it.unit, sortOrder: idx,
        })) },
      },
    })
    prepMap.set(name, created.id); console.log(`  ✅ prep: ${name}`); return created.id
  }

  await upsertPrep("Fig & Rosemary Syrup", "BASE", 1000, "ml", 1000,
    "Simmer dry figs + rosemary in sugar syrup, infuse, strain. Yield ~1L.", [
      { ing: "Dry figs", quantity: 150, unit: "g" },
      { ing: "Rosemary", quantity: 30, unit: "g" },
      { ing: "Caster Sugar", quantity: 500, unit: "g" },
      { ing: "Water (tap)", quantity: 700, unit: "ml" },
    ])

  // cocktail serve-preps (yield 1 serve)
  const SERVE: Record<string, { method: string, items: Array<{ing?: string, prep?: string, quantity: number, unit: string}> }> = {
    "Spicy Margarita": { method: "Shake tequila, triple sec, lime, agave with muddled watermelon + jalapeno. Salt/togarashi rim.", items: [
      { ing: "Tequila - El Jimador Blanco", quantity: 45, unit: "ml" }, { ing: "Triple Sec - Vok", quantity: 15, unit: "ml" },
      { ing: "Lime Juice", quantity: 30, unit: "ml" }, { ing: "Agave Syrup Senor Maguey Organic", quantity: 10, unit: "ml" },
      { ing: "Watermelon - Seedless", quantity: 40, unit: "g" }, { ing: "Fresh Jalapeno", quantity: 5, unit: "g" },
      { ing: "Garnish - Margarita (Salt Rim + Lime Wedge)", quantity: 1, unit: "ea" } ] },
    "Pink Coco Marg": { method: "Classic margarita + raspberry, watermelon, coconut cream.", items: [
      { ing: "Tequila - El Jimador Blanco", quantity: 45, unit: "ml" }, { ing: "Triple Sec - Vok", quantity: 15, unit: "ml" },
      { ing: "Lime Juice", quantity: 30, unit: "ml" }, { ing: "Agave Syrup Senor Maguey Organic", quantity: 10, unit: "ml" },
      { ing: "Coconut cream", quantity: 20, unit: "ml" }, { ing: "Raspberry - frozen", quantity: 25, unit: "g" },
      { ing: "Watermelon - Seedless", quantity: 25, unit: "g" }, { ing: "Garnish - Margarita (Salt Rim + Lime Wedge)", quantity: 1, unit: "ea" } ] },
    "Strawberry Spritz": { method: "Strawberry, mint, basil muddled; St Germain + prosecco, top.", items: [
      { ing: "St Germain Elderflower Liqueur", quantity: 30, unit: "ml" }, { ing: "De Bortoli Prosecco", quantity: 90, unit: "ml" },
      { ing: "Lemon juice - Bottled", quantity: 15, unit: "ml" }, { ing: "Strawberry - frozen", quantity: 40, unit: "g" },
      { ing: "Mint", quantity: 3, unit: "g" }, { ing: "Basil", quantity: 2, unit: "g" } ] },
    "Jam Gimlet": { method: "Shake gin, house raspberry jam, lemon. Double strain.", items: [
      { ing: "Gin", quantity: 45, unit: "ml" }, { ing: "Lemon juice - Bottled", quantity: 30, unit: "ml" },
      { prep: "Raspberry Jam - 1 Batch", quantity: 20, unit: "g" } ] },
    "Maca Espresso": { method: "Shake Mr Black, macadamia liqueur, espresso, sugar syrup. Macadamia praline garnish.", items: [
      { ing: "Mr Black Coffee Liqueur", quantity: 30, unit: "ml" }, { ing: "Macadamia Liqueur (Mac by Brookie's)", quantity: 30, unit: "ml" },
      { prep: "Sugar Syrup", quantity: 15, unit: "ml" }, { ing: "Coffee Beans - Espresso (House)", quantity: 9, unit: "g" },
      { ing: "Macadamia Nuts Raw pieces", quantity: 5, unit: "g" } ] },
    "Fig Whisky Sour": { method: "Shake whisky, fig & rosemary syrup, lemon; dry-shake foam.", items: [
      { ing: "Whisky (house pour)", quantity: 45, unit: "ml" }, { prep: "Fig & Rosemary Syrup", quantity: 15, unit: "ml" },
      { ing: "Lemon juice - Bottled", quantity: 30, unit: "ml" } ] },
    "Breakfast Mary": { method: "Tarte bloody mary — build over ice, maple bacon garnish.", items: [
      { ing: "Tomato Juice", quantity: 200, unit: "ml" }, { ing: "Vodka", quantity: 45, unit: "ml" },
      { ing: "Franks Hot Sauce", quantity: 20, unit: "ml" }, { prep: "Sugar Syrup", quantity: 15, unit: "ml" },
      { ing: "Worcestershire sauce", quantity: 10, unit: "ml" }, { ing: "Lemon juice - Bottled", quantity: 15, unit: "ml" },
      { ing: "Togarashi", quantity: 2, unit: "g" }, { prep: "Maple Bacon", quantity: 0.3, unit: "serve" } ] },
    "Grande Mimosa": { method: "Prosecco topped with fresh orange juice.", items: [
      { ing: "De Bortoli Prosecco", quantity: 90, unit: "ml" }, { ing: "Orange Juice - Fresh (house)", quantity: 60, unit: "ml" } ] },
    "Hard Arnold Palmer": { method: "Vodka over ice, half iced tea / half lemonade.", items: [
      { ing: "Vodka", quantity: 45, unit: "ml" }, { prep: "Iced Tea Batch", quantity: 0.5, unit: "serve" },
      { prep: "Lemonade - Old Fashioned", quantity: 0.5, unit: "serve" } ] },
    "Hard Old Fashioned Lemonade": { method: "Vodka topped with house old-fashioned lemonade.", items: [
      { ing: "Vodka", quantity: 45, unit: "ml" }, { prep: "Lemonade - Old Fashioned", quantity: 1, unit: "serve" } ] },
    "Splice (Mocktail)": { method: "Pineapple, coconut cream, vanilla bean, lime — shaken.", items: [
      { ing: "Pineapple", quantity: 80, unit: "g" }, { ing: "Coconut cream", quantity: 30, unit: "ml" },
      { ing: "Vanilla bean paste", quantity: 3, unit: "g" }, { ing: "Lime Juice", quantity: 15, unit: "ml" } ] },
    "Spicy Watermelon (Mocktail)": { method: "Watermelon, jalapeno, togarashi, soda, lime.", items: [
      { ing: "Watermelon - Seedless", quantity: 150, unit: "g" }, { ing: "Fresh Jalapeno", quantity: 5, unit: "g" },
      { ing: "Togarashi", quantity: 1, unit: "g" }, { ing: "Lime Juice", quantity: 20, unit: "ml" } ] },
    "Virgin Mary (Mocktail)": { method: "Breakfast Mary without vodka.", items: [
      { ing: "Tomato Juice", quantity: 200, unit: "ml" }, { ing: "Franks Hot Sauce", quantity: 20, unit: "ml" },
      { prep: "Sugar Syrup", quantity: 15, unit: "ml" }, { ing: "Worcestershire sauce", quantity: 10, unit: "ml" },
      { ing: "Lemon juice - Bottled", quantity: 15, unit: "ml" }, { ing: "Togarashi", quantity: 2, unit: "g" },
      { prep: "Maple Bacon", quantity: 0.3, unit: "serve" } ] },
  }
  for (const [name, def] of Object.entries(SERVE)) {
    await upsertPrep(name, "COMPONENT", 1, "serve", 0, def.method, def.items)
  }

  // ── dishes ───────────────────────────────────────────────────────
  console.log("\n── dishes ──")
  async function upsertDish(name: string, price: number, comps: Array<{ing?: string, prep?: string, quantity: number, unit: string}>, notes: string) {
    const existing = await db.dish.findUnique({ where: { name_venue: { name, venue: VENUE } } })
    if (existing) { console.log(`  · dish exists: ${name}`); return }
    await db.dish.create({
      data: {
        name, menuCategory: "DRINKS", venue: VENUE,
        sellingPrice: price, sellingPriceExGst: Number((price / 1.1).toFixed(4)), notes,
        components: { create: comps.map((c, idx) => ({
          ingredientId: c.ing ? I(c.ing) : undefined,
          preparationId: c.prep ? P(c.prep) : undefined,
          quantity: c.quantity, unit: c.unit, sortOrder: idx,
        })) },
      },
    })
    console.log(`  ✅ dish: ${name} ($${price})`)
  }

  // cocktails (prep-backed)
  await upsertDish("Margarita", 20, [{ prep: "Margarita", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Spicy Margarita", 21, [{ prep: "Spicy Margarita", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Pink Coco Marg", 21, [{ prep: "Pink Coco Marg", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Strawberry Spritz", 18, [{ prep: "Strawberry Spritz", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Jam Gimlet", 19, [{ prep: "Jam Gimlet", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Maca Espresso", 20, [{ prep: "Maca Espresso", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Fig Whisky Sour", 20, [{ prep: "Fig Whisky Sour", quantity: 1, unit: "serve" }], "Menu cocktail. Whisky cost is PLACEHOLDER.")
  await upsertDish("Breakfast Mary", 19, [{ prep: "Breakfast Mary", quantity: 1, unit: "serve" }], "Menu cocktail. Tomato juice cost is PLACEHOLDER.")
  await upsertDish("Grande Mimosa", 16, [{ prep: "Grande Mimosa", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Hard Arnold Palmer", 16, [{ prep: "Hard Arnold Palmer", quantity: 1, unit: "serve" }], "Menu cocktail.")
  await upsertDish("Hard Old Fashioned Lemonade", 16, [{ prep: "Hard Old Fashioned Lemonade", quantity: 1, unit: "serve" }], "Menu cocktail.")

  // mocktails ($17)
  await upsertDish("Splice", 17, [{ prep: "Splice (Mocktail)", quantity: 1, unit: "serve" }], "Mocktail.")
  await upsertDish("Spicy Watermelon", 17, [{ prep: "Spicy Watermelon (Mocktail)", quantity: 1, unit: "serve" }], "Mocktail.")
  await upsertDish("Virgin Mary", 17, [{ prep: "Virgin Mary (Mocktail)", quantity: 1, unit: "serve" }], "Mocktail. Tomato juice cost is PLACEHOLDER.")

  // non-alc house drinks ($9.9)
  await upsertDish("Southern Iced Tea", 9.9, [{ prep: "Iced Tea Batch", quantity: 1, unit: "serve" }], "Lemon & mint iced tea.")
  await upsertDish("Old Fashioned Lemonade", 9.9, [{ prep: "Lemonade - Old Fashioned", quantity: 1, unit: "serve" }], "House lemonade.")
  await upsertDish("Arnold Palmer", 9.9, [{ prep: "Iced Tea Batch", quantity: 0.5, unit: "serve" }, { prep: "Lemonade - Old Fashioned", quantity: 0.5, unit: "serve" }], "Half iced tea / half lemonade.")

  // fresh juices ($9.9)
  await upsertDish("Watermelon & Mint Juice", 9.9, [{ ing: "Watermelon - Seedless", quantity: 350, unit: "g" }, { ing: "Mint", quantity: 3, unit: "g" }], "Made fresh daily.")
  await upsertDish("Orange Juice (Fresh)", 9.9, [{ ing: "Orange Juice - Fresh (house)", quantity: 300, unit: "ml" }], "Made fresh daily.")
  await upsertDish("Cloudy Apple Juice", 9.9, [{ ing: "Granny smith apple", quantity: 400, unit: "g" }], "Made fresh daily.")

  // smoothies
  await upsertDish("Banana Smoothie", 12.9, [
    { ing: "Banana", quantity: 300, unit: "g" }, { ing: "Honey - pure", quantity: 20, unit: "g" },
    { ing: "Oat Milk - UHT Barista", quantity: 375, unit: "ml" }, { ing: "Macadamia Nuts Raw pieces", quantity: 5, unit: "g" }], "Banana, honey, cinnamon, nutmeg, macadamia praline.")
  await upsertDish("Mango Smoothie", 12.9, [
    { ing: "Mango puree (frozen)", quantity: 225, unit: "g" }, { ing: "Passionfruit Pulp", quantity: 60, unit: "g" },
    { ing: "Banana", quantity: 75, unit: "g" }, { ing: "Coconut water - Cocobella", quantity: 250, unit: "ml" }, { ing: "Mint", quantity: 2, unit: "g" }], "Mango, passionfruit, banana, coconut water.")
  await upsertDish("Acai Smoothie", 14.9, [
    { ing: "Acai Mix Scoopable - Amazonia", quantity: 100, unit: "g" }, { ing: "Banana", quantity: 50, unit: "g" },
    { prep: "House Granola", quantity: 60, unit: "g" }, { ing: "Coconut water - Cocobella", quantity: 120, unit: "ml" },
    { ing: "Strawberry - frozen", quantity: 30, unit: "g" }, { ing: "Macadamia Nuts Raw pieces", quantity: 5, unit: "g" }], "Fresh berries, house granola, macadamia praline.")

  // beer (existing preps)
  await upsertDish("Corona Extra", 13, [{ prep: "Corona", quantity: 1, unit: "serve" }], "Bottled beer.")
  await upsertDish("Peroni Nastro Azzurro", 11, [{ prep: "Peroni", quantity: 1, unit: "serve" }], "Tap/bottle beer.")
  await upsertDish("Great Northern Super Crisp", 12, [{ prep: "Great Northern SC", quantity: 1, unit: "serve" }], "Bottled beer.")
  await upsertDish("Stone & Wood Pacific Ale", 13, [{ prep: "Stone and Wood Pacific Ale", quantity: 1, unit: "serve" }], "Tap beer.")

  console.log("\n🎉 done — run scripts/recalculate-all.ts to populate costs.\n")
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
