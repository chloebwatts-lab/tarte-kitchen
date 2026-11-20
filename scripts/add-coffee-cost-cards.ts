/**
 * Coffee cost cards (Chloe 20 Nov 2026: "a coffee cost card in the app so
 * this updates itself").
 *
 * What it does (additive, idempotent, DRY RUN unless --apply):
 *   1. Links the coffee and milk invoice lines to their cost cards with exact
 *      SupplierItemMappings, so the nightly rematch links the lines and the
 *      nightly card sync (/api/cron/sync-cost-cards) keeps the prices current:
 *        Parallel Roasters  TARTE BLEND BULK 1KG       -> Coffee Beans - Espresso (House)
 *                           DECAF | ESPRESSO 1kg        -> Coffee Beans - Decaf (new)
 *                           SOMAGE-Kali drinking choc   -> Drinking Chocolate - Somage Kali 33% (new)
 *        EasyVend           2L CAPO (BROWN)             -> Milk - Capo Brown (was a rejected
 *                                                          "Caperberry" pairing, so never linked)
 *                           2L NORCO LITE (RED)         -> Milk - Norco Lite (Red)
 *        Bidfood            8oz white paper cup, 50/slv -> Hot Cup 8oz - White (Bidfood) (new)
 *                           80mm white hot lid, 50/slv  -> Hot Cup Lid - 80mm White (Bidfood) (new)
 *   2. Moves the two EasyVend milk cards to the price on the latest invoices
 *      (PriceHistory id ph_cardfix_* so the card sync keeps managing them).
 *   3. Adds Bee Dee Bags packaging cards from their invoices (Bee Dee invoices
 *      are not read by Tarte Kitchen, so these four are updated by hand).
 *   4. Adds 17 DRINKS cards (venue BOTH) at the Square menu prices of 20 Nov 2026.
 *
 * Ingredient supplierId is left empty on purpose for the new cards: setting it
 * would put them in the matcher's loose same-supplier fuzzy pass, where Parallel
 * single-origin lines ("... Espresso / 1KG") could land on the house blend card.
 * The exact mappings do the linking.
 *
 * Recipe assumptions (in every card's notes): 22g double shot; milk incl. jug
 * waste Small 160ml, Large 220ml. Small takeaway = Tarte 6oz cup, Large
 * takeaway = 8oz white cup, both with the 80mm lid (no 90mm hot lid invoice
 * found). Afterwards: rematch-invoices, sync-cost-cards, recalculate-costs.
 */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const APPLY = process.argv.includes("--apply")
const STAMP = "20261120"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const SUPPLIERS = {
  parallel: "Parallel Roasters",
  easyvend: "EasyVend",
  bidfood: "Bidfood",
} as const

type NewIng = {
  name: string
  baseUnitType: "WEIGHT" | "VOLUME" | "COUNT"
  category: "OTHER" | "DRY_GOOD"
  purchaseQuantity: number
  purchaseUnit: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  notes: string
}

