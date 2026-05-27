/**
 * One-shot: add the Ketchup ingredient stack:
 *   - 2 new ingredients (Tomato polpa, Kecap manis) sourced from Bidfood
 *   - "Ketchup" preparation (yield 7500g) with the recipe lines
 *   - "Ketchup" side dish ($3.50 inc-GST, 50g portion of the prep)
 *
 * Costs are zeroed at insert time — run scripts/recalculate-all.ts after to
 * populate batchCost / costPerGram / dish totalCost / foodCostPercentage.
 *
 * Run on the droplet:
 *   docker compose --profile tools run --rm \
 *     -v /root/tarte-kitchen/scripts:/app/scripts \
 *     migrate npx tsx scripts/_seed-ketchup.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function findIngByName(name: string) {
  const rows = await db.ingredient.findMany({ where: { name } })
  if (rows.length === 0) throw new Error(`Ingredient not found: ${name}`)
  if (rows.length > 1) {
    console.warn(`  ⚠  Multiple matches for "${name}", using first (${rows[0].id})`)
  }
  return rows[0]
}

async function main() {
  console.log("🍅  Seeding Ketchup ingredients + preparation + dish…\n")

  // ── Find / fetch existing supplier ────────────────────────────────────
  const bidfood = await db.supplier.findFirst({ where: { name: "Bidfood" } })
  if (!bidfood) throw new Error("Bidfood supplier not found")

  // ── 1. Two new ingredients ────────────────────────────────────────────

  // Tomato polpa — Bidfood "ALFINAS SOVRANO TOMATOES POLPA FINELY CHOPPED"
  // 4.05kg can @ $17.31  →  $4.27/kg
  const tomatoPolpa = await db.ingredient.upsert({
    where: {
      // Ingredient unique = (name, supplierId). Use that for idempotency.
      name_supplierId: { name: "Tomato polpa", supplierId: bidfood.id },
    },
    update: {
      purchaseQuantity: 4.05,
      purchaseUnit: "kg",
      purchasePrice: 17.31,
      baseUnitsPerPurchase: 4050,
    },
    create: {
      name: "Tomato polpa",
      category: "DRY_GOOD",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      supplierProductCode: "179710",
      purchaseQuantity: 4.05,
      purchaseUnit: "kg",
      purchasePrice: 17.31,
      baseUnitsPerPurchase: 4050,
      wastePercentage: 0,
      notes: "Alfinas Sovrano brand, finely chopped Italian polpa, 4.05kg can.",
    },
  })
  console.log(`  ✅  Tomato polpa  (${tomatoPolpa.id})  $4.27/kg`)

  // Kecap manis — Bidfood "KETJAP MANIS (SWEET SOY SAUCE) ABC 6kg(4lt)"
  // 6kg pack @ $26.08  →  $4.35/kg
  const kecapManis = await db.ingredient.upsert({
    where: {
      name_supplierId: { name: "Kecap manis", supplierId: bidfood.id },
    },
    update: {
      purchaseQuantity: 6,
      purchaseUnit: "kg",
      purchasePrice: 26.08,
      baseUnitsPerPurchase: 6000,
    },
    create: {
      name: "Kecap manis",
      category: "CONDIMENT",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 6,
      purchaseUnit: "kg",
      purchasePrice: 26.08,
      baseUnitsPerPurchase: 6000,
      wastePercentage: 0,
      notes: "ABC sweet soy sauce, 6kg (4L) pack from Bidfood.",
      allergens: ["SOY", "WHEAT", "GLUTEN"],
    },
  })
  console.log(`  ✅  Kecap manis  (${kecapManis.id})  $4.35/kg\n`)

  // ── 2. Look up existing ingredients used in the recipe ────────────────
  const passata = await findIngByName("Passata Tomato Puree Mutti")
  const onionRed = await findIngByName("Onion - Red")
  const fennelBulb = await findIngByName("Fennel Bulb")
  const celeryBunch = await findIngByName("Celery bunch")
  const ginger = await findIngByName("Ginger")
  const garlicPeeled = await findIngByName("Garlic (peeled)")
  const basil = await findIngByName("Basil")
  const corianderSeeds = await findIngByName("Coriander seeds")
  const cloveWhole = await findIngByName("Clove whole")
  const brownSugar = await findIngByName("Brown sugar")
  const redWineVinegar = await findIngByName("Red Wine Vinegar")
  const evoo = await findIngByName("Olive oil extra virgin")

  // ── 3. Ketchup preparation (yield 7500g) ──────────────────────────────
  // Idempotent: delete + recreate if it already exists. Cleaner than
  // chasing PreparationItem upserts (no natural unique key on lines).
  const existing = await db.preparation.findUnique({ where: { name: "Ketchup" } })
  if (existing) {
    console.log(`  🗑  Removing existing "Ketchup" prep (${existing.id})`)
    await db.preparation.delete({ where: { id: existing.id } })
  }

  const ketchup = await db.preparation.create({
    data: {
      name: "Ketchup",
      category: "SAUCE",
      yieldQuantity: 7500,
      yieldUnit: "g",
      yieldWeightGrams: 7500,
      method: [
        "1. Sweat celery, ginger, garlic, basil stalks, coriander seeds and cloves in EVOO with salt and pepper.",
        "2. Add polpa, passata and water.",
        "3. Add salt and pepper.",
        "4. Simmer until reduced by half.",
        "5. Blend until smooth.",
        "6. Add brown sugar, red wine vinegar and kecap manis.",
        "7. Cook for another 15 minutes or until desired ketchup consistency.",
        "8. Finish seasoning.",
      ].join("\n"),
      items: {
        create: [
          { ingredientId: tomatoPolpa.id,   quantity: 2400, unit: "g",  sortOrder: 0,  lineCost: 0 },
          { ingredientId: passata.id,       quantity: 4000, unit: "ml", sortOrder: 1,  lineCost: 0 }, // 4200g ÷ 1.05 g/ml ≈ 4000ml
          { ingredientId: onionRed.id,      quantity: 300,  unit: "g",  sortOrder: 2,  lineCost: 0 }, // 2 × ~150g
          { ingredientId: fennelBulb.id,    quantity: 3,    unit: "ea", sortOrder: 3,  lineCost: 0 },
          { ingredientId: celeryBunch.id,   quantity: 360,  unit: "g",  sortOrder: 4,  lineCost: 0 }, // 6 sticks × 60g
          { ingredientId: ginger.id,        quantity: 30,   unit: "g",  sortOrder: 5,  lineCost: 0 },
          { ingredientId: garlicPeeled.id,  quantity: 70,   unit: "g",  sortOrder: 6,  lineCost: 0 }, // 14 cloves × 5g
          { ingredientId: basil.id,         quantity: 4,    unit: "ea", sortOrder: 7,  lineCost: 0 }, // 4 bunches
          { ingredientId: corianderSeeds.id,quantity: 30,   unit: "g",  sortOrder: 8,  lineCost: 0 }, // 6 tbsp × 5g
          { ingredientId: cloveWhole.id,    quantity: 1,    unit: "g",  sortOrder: 9,  lineCost: 0 }, // 12 cloves ≈ 1g
          { ingredientId: brownSugar.id,    quantity: 840,  unit: "g",  sortOrder: 10, lineCost: 0 },
          { ingredientId: redWineVinegar.id,quantity: 800,  unit: "ml", sortOrder: 11, lineCost: 0 },
          { ingredientId: kecapManis.id,    quantity: 160,  unit: "g",  sortOrder: 12, lineCost: 0 },
          { ingredientId: evoo.id,          quantity: 45,   unit: "ml", sortOrder: 13, lineCost: 0 }, // 3 tbsp × 15ml
          // Salt + pepper "to taste" → omitted; trivial cost
          // Water 1L → no cost
        ],
      },
    },
  })
  console.log(`  ✅  Ketchup preparation  (${ketchup.id})  yield 7500g\n`)

  // ── 4. Ketchup side dish: $3.50 inc-GST / 50g portion ─────────────────
  // Dish unique = (name, venue). Available at all venues → BOTH.
  const dish = await db.dish.upsert({
    where: { name_venue: { name: "Ketchup", venue: "BOTH" } },
    update: {
      sellingPrice: 3.5,
      sellingPriceExGst: 3.5 / 1.1,
      menuCategory: "SIDES",
      isActive: true,
    },
    create: {
      name: "Ketchup",
      menuCategory: "SIDES",
      venue: "BOTH",
      sellingPrice: 3.5,
      sellingPriceExGst: Number((3.5 / 1.1).toFixed(4)),
      isActive: true,
      notes: "House-made ketchup, sold as a side. Wastage tracked separately via the wastage section.",
      components: {
        create: [
          { preparationId: ketchup.id, quantity: 50, unit: "g", sortOrder: 0, lineCost: 0 },
        ],
      },
    },
  })
  console.log(`  ✅  Ketchup side dish  (${dish.id})  $3.50 inc-GST / 50g\n`)

  console.log("Done. Now run:  npx tsx scripts/recalculate-all.ts")
  await db.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
