/**
 * Add French Onion Soup (new menu item, June 2026) per Chris's recipe.
 *
 * Creates:
 *  - Ingredient: Demi Glaze Basic Brown GF (Maggi)  — Bidfood $39.90 / 2kg pail (inv I70449395.GOL 2026-05-31)
 *  - Ingredient: Beef Stock - Real Campbells        — Bidfood $4.11 / 1L (inv 2026-06-03)
 *  - Ingredient: Hennessy VS Cognac                 — Bidfood $87.25 / 700ml btl (inv I70560873.GOL 2026-06-10)
 *  - Prep: Basic Demi Glace (2kg pail makes 20L → 100g/L)
 *  - Prep: Onion Soup (chef recipe, assumed yield 15L ≈ 50 × 300ml serves)
 *  - Dish: French Onion Soup (300ml soup + 30g gruyere + 50g white sourdough)
 *
 * Fixes:
 *  - Sourdough - White: stale pack data (700g/$10.90/base1200) → current invoice 1400g/$9.40
 *  - SupplierItemMapping: Bidfood demi glaze line was mis-mapped to "HP sauce" — repointed
 *
 * Usage: DATABASE_URL=... npx tsx scripts/add-french-onion-soup.ts
 * Then:  DATABASE_URL=... npx tsx scripts/recalculate-all.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  const bidfood = await db.supplier.findFirst({ where: { name: "Bidfood" } })
  if (!bidfood) throw new Error("Bidfood supplier not found")

  // ── New ingredients ──────────────────────────────────────────────
  const demiMix = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Demi Glaze Basic Brown GF (Maggi)", supplierId: bidfood.id } },
    update: { purchasePrice: 39.90, purchaseQuantity: 2, purchaseUnit: "kg", baseUnitsPerPurchase: 2000 },
    create: {
      name: "Demi Glaze Basic Brown GF (Maggi)",
      category: "DRY_GOOD",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 2,
      purchaseUnit: "kg",
      purchasePrice: 39.90,
      baseUnitsPerPurchase: 2000,
      wastePercentage: 0,
      notes: "Powder mix, 100g per litre — 2kg pail makes 20L. Bidfood inv I70449395.GOL 2026-05-31.",
    },
  })

  const beefStock = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Beef Stock - Real Campbells", supplierId: bidfood.id } },
    update: { purchasePrice: 4.11 },
    create: {
      name: "Beef Stock - Real Campbells",
      category: "OTHER",
      baseUnitType: "VOLUME",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "L",
      purchasePrice: 4.11,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
      notes: "STOCK REAL BEEF CAMPBELLS 1lt — Bidfood invoice 2026-06-03.",
    },
  })

  const hennessy = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Hennessy VS Cognac", supplierId: bidfood.id } },
    update: { purchasePrice: 87.25 },
    create: {
      name: "Hennessy VS Cognac",
      category: "OTHER",
      baseUnitType: "VOLUME",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "bottle",
      purchasePrice: 87.25,
      baseUnitsPerPurchase: 700,
      wastePercentage: 0,
      notes: "700ml bottle. Bidfood inv I70560873.GOL 2026-06-10 ($87.25).",
    },
  })

  console.log("✅ ingredients:", demiMix.id, beefStock.id, hennessy.id)

  // ── Fix stale Sourdough - White pack data (current invoices: WHITE Sourdough 1400g @ $9.40) ──
  await db.ingredient.update({
    where: { id: "cmn8ccez300fa16qz1mdo57w2" },
    data: { purchaseQuantity: 1400, purchaseUnit: "g", purchasePrice: 9.40, baseUnitsPerPurchase: 1400 },
  })
  console.log("✅ fixed Sourdough - White → 1400g / $9.40")

  // ── Repoint mis-mapped demi glaze invoice line (was → HP sauce) ──
  await db.supplierItemMapping.update({
    where: { id: "cmpv5pz4l3l0a01rwfgen50ty" },
    data: { ingredientId: demiMix.id },
  })
  await db.invoiceLineItem.update({
    where: { id: "cmpv5pz4u3l0b01rwbt1mby6t" },
    data: { ingredientId: demiMix.id, currentPrice: 39.90 },
  })
  // Map hennessy + beef stock invoice descriptions for future price tracking
  for (const [desc, ingId, unit] of [
    ["HENNESSY VS COGNAC 40%", hennessy.id, "BTL"],
    ["STOCK REAL BEEF", beefStock.id, "EA"],
    ["STOCK REAL BEEF CAMPBELLS 1lt", beefStock.id, "EA"],
  ] as const) {
    await db.supplierItemMapping.upsert({
      where: { supplierId_invoiceDescription: { supplierId: bidfood.id, invoiceDescription: desc } },
      update: { ingredientId: ingId },
      create: { supplierId: bidfood.id, invoiceDescription: desc, ingredientId: ingId, invoiceUnit: unit },
    })
  }
  console.log("✅ supplier item mappings fixed/created")

  // ── Prep: Basic Demi Glace ───────────────────────────────────────
  const demiPrep = await db.preparation.upsert({
    where: { name: "Basic Demi Glace" },
    update: {},
    create: {
      name: "Basic Demi Glace",
      category: "BASE",
      method: "Whisk 100g Maggi Demi Glaze Basic Brown GF powder per 1L cold water. Bring to boil stirring, simmer 3 min. Full 2kg pail makes 20L.",
      yieldQuantity: 20,
      yieldUnit: "l",
      yieldWeightGrams: 20000,
      batchCost: 39.90,
      costPerGram: 0.002,
      costPerServe: 2.0,
      items: { create: [{ ingredientId: demiMix.id, quantity: 2000, unit: "g", sortOrder: 0 }] },
    },
  })
  console.log("✅ prep Basic Demi Glace:", demiPrep.id)

  // Existing ingredient ids (verified in prod 2026-06-12)
  const TABLE_SALT = "cmn8ccf3400g616qzc5i2k5g2"
  const BLACK_PEPPER_GROUND = "cmn8cccrt002916qz50nmrlz0"
  const BROWN_SUGAR = "cmn8cccxs002u16qzw5hx9l2f"
  const SALTED_BUTTER_BULK = "cmn8ccer600e716qz7yv3o9fe"
  const ONION_BROWN = "cmn8ccebi00b116qzgsr52n6x"
  const GRUYERE = "cmn8ccdzd007w16qz3iycttam"
  const SOURDOUGH_WHITE = "cmn8ccez300fa16qz1mdo57w2"

  // ── Prep: Onion Soup ─────────────────────────────────────────────
  const existing = await db.preparation.findUnique({ where: { name: "Onion Soup" } })
  if (existing) {
    console.log("⚠️ Onion Soup prep already exists, skipping create:", existing.id)
  }
  const soupPrep = existing ?? await db.preparation.create({
    data: {
      name: "Onion Soup",
      category: "COMPONENT",
      method:
        "1) Cook 1kg butter + 2.5kg brown onion together and blitz (L'entrecôte-style base).\n" +
        "2) Sweat/caramelise 5kg brown onion; deglaze with 1/2 bottle (350ml) Hennessy.\n" +
        "3) Combine in stock pot with 3L basic demi glace (300g Maggi mix made up), 9L beef stock, 550g brown sugar, 100g salt & black pepper mix.\n" +
        "4) Reduce until thickened to desired consistency.\n" +
        "Assumed yield after reduction: ~15L ≈ 50 × 300ml (10oz) serves — ADJUST after first batch.",
      yieldQuantity: 50,
      yieldUnit: "serve",
      yieldWeightGrams: 15000,
      items: {
        create: [
          { subPreparationId: demiPrep.id, quantity: 3, unit: "l", sortOrder: 0 },
          { ingredientId: TABLE_SALT, quantity: 50, unit: "g", sortOrder: 1 },
          { ingredientId: BLACK_PEPPER_GROUND, quantity: 50, unit: "g", sortOrder: 2 },
          { ingredientId: BROWN_SUGAR, quantity: 550, unit: "g", sortOrder: 3 },
          { ingredientId: beefStock.id, quantity: 9, unit: "l", sortOrder: 4 },
          { ingredientId: SALTED_BUTTER_BULK, quantity: 1, unit: "kg", sortOrder: 5 },
          { ingredientId: ONION_BROWN, quantity: 2.5, unit: "kg", sortOrder: 6 },
          { ingredientId: ONION_BROWN, quantity: 5, unit: "kg", sortOrder: 7 },
          { ingredientId: hennessy.id, quantity: 350, unit: "ml", sortOrder: 8 },
        ],
      },
    },
  })
  console.log("✅ prep Onion Soup:", soupPrep.id)

  // ── Dish: French Onion Soup ──────────────────────────────────────
  const dishName = "French Onion Soup"
  const existingDish = await db.dish.findUnique({ where: { name_venue: { name: dishName, venue: "BOTH" } } })
  if (existingDish) {
    console.log("⚠️ dish already exists, skipping create:", existingDish.id)
  }
  const dish = existingDish ?? await db.dish.create({
    data: {
      name: dishName,
      menuCategory: "LUNCH",
      venue: "BOTH",
      sellingPrice: 16.90,
      sellingPriceExGst: 15.3636,
      notes:
        "NEW June 2026. Portion: 10oz (300ml) soup + 30g gruyere + 50g white sourdough. " +
        "Selling price $16.90 is a PLACEHOLDER pending Chris's pricing decision.",
      components: {
        create: [
          { preparationId: soupPrep.id, quantity: 300, unit: "ml", sortOrder: 0 },
          { ingredientId: GRUYERE, quantity: 30, unit: "g", sortOrder: 1 },
          { ingredientId: SOURDOUGH_WHITE, quantity: 50, unit: "g", sortOrder: 2 },
        ],
      },
    },
  })
  console.log("✅ dish French Onion Soup:", dish.id)

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
