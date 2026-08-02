/**
 * Chicken Parmigiana (Pollo Alla Parmigiana) — Currumbin winter menu.
 * Recipe: Chris's handwritten spec photo + Napolitana_Sauce_Recipe.docx (2026-06-12).
 *
 * Per serve: 175g chicken breast (avg of 150-200 per Chris), crumb (60g bread
 * crumbs from repurposed dried bread @ $0, 80g panko, 15g italian herb, 10g salt,
 * 5g white pepper), egg wash (1 egg + 25ml milk), 20g eggplant, 25g prosciutto,
 * 160g napoli, 50g shredded mozzarella, 65g Byron Bay buffalo mozzarella.
 *
 * New ingredients:
 *  - Tomatoes San Marzano DOP 2.5kg tin — Provedores $21.49 (inv 2026-06-10)
 *  - Italian Herb Mix — Fermex $22.50/kg (Aug-2025 price list, no invoice — UNVERIFIED)
 *  - Buffalo Mozzarella (Byron Bay) — PLACEHOLDER $45/kg, ordered but not yet invoiced
 *
 * Price fixes:
 *  - Prosciutto $31.46 → $49/kg, supplier → Son Of A Bunn ("Prosciutto Sliced" inv 2026-06-03)
 *  - Panko Crumbs $48.89 → $46.69/10kg (Bidfood inv 2026-04-09)
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const IDS = {
  CHICKEN_BREAST: "cmn8ccddo004516qzxiydaj8t",
  BREAD_DRIED: null as string | null, // looked up by name
  PANKO: "cmn8ccee000bg16qz1i4qeih1",
  TABLE_SALT: "cmn8ccf3400g616qzc5i2k5g2",
  WHITE_PEPPER: "cmn8ccegi00c116qz958nheka",
  EGG: "cmn8ccdwm007916qzosd7ljjv",
  MILK_NORCO: "cmn8ccdvp007416qze8chw9o3",
  EGGPLANT: "cmn8ccds6006c16qzfegnftpl",
  PROSCIUTTO: "cmn8ccele00cx16qzgixdrrve",
  SHRED_MOZZ: "cmn8ccev900et16qz7r4msnmv",
  GARLIC: null as string | null, // looked up by name
  BASIL: "cmn8cccl2001o16qzmqxzk1q0",
  OLIVE_FINO: "cmn8cceb200ax16qzyoeb56yv",
  BROWN_ONION: "cmn8ccebi00b116qzgsr52n6x",
  BROWN_SUGAR: "cmn8cccxs002u16qzw5hx9l2f",
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const provedores = await db.supplier.findFirst({ where: { name: { contains: "Provedores" } } })
  const fermex = await db.supplier.findFirst({ where: { name: "Fermex" } })
  const cheeseTime = await db.supplier.findFirst({ where: { name: "Cheese Time" } })
  const sob = await db.supplier.findFirst({ where: { name: "Son Of A Bunn" } })
  if (!provedores || !fermex || !sob) throw new Error("supplier lookup failed")

  // ── price fixes ──────────────────────────────────────────────────
  await db.ingredient.update({
    where: { id: IDS.PROSCIUTTO },
    data: { purchasePrice: 49, supplierId: sob.id, notes: "Prosciutto Sliced — Son Of A Bunn inv 2026-06-03 $49/kg (was stale $31.46 Fino)." },
  })
  await db.ingredient.update({ where: { id: IDS.PANKO }, data: { purchasePrice: 46.69 } })
  console.log("✅ prosciutto + panko prices fixed")

  // ── new ingredients ──────────────────────────────────────────────
  const sanMarzano = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Tomatoes San Marzano DOP", supplierId: provedores.id } },
    update: { purchasePrice: 21.49 },
    create: {
      name: "Tomatoes San Marzano DOP", category: "OTHER", baseUnitType: "WEIGHT",
      supplierId: provedores.id, purchaseQuantity: 2.5, purchaseUnit: "kg",
      purchasePrice: 21.49, baseUnitsPerPurchase: 2500, wastePercentage: 0,
      notes: "Peeled DOP 2.5kg tin — Provedores inv 2026-06-10 $21.49 (6 tins/ctn).",
    },
  })
  const italianHerb = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Italian Herb Mix", supplierId: fermex.id } },
    update: {},
    create: {
      name: "Italian Herb Mix", category: "SPICE", baseUnitType: "WEIGHT",
      supplierId: fermex.id, purchaseQuantity: 1, purchaseUnit: "kg",
      purchasePrice: 22.50, baseUnitsPerPurchase: 1000, wastePercentage: 0,
      notes: "Fermex Aug-2025 price list $22.50/kg — UNVERIFIED, no invoice yet.",
    },
  })
  const buffalo = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Buffalo Mozzarella (Byron Bay)", supplierId: cheeseTime?.id ?? null as any } },
    update: {},
    create: {
      name: "Buffalo Mozzarella (Byron Bay)", category: "CHEESE", baseUnitType: "WEIGHT",
      supplierId: cheeseTime?.id ?? null, purchaseQuantity: 1, purchaseUnit: "kg",
      purchasePrice: 45, baseUnitsPerPurchase: 1000, wastePercentage: 0,
      notes: "NEW Byron Bay buffalo mozzarella, ordered 2026-06 — $45/kg is a PLACEHOLDER (no invoice yet; cow burrata is $41/kg). UPDATE on first invoice.",
    },
  })
  console.log("✅ ingredients:", sanMarzano.id, italianHerb.id, buffalo.id)

  // mapping for the san marzano invoice line
  await db.supplierItemMapping.upsert({
    where: { supplierId_invoiceDescription: { supplierId: provedores.id, invoiceDescription: "TOMATOES San Marzano Peeled DOP 2.5kg (Order 6 Tins to CTN)" } },
    update: { ingredientId: sanMarzano.id },
    create: { supplierId: provedores.id, invoiceDescription: "TOMATOES San Marzano Peeled DOP 2.5kg (Order 6 Tins to CTN)", ingredientId: sanMarzano.id },
  })
  await db.supplierItemMapping.upsert({
    where: { supplierId_invoiceDescription: { supplierId: sob.id, invoiceDescription: "Prosciutto Sliced" } },
    update: { ingredientId: IDS.PROSCIUTTO },
    create: { supplierId: sob.id, invoiceDescription: "Prosciutto Sliced", ingredientId: IDS.PROSCIUTTO },
  })

  const breadDried = await db.ingredient.findFirst({ where: { name: "Bread - Dried (repurposed)" } })
  const garlic = await db.ingredient.findFirst({ where: { name: "Garlic (peeled)" } })
  if (!breadDried || !garlic) throw new Error("bread/garlic lookup failed")

  // ── Prep: Napolitana Sauce ───────────────────────────────────────
  const existing = await db.preparation.findUnique({ where: { name: "Napolitana Sauce" } })
  const napoli = existing ?? await db.preparation.create({
    data: {
      name: "Napolitana Sauce",
      category: "SAUCE",
      method:
        "1) Heat olive oil in large stockpot over medium heat.\n" +
        "2) Add diced brown onion + minced garlic, cook until deeply golden.\n" +
        "3) Add 2.5kg of the San Marzano tomatoes, reduce.\n" +
        "4) Add remaining tomatoes, basil, brown sugar, salt, white pepper.\n" +
        "5) Gentle simmer ~40 min, stirring occasionally. Season, cool, store.\n" +
        "Yield approx 8.5-9kg (costed at 8.75kg).",
      yieldQuantity: 8750,
      yieldUnit: "g",
      yieldWeightGrams: 8750,
      items: {
        create: [
          { ingredientId: sanMarzano.id, quantity: 7500, unit: "g", sortOrder: 0 },
          { ingredientId: garlic.id, quantity: 200, unit: "g", sortOrder: 1 },
          { ingredientId: IDS.BASIL, quantity: 50, unit: "g", sortOrder: 2 },
          { ingredientId: IDS.OLIVE_FINO, quantity: 100, unit: "ml", sortOrder: 3 },
          { ingredientId: IDS.BROWN_ONION, quantity: 1, unit: "kg", sortOrder: 4 },
          { ingredientId: IDS.BROWN_SUGAR, quantity: 250, unit: "g", sortOrder: 5 },
          { ingredientId: IDS.TABLE_SALT, quantity: 50, unit: "g", sortOrder: 6 },
          { ingredientId: IDS.WHITE_PEPPER, quantity: 10, unit: "g", sortOrder: 7 },
        ],
      },
    },
  })
  console.log(existing ? "⚠️ napoli prep existed:" : "✅ prep Napolitana Sauce:", napoli.id)

  // ── Dish: Chicken Parmigiana ─────────────────────────────────────
  const existingDish = await db.dish.findUnique({ where: { name_venue: { name: "Chicken Parmigiana", venue: "BEACH_HOUSE" } } })
  if (existingDish) {
    console.log("⚠️ dish exists, skipping:", existingDish.id)
  } else {
    const dish = await db.dish.create({
      data: {
        name: "Chicken Parmigiana",
        menuCategory: "LUNCH",
        venue: "BEACH_HOUSE",
        sellingPrice: 32.90,
        sellingPriceExGst: 29.9091,
        notes:
          "Pollo Alla Parmigiana — Currumbin winter menu. Chicken 175g (avg of 150-200g spec). " +
          "Crumb station per serve: 60g bread crumbs (house dried bread, $0) + 80g panko + 15g italian herb + 10g salt + 5g white pepper; egg wash 1 egg + 25ml milk. " +
          "Build: prosciutto + thin eggplant on chicken, napoli, shredded mozz + Byron Bay buffalo. " +
          "BUFFALO PRICE IS PLACEHOLDER ($45/kg) until first invoice. Selling price $32.90 PLACEHOLDER.",
        components: {
          create: [
            { ingredientId: IDS.CHICKEN_BREAST, quantity: 175, unit: "g", sortOrder: 0 },
            { ingredientId: breadDried.id, quantity: 60, unit: "g", sortOrder: 1 },
            { ingredientId: IDS.PANKO, quantity: 80, unit: "g", sortOrder: 2 },
            { ingredientId: italianHerb.id, quantity: 15, unit: "g", sortOrder: 3 },
            { ingredientId: IDS.TABLE_SALT, quantity: 10, unit: "g", sortOrder: 4 },
            { ingredientId: IDS.WHITE_PEPPER, quantity: 5, unit: "g", sortOrder: 5 },
            { ingredientId: IDS.EGG, quantity: 1, unit: "ea", sortOrder: 6 },
            { ingredientId: IDS.MILK_NORCO, quantity: 25, unit: "ml", sortOrder: 7 },
            { ingredientId: IDS.EGGPLANT, quantity: 20, unit: "g", sortOrder: 8 },
            { ingredientId: IDS.PROSCIUTTO, quantity: 25, unit: "g", sortOrder: 9 },
            { preparationId: napoli.id, quantity: 160, unit: "g", sortOrder: 10 },
            { ingredientId: IDS.SHRED_MOZZ, quantity: 50, unit: "g", sortOrder: 11 },
            { ingredientId: buffalo.id, quantity: 65, unit: "g", sortOrder: 12 },
          ],
        },
      },
    })
    console.log("✅ dish Chicken Parmigiana:", dish.id)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