const NEW_INGREDIENTS: NewIng[] = [
  {
    name: "Coffee Beans - Decaf", baseUnitType: "WEIGHT", category: "OTHER",
    purchaseQuantity: 1, purchaseUnit: "kg", purchasePrice: 36, baseUnitsPerPurchase: 1000,
    notes: "Parallel Roasters DECAF | ESPRESSO 1kg, $36/kg (GST free). Price kept current from the invoices by the nightly card sync.",
  },
  {
    name: "Drinking Chocolate - Somage Kali 33%", baseUnitType: "WEIGHT", category: "DRY_GOOD",
    purchaseQuantity: 1, purchaseUnit: "kg", purchasePrice: 19.9, baseUnitsPerPurchase: 1000,
    notes: "Parallel Roasters SOMAGE-Kali Premium Drinking Chocolate Original 33%, 1kg bag, $19.90. Price kept current from the invoices by the nightly card sync.",
  },
  {
    name: "Hot Cup 8oz - White (Bidfood)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 50, purchaseUnit: "ea", purchasePrice: 4.49, baseUnitsPerPurchase: 50,
    notes: "Bidfood CUPS PAPER 237ML 8OZ 90MM SINGLE WALL WHITE, sleeve of 50, $4.49. Used for the Large takeaway coffee card. Price kept current from the invoices by the nightly card sync.",
  },
  {
    name: "Hot Cup Lid - 80mm White (Bidfood)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 50, purchaseUnit: "ea", purchasePrice: 2.25, baseUnitsPerPurchase: 50,
    notes: "Bidfood LIDS TO SUIT 230/355/280ML 6/8/12OZ 80MM WHITE BIO BIOPAK, sleeve of 50, $2.25. The only hot cup lid on our invoices (Aug 2026); the 8oz white cup is 90mm, so the Large takeaway lid price is an estimate until a 90mm lid invoice turns up.",
  },
  {
    name: "Hot Cup 6oz - Tarte (Bee Dee)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 1000, purchaseUnit: "ea", purchasePrice: 69.9, baseUnitsPerPurchase: 1000,
    notes: "Bee Dee Bags 'Tarte Bakery 6oz Hot Cup - 1000/ctn' $69.90 ex GST (AU-SI130549, 10 Nov 2026). Bee Dee invoices are not read by Tarte Kitchen: update this price by hand.",
  },
  {
    name: "Cold Cup 12oz - Tarte (Bee Dee)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 1000, purchaseUnit: "ea", purchasePrice: 85, baseUnitsPerPurchase: 1000,
    notes: "Bee Dee Bags 'Tarte Bakery 12oz Cold Cup U Shape - 1000/ctn' $85.00 ex GST (AU-SI127990, 22 Oct 2026). Update by hand.",
  },
  {
    name: "Sipper Lid 12-20oz - NaturalPak (Bee Dee)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 1000, purchaseUnit: "ea", purchasePrice: 55, baseUnitsPerPurchase: 1000,
    notes: "Bee Dee Bags 'NaturalPak RPET Sipper Lid to suit 12oz-20oz - 1000' $55.00 ex GST (AU-SI129887, 5 Nov 2026). Update by hand.",
  },
  {
    name: "Jumbo Straw - Tarte (Bee Dee)", baseUnitType: "COUNT", category: "OTHER",
    purchaseQuantity: 2000, purchaseUnit: "ea", purchasePrice: 43.8, baseUnitsPerPurchase: 2000,
    notes: "Bee Dee Bags 'Tarte Bakery JUMBO STRAW - 2000/ctn' $43.80 ex GST (AU-SI130549, 10 Nov 2026). Update by hand.",
  },
]

// Exact invoice descriptions, as printed, per supplier.
type Mapping = { supplier: keyof typeof SUPPLIERS; description: string; ingredient: string; invoiceUnit?: string; factor?: number }
const MAPPINGS: Mapping[] = [
  { supplier: "parallel", description: "TARTE BLEND BULK 1KG", ingredient: "Coffee Beans - Espresso (House)" },
  { supplier: "parallel", description: "BL-TARTE-BULK1KG - TARTE BLEND BULK 1KG", ingredient: "Coffee Beans - Espresso (House)" },
  { supplier: "parallel", description: "DECAF | ESPRESSO 1kg", ingredient: "Coffee Beans - Decaf" },
  { supplier: "parallel", description: "SO-DECA001-1KG - DECAF | ESPRESSO 1kg", ingredient: "Coffee Beans - Decaf" },
  { supplier: "parallel", description: "SOMAGE-Kali Premium Drinking", ingredient: "Drinking Chocolate - Somage Kali 33%" },
  { supplier: "parallel", description: "SOMAGE-Kali Premium Drinking Chocolate Original 33% - 1kg bag", ingredient: "Drinking Chocolate - Somage Kali 33%" },
  { supplier: "parallel", description: "CHKA-33-P1 - SOMAGE-Kali Premium Drinking Chocolate Original 33% - 1kg bag", ingredient: "Drinking Chocolate - Somage Kali 33%" },
  { supplier: "easyvend", description: "2L CAPO (BROWN)", ingredient: "Milk - Capo Brown" },
  { supplier: "easyvend", description: "2L NORCO LITE (RED)", ingredient: "Milk - Norco Lite (Red)" },
  ...[
    "CUPS PAPER 237ML 8OZ 90MM SINGLE WALL WHITE CATERERS C 50's",
    "CUPS PAPER 237ML 8OZ 90MM SINGLE WALL WHITE CATERERS C",
    "CUPS PAPER 237ML 8OZ 90MM SINGLE WALL WHITE",
  ].map((description): Mapping => ({ supplier: "bidfood", description, ingredient: "Hot Cup 8oz - White (Bidfood)", invoiceUnit: "SLV", factor: 1 / 50 })),
  ...[
    "LIDS TO SUIT 230/355/280ML 6/8/12OZ 80MM WHITE BIO BIOPAK 50's",
    "LIDS TO SUIT 230/355/280ML 6/8/12OZ 80MM WHITE BIO",
  ].map((description): Mapping => ({ supplier: "bidfood", description, ingredient: "Hot Cup Lid - 80mm White (Bidfood)", invoiceUnit: "SLV", factor: 1 / 50 })),
]

