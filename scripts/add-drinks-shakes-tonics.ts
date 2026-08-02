/**
 * Drinks costing — pass 2: custard shakes + Papa Salt gin tonics/sodas.
 * Sources: Beach House Cocktails Recipe PDF (p6 shakes) + RESTAURANT DRINKS MENU BOOK (prices, tonic/soda list).
 *
 * Scoop/measure conventions: 1 scoop = 60ml; ¾ cup = 180ml; 1 tbsp = 15g/ml; ½ cup berries = 75g.
 * Tonics/sodas: priced off Fever-Tree Tonic ($1.67/200ml) as the premium tonic/soda proxy — the
 *   specialty Elderflower/Aromatic/Mediterranean/Yuzu/Blood-Orange variants sit in the same price band.
 *   Botanical garnishes costed where the ingredient exists; exotic ones (finger lime, star fruit,
 *   lavender, lemon balm, native berries) are garnish-level cents and approximated/omitted.
 *
 * Additive only. Run scripts/recalculate-all.ts afterwards.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const VENUE = "BEACH_HOUSE" as const

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const ingNames = [
    "Ice Cream Vanilla Supreme", "Vanilla bean paste", "Milk - Norco Full Cream (Blue)",
    "Peanut Butter smooth", "Strawberry - frozen", "Chocolate Patissier Milk Choc 34.6%",
    "Papa Salt Gin", "Fever-Tree Tonic", "Elderflower", "Rosemary", "Lemon thyme",
    "Sage", "Pink peppercorns", "Pink grapefruit", "Lime Leaf",
  ]
  const ingMap = new Map<string, string>()
  for (const n of ingNames) {
    const i = await db.ingredient.findFirst({ where: { name: n }, select: { id: true } })
    if (!i) throw new Error(`MISSING ingredient: ${n}`)
    ingMap.set(n, i.id)
  }
  const I = (n: string) => ingMap.get(n)!

  const prepNames = ["Custard", "Dulce"]
  const prepMap = new Map<string, string>()
  for (const n of prepNames) {
    const p = await db.preparation.findUnique({ where: { name: n }, select: { id: true } })
    if (!p) throw new Error(`MISSING prep: ${n}`)
    prepMap.set(n, p.id)
  }
  const P = (n: string) => prepMap.get(n)!

  // ── new prep: Choc Custard (for Choccie shake) ───────────────────
  console.log("── preparations ──")
  async function upsertPrep(name: string, category: any, yieldQuantity: number, yieldUnit: string, yieldWeightGrams: number, method: string, items: Array<{ing?: string, prep?: string, quantity: number, unit: string}>) {
    const existing = await db.preparation.findUnique({ where: { name } })
    if (existing) { prepMap.set(name, existing.id); console.log(`  · prep exists: ${name}`); return existing.id }
    const created = await db.preparation.create({
      data: { name, category, yieldQuantity, yieldUnit, yieldWeightGrams, method,
        items: { create: items.map((it, idx) => ({
          ingredientId: it.ing ? I(it.ing) : undefined,
          subPreparationId: it.prep ? P(it.prep) : undefined,
          quantity: it.quantity, unit: it.unit, sortOrder: idx })) } },
    })
    prepMap.set(name, created.id); console.log(`  ✅ prep: ${name}`); return created.id
  }
  await upsertPrep("Choc Custard", "BASE", 2250, "ml", 2250,
    "Melt milk chocolate into warm house custard to a ganache-custard. Yield ~2.25L.", [
      { prep: "Custard", quantity: 2000, unit: "ml" },
      { ing: "Chocolate Patissier Milk Choc 34.6%", quantity: 250, unit: "g" },
    ])

  // shake serve-preps (yield 1 serve)
  const SERVE: Record<string, { method: string, items: Array<{ing?: string, prep?: string, quantity: number, unit: string}> }> = {
    "Custard Shake - Vanilla": { method: "1.5 scoop vanilla ice cream, 2 scoop custard, 2 tbsp vanilla bean, ¾ cup milk. Blend 15s.", items: [
      { ing: "Ice Cream Vanilla Supreme", quantity: 90, unit: "ml" }, { prep: "Custard", quantity: 120, unit: "ml" },
      { ing: "Vanilla bean paste", quantity: 30, unit: "g" }, { ing: "Milk - Norco Full Cream (Blue)", quantity: 180, unit: "ml" } ] },
    "Custard Shake - Dulce de Leche": { method: "1.5 scoop vanilla ice cream, 2 scoop custard, 1 scoop dulce, ¾ cup milk.", items: [
      { ing: "Ice Cream Vanilla Supreme", quantity: 90, unit: "ml" }, { prep: "Custard", quantity: 120, unit: "ml" },
      { prep: "Dulce", quantity: 50, unit: "g" }, { ing: "Milk - Norco Full Cream (Blue)", quantity: 180, unit: "ml" } ] },
    "Custard Shake - Peanut Butter": { method: "1.5 scoop vanilla ice cream, 2 scoop custard, 1 tbsp smooth peanut butter, ¾ cup milk.", items: [
      { ing: "Ice Cream Vanilla Supreme", quantity: 90, unit: "ml" }, { prep: "Custard", quantity: 120, unit: "ml" },
      { ing: "Peanut Butter smooth", quantity: 15, unit: "g" }, { ing: "Milk - Norco Full Cream (Blue)", quantity: 180, unit: "ml" } ] },
    "Custard Shake - Choccie": { method: "1.5 scoop vanilla ice cream, 2 scoop choc custard, ¾ cup milk.", items: [
      { ing: "Ice Cream Vanilla Supreme", quantity: 90, unit: "ml" }, { prep: "Choc Custard", quantity: 120, unit: "ml" },
      { ing: "Milk - Norco Full Cream (Blue)", quantity: 180, unit: "ml" } ] },
    "Custard Shake - Strawberry": { method: "½ cup frozen strawberries, 1.5 scoop ice cream, 2 scoop custard, 1 tbsp vanilla bean, ¾ cup milk.", items: [
      { ing: "Strawberry - frozen", quantity: 75, unit: "g" }, { ing: "Ice Cream Vanilla Supreme", quantity: 90, unit: "ml" },
      { prep: "Custard", quantity: 120, unit: "ml" }, { ing: "Vanilla bean paste", quantity: 15, unit: "g" },
      { ing: "Milk - Norco Full Cream (Blue)", quantity: 180, unit: "ml" } ] },
    // Papa Salt gin tonics ($17): 30ml gin + 200ml premium tonic + botanical
    "G&T - Crushed Lavender & Elderflower Tonic": { method: "Papa Salt gin, elderflower tonic, crushed lavender.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Elderflower", quantity: 2, unit: "g" } ] },
    "G&T - Star Fruit & Rosemary / Aromatic Tonic": { method: "Papa Salt gin, aromatic tonic, star fruit & rosemary.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Rosemary", quantity: 3, unit: "g" } ] },
    "G&T - Smoked Lemon Thyme / Mediterranean Tonic": { method: "Papa Salt gin, mediterranean tonic, smoked lemon thyme.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Lemon thyme", quantity: 0.25, unit: "ea" } ] },
    "G&T - Sage & Pink Peppercorn / Indian Tonic": { method: "Papa Salt gin, premium indian tonic, sage & pink peppercorn.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Sage", quantity: 2, unit: "g" }, { ing: "Pink peppercorns", quantity: 1, unit: "g" } ] },
    // Papa Salt sodas ($17)
    "Soda - Grapefruit & Lemon Balm / Grapefruit Soda": { method: "Papa Salt gin, grapefruit soda, grapefruit & lemon balm.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Pink grapefruit", quantity: 20, unit: "g" } ] },
    "Soda - Kaffir & Finger Lime / Yuzu Soda": { method: "Papa Salt gin, yuzu soda, kaffir lime & finger lime.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Lime Leaf", quantity: 0.1, unit: "ea" } ] },
    "Soda - Native Berries & Elderflower / Blood Orange Soda": { method: "Papa Salt gin, blood orange soda, native berries & elderflower.", items: [
      { ing: "Papa Salt Gin", quantity: 30, unit: "ml" }, { ing: "Fever-Tree Tonic", quantity: 200, unit: "ml" }, { ing: "Elderflower", quantity: 2, unit: "g" } ] },
  }
  for (const [name, def] of Object.entries(SERVE)) await upsertPrep(name, "COMPONENT", 1, "serve", 0, def.method, def.items)

  // ── dishes ───────────────────────────────────────────────────────
  console.log("\n── dishes ──")
  async function upsertDish(name: string, price: number, prep: string, notes: string) {
    const existing = await db.dish.findUnique({ where: { name_venue: { name, venue: VENUE } } })
    if (existing) { console.log(`  · dish exists: ${name}`); return }
    await db.dish.create({ data: {
      name, menuCategory: "DRINKS", venue: VENUE, sellingPrice: price, sellingPriceExGst: Number((price / 1.1).toFixed(4)), notes,
      components: { create: [{ preparationId: P(prep), quantity: 1, unit: "serve", sortOrder: 0 }] } } })
    console.log(`  ✅ dish: ${name} ($${price})`)
  }

  await upsertDish("Custard Shake - Vanilla Bean", 13.9, "Custard Shake - Vanilla", "Custard shake.")
  await upsertDish("Custard Shake - Dulce de Leche", 13.9, "Custard Shake - Dulce de Leche", "Custard shake.")
  await upsertDish("Custard Shake - Peanut Butter", 13.9, "Custard Shake - Peanut Butter", "Custard shake.")
  await upsertDish("Custard Shake - Choccie", 13.9, "Custard Shake - Choccie", "Custard shake.")
  await upsertDish("Custard Shake - Strawberry", 13.9, "Custard Shake - Strawberry", "Custard shake.")
  await upsertDish("Papa Salt G&T - Lavender & Elderflower", 17, "G&T - Crushed Lavender & Elderflower Tonic", "Gin tonic. Tonic costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt G&T - Star Fruit & Rosemary", 17, "G&T - Star Fruit & Rosemary / Aromatic Tonic", "Gin tonic. Tonic costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt G&T - Smoked Lemon Thyme", 17, "G&T - Smoked Lemon Thyme / Mediterranean Tonic", "Gin tonic. Tonic costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt G&T - Sage & Pink Peppercorn", 17, "G&T - Sage & Pink Peppercorn / Indian Tonic", "Gin tonic. Tonic costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt Soda - Grapefruit & Lemon Balm", 17, "Soda - Grapefruit & Lemon Balm / Grapefruit Soda", "Gin soda. Soda costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt Soda - Kaffir & Finger Lime", 17, "Soda - Kaffir & Finger Lime / Yuzu Soda", "Gin soda. Soda costed off Fever-Tree proxy.")
  await upsertDish("Papa Salt Soda - Native Berries & Elderflower", 17, "Soda - Native Berries & Elderflower / Blood Orange Soda", "Gin soda. Soda costed off Fever-Tree proxy.")

  console.log("\n🎉 done — run scripts/recalculate-all.ts to populate costs.\n")
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