// Existing EasyVend milk cards moved to the latest invoice price (ex GST).
const MILK_PRICES: Array<{ name: string; price: number; note: string }> = [
  { name: "Milk - Capo Brown", price: 3.98, note: "EasyVend 2L CAPO (BROWN), $3.98 a bottle on the 15 Nov 2026 invoices (was $3.57 from the March import). Linked to the EasyVend line 20 Nov 2026; the nightly card sync keeps it current." },
  { name: "Milk - Norco Lite (Red)", price: 4.13, note: "EasyVend 2L NORCO LITE (RED), $4.13 a bottle on the 15 Nov 2026 invoices. Linked to the EasyVend line 20 Nov 2026; the nightly card sync keeps it current." },
]

const BEANS = "Coffee Beans - Espresso (House)"
const MILK = "Milk - Capo Brown"
const OAT = "Oat Milk - UHT Barista"
const ALMOND = "Almond Milk - UHT Barista"
const SOY = "Soy milk"
const LF = "Milk - Lactose Free"
const CHOC = "Drinking Chocolate - Somage Kali 33%"
const CUP6 = "Hot Cup 6oz - Tarte (Bee Dee)"
const CUP8 = "Hot Cup 8oz - White (Bidfood)"
const LID = "Hot Cup Lid - 80mm White (Bidfood)"
const COLD = "Cold Cup 12oz - Tarte (Bee Dee)"
const SIPPER = "Sipper Lid 12-20oz - NaturalPak (Bee Dee)"
const STRAW = "Jumbo Straw - Tarte (Bee Dee)"

const SHOT = { ing: BEANS, quantity: 22, unit: "g" }
const takeawayHot = (cup: string) => [{ ing: cup, quantity: 1, unit: "ea" }, { ing: LID, quantity: 1, unit: "ea" }]
const takeawayCold = [{ ing: COLD, quantity: 1, unit: "ea" }, { ing: SIPPER, quantity: 1, unit: "ea" }, { ing: STRAW, quantity: 1, unit: "ea" }]

const BASE_NOTE =
  "Coffee cost card (20 Nov 2026). 22g double shot of Tarte Blend (assumed: change the beans line if the bar doses differently). " +
  "Beans and milk prices follow the Parallel Roasters and EasyVend invoices every night. Price = Square menu price, both venues."

type Comp = { ing: string; quantity: number; unit: string }
const FWLC = "Flat White, Latte, Cappuccino"
const DISHES: Array<{ name: string; price: number; comps: Comp[]; note: string }> = [
  { name: `${FWLC} - Small`, price: 5.5, comps: [SHOT, { ing: MILK, quantity: 160, unit: "ml" }], note: "Dine in. 160ml Capo full cream incl. jug waste." },
  { name: `${FWLC} - Small, takeaway`, price: 5.5, comps: [SHOT, { ing: MILK, quantity: 160, unit: "ml" }, ...takeawayHot(CUP6)], note: "Takeaway in the Tarte 6oz cup with lid. 160ml Capo full cream incl. jug waste." },
  { name: `${FWLC} - Large`, price: 6.7, comps: [SHOT, { ing: MILK, quantity: 220, unit: "ml" }], note: "Dine in. 220ml Capo full cream incl. jug waste. Most coffees sold are this size." },
  { name: `${FWLC} - Large, takeaway`, price: 6.7, comps: [SHOT, { ing: MILK, quantity: 220, unit: "ml" }, ...takeawayHot(CUP8)], note: "Takeaway in the 8oz white cup with lid (lid price is the 80mm Bidfood lid, an estimate). 220ml Capo full cream." },
  { name: `${FWLC} - Large, oat milk`, price: 7.7, comps: [SHOT, { ing: OAT, quantity: 220, unit: "ml" }], note: "Dine in, oat milk (+$1.00 on the menu). 220ml incl. jug waste." },
  { name: `${FWLC} - Large, almond milk`, price: 7.7, comps: [SHOT, { ing: ALMOND, quantity: 220, unit: "ml" }], note: "Dine in, almond milk (+$1.00 on the menu). 220ml incl. jug waste." },
  { name: `${FWLC} - Large, soy milk`, price: 7.7, comps: [SHOT, { ing: SOY, quantity: 220, unit: "ml" }], note: "Dine in, Bonsoy (+$1.00 on the menu). 220ml incl. jug waste." },
  { name: `${FWLC} - Large, lactose free`, price: 7.7, comps: [SHOT, { ing: LF, quantity: 220, unit: "ml" }], note: "Dine in, lactose free milk (+$1.00 on the menu). 220ml incl. jug waste." },
  { name: "Long Black - Large", price: 6.7, comps: [SHOT], note: "Dine in." },
  { name: "Long Black - Large, takeaway", price: 6.7, comps: [SHOT, ...takeawayHot(CUP8)], note: "Takeaway in the 8oz white cup with lid." },
  { name: "Espresso - Double", price: 5, comps: [SHOT], note: "Dine in." },
  { name: "Piccolo", price: 5, comps: [SHOT, { ing: MILK, quantity: 90, unit: "ml" }], note: "Dine in. 90ml Capo full cream incl. jug waste." },
  { name: "Macchiato - Short", price: 4.8, comps: [SHOT, { ing: MILK, quantity: 20, unit: "ml" }], note: "Dine in. A dash of milk." },
  { name: "Mocha - Large", price: 6.7, comps: [SHOT, { ing: MILK, quantity: 200, unit: "ml" }, { ing: CHOC, quantity: 20, unit: "g" }], note: "Dine in. 200ml Capo full cream, 20g Somage drinking chocolate." },
  { name: "Iced Latte", price: 7.5, comps: [SHOT, { ing: MILK, quantity: 180, unit: "ml" }], note: "Dine in, over ice. 180ml Capo full cream." },
  { name: "Iced Latte, takeaway", price: 7.5, comps: [SHOT, { ing: MILK, quantity: 180, unit: "ml" }, ...takeawayCold], note: "Takeaway in the Tarte 12oz cold cup, sipper lid, jumbo straw. 180ml Capo full cream." },
  { name: "Iced Black, takeaway", price: 7.5, comps: [SHOT, ...takeawayCold], note: "Takeaway in the Tarte 12oz cold cup, sipper lid, jumbo straw." },
]

async function main() {
  console.log(APPLY ? "APPLY: writing to the database" : "DRY RUN: nothing is written (pass --apply)")

  const supplierIds = new Map<string, string>()
  for (const [key, name] of Object.entries(SUPPLIERS)) {
    const s = await db.supplier.findUnique({ where: { name }, select: { id: true } })
    if (!s) throw new Error(`supplier not found: ${name}`)
    supplierIds.set(key, s.id)
  }

  const ingIds = new Map<string, string>()
  const findIng = async (name: string) => {
    const rows = await db.ingredient.findMany({ where: { name }, select: { id: true } })
    if (rows.length > 1) throw new Error(`more than one ingredient called ${name}`)
    return rows[0]?.id ?? null
  }

  // 1. new ingredients
  console.log("\n-- ingredients --")
  for (const n of NEW_INGREDIENTS) {
    const id = await findIng(n.name)
    if (id) { ingIds.set(n.name, id); console.log(`  exists   ${n.name}`); continue }
    console.log(`  create   ${n.name}  $${n.purchasePrice} per ${n.purchaseQuantity} ${n.purchaseUnit}`)
    if (APPLY) {
      const created = await db.ingredient.create({ data: { ...n, supplierId: null, wastePercentage: 0 } })
      ingIds.set(n.name, created.id)
    } else ingIds.set(n.name, `new:${n.name}`)
  }
  for (const name of [BEANS, MILK, OAT, ALMOND, SOY, LF, "Milk - Norco Lite (Red)"]) {
    const id = await findIng(name)
    if (!id) throw new Error(`existing ingredient missing: ${name}`)
    ingIds.set(name, id)
  }
  const ID = (name: string) => { const id = ingIds.get(name); if (!id) throw new Error(`no id for ${name}`); return id }

  // 2. milk card prices
  console.log("\n-- milk cards --")
  for (const m of MILK_PRICES) {
    const ing = await db.ingredient.findUniqueOrThrow({ where: { id: ID(m.name) } })
    const old = Number(ing.purchasePrice)
    console.log(`  ${m.name}: $${old} -> $${m.price} per ${Number(ing.purchaseQuantity)} ${ing.purchaseUnit}`)
    if (!APPLY || Math.abs(old - m.price) < 1e-9) continue
    await db.priceHistory.create({
      data: { id: `ph_cardfix_${STAMP}_${ing.id}`, ingredientId: ing.id, oldPrice: old, newPrice: m.price, oldUnit: ing.purchaseUnit, oldQuantity: Number(ing.purchaseQuantity) },
    })
    await db.ingredient.update({ where: { id: ing.id }, data: { purchasePrice: m.price, supplierId: ing.supplierId ?? supplierIds.get("easyvend"), notes: m.note } })
  }
  if (APPLY) {
    const beans = await db.ingredient.findUniqueOrThrow({ where: { id: ID(BEANS) } })
    if (!beans.notes?.includes("Parallel Roasters")) {
      await db.ingredient.update({ where: { id: beans.id }, data: { notes: "Parallel Roasters TARTE BLEND BULK 1KG, $26/kg (GST free) since at least Sep 2026. Linked to the invoice line 20 Nov 2026; the nightly card sync keeps it current." } })
    }
  }

  // 3. mappings
  console.log("\n-- invoice line mappings --")
  for (const m of MAPPINGS) {
    const supplierId = supplierIds.get(m.supplier)!
    const existing = await db.supplierItemMapping.findUnique({ where: { supplierId_invoiceDescription: { supplierId, invoiceDescription: m.description } } })
    const target = ID(m.ingredient)
    const status = !existing ? "create" : existing.ingredientId === target && !existing.ignored ? "ok" : `replace (was ${existing.ingredientId}${existing.ignored ? ", ignored" : ""})`
    console.log(`  ${status.padEnd(10)} ${SUPPLIERS[m.supplier]} "${m.description}" -> ${m.ingredient}`)
    if (!APPLY || status === "ok") continue
    const data = { ingredientId: target, invoiceUnit: m.invoiceUnit ?? null, conversionFactor: m.factor ?? null, ignored: false, ignoredAt: null, ignoredBy: null, lastUsed: new Date() }
    await db.supplierItemMapping.upsert({
      where: { supplierId_invoiceDescription: { supplierId, invoiceDescription: m.description } },
      update: data,
      create: { supplierId, invoiceDescription: m.description, ...data },
    })
  }

  // 4. dishes
  console.log("\n-- coffee cards (DRINKS, both venues) --")
  for (const d of DISHES) {
    const existing = await db.dish.findUnique({ where: { name_venue: { name: d.name, venue: "BOTH" } } })
    if (existing) { console.log(`  exists   ${d.name}`); continue }
    console.log(`  create   ${d.name}  $${d.price.toFixed(2)}  [${d.comps.map((c) => `${c.quantity}${c.unit} ${c.ing}`).join(", ")}]`)
    if (!APPLY) continue
    await db.dish.create({
      data: {
        name: d.name, menuCategory: "DRINKS", venue: "BOTH",
        sellingPrice: d.price, sellingPriceExGst: Number((d.price / 1.1).toFixed(4)),
        notes: `${d.note} ${BASE_NOTE}`,
        components: { create: d.comps.map((c, i) => ({ ingredientId: ID(c.ing), quantity: c.quantity, unit: c.unit, sortOrder: i })) },
      },
    })
  }

  console.log(APPLY ? "\nDone. Next: rematch-invoices, sync-cost-cards, recalculate-costs." : "\nDry run only.")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
