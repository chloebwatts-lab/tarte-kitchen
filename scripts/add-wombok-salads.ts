/**
 * Wombok salads — Chris's two handwritten specs (2026-06-12).
 *
 * 1) "Wombok Side Salad" prep (per serve: wombok 100g, coriander 5g, mint 5g,
 *    rocket 15g, lemon dressing 30g) — swapped onto Pea & Halloumi Fritters
 *    Plated (replaces Asian Salad 60g + Lemon Dressing 15g lines; sweet chilli
 *    stays). NOTE: no Fish n Chips dish exists in TK yet — attach there when created.
 *
 * 2) "Wombok Miso Chicken Salad" dish (BEACH_HOUSE): wombok 220g, coriander 15g,
 *    fried onion 10g, thai basil 15g, mint 5g, poached chicken 115g, spring onion
 *    10g, crispy chilli 20g. Wontons crossed out on spec. DRESSING PENDING —
 *    sesame-miso citrus quantities unreadable, awaiting Chris's confirmation.
 *
 * Price fixes (invoices):
 *  - Wombok cabbage $8.20 → $3.00/ea (Pacific 2026-05-26)
 *  - Coriander $2.80 → $2.60/bunch (Pacific 2026-06-11)
 *  - Mint $3.00 → $2.60/bunch (Pacific 2026-06-11)
 *  - Thai Basil $2.50 → $4.85/bunch, supplier Jensens (2026-06-10)
 *  - Onions Fried (Shallots) $8.29 → $9.16/kg (Bidfood 2026-06-01)
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const IDS = {
  WOMBOK: "cmn8ccfbe00i016qz968i927v",
  CORIANDER: "cmn8ccdl6005716qzqbvemxxu",
  MINT: "cmn8cce8l00a816qzkxgglmi8",
  ROCKET: "cmn8ccep300ds16qzz6v1hdst",
  THAI_BASIL: "cmimp43f06482c1dda4b9b77",
  FRIED_ONION: "cmn8ccecg00b416qz0r05fk2d",
  CHICKEN_BREAST: "cmn8ccddo004516qzxiydaj8t",
  SPRING_ONION: "cmn8ccf0g00fk16qznvs8a17l",
  LEMON_DRESSING_PREP: "cmn8ccfjf00kq16qzldg6xe79",
  CRISPY_CHILLI_PREP: "cmn8ccffs00jl16qzp7ordld9",
  FRITTERS_DISH: "cmn8ddmsn000101pi5lomtn5m",
  FRITTERS_ASIAN_SALAD_COMP: "dc_phf_02",
  FRITTERS_LEMON_COMP: "dc_phf_03",
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const jensens = await db.supplier.findFirst({ where: { name: "Jensens" } })

  // ── price fixes ──────────────────────────────────────────────────
  await db.ingredient.update({ where: { id: IDS.WOMBOK }, data: { purchasePrice: 3.00 } })
  await db.ingredient.update({ where: { id: IDS.CORIANDER }, data: { purchasePrice: 2.60 } })
  await db.ingredient.update({ where: { id: IDS.MINT }, data: { purchasePrice: 2.60 } })
  await db.ingredient.update({ where: { id: IDS.THAI_BASIL }, data: { purchasePrice: 4.85, supplierId: jensens?.id ?? undefined } })
  await db.ingredient.update({ where: { id: IDS.FRIED_ONION }, data: { purchasePrice: 9.16 } })
  console.log("✅ price fixes: wombok $3.00, coriander $2.60, mint $2.60, thai basil $4.85, fried onion $9.16")

  // ── Prep: Wombok Side Salad ──────────────────────────────────────
  const existing = await db.preparation.findUnique({ where: { name: "Wombok Side Salad" } })
  const sideSalad = existing ?? await db.preparation.create({
    data: {
      name: "Wombok Side Salad",
      category: "COMPONENT",
      method: "Per serve: shred 100g wombok, toss with 5g coriander, 5g mint, 15g rocket, dress with 30g lemon dressing. Side for Pea Fritters + Fish n Chips.",
      yieldQuantity: 1,
      yieldUnit: "serve",
      yieldWeightGrams: 155,
      items: {
        create: [
          { ingredientId: IDS.WOMBOK, quantity: 100, unit: "g", sortOrder: 0 },
          { ingredientId: IDS.CORIANDER, quantity: 5, unit: "g", sortOrder: 1 },
          { ingredientId: IDS.MINT, quantity: 5, unit: "g", sortOrder: 2 },
          { ingredientId: IDS.ROCKET, quantity: 15, unit: "g", sortOrder: 3 },
          { subPreparationId: IDS.LEMON_DRESSING_PREP, quantity: 30, unit: "g", sortOrder: 4 },
        ],
      },
    },
  })
  console.log(existing ? "⚠️ side salad prep existed:" : "✅ prep Wombok Side Salad:", sideSalad.id)

  // ── Swap side salad onto fritters dish ───────────────────────────
  const oldComps = await db.dishComponent.findMany({
    where: { id: { in: [IDS.FRITTERS_ASIAN_SALAD_COMP, IDS.FRITTERS_LEMON_COMP] } },
  })
  if (oldComps.length) {
    await db.dishComponent.deleteMany({ where: { id: { in: oldComps.map((c) => c.id) } } })
    await db.dishComponent.create({
      data: { dishId: IDS.FRITTERS_DISH, preparationId: sideSalad.id, quantity: 1, unit: "serve", sortOrder: 1 },
    })
    console.log("✅ fritters: Asian Salad 60g + Lemon Dressing 15g → Wombok Side Salad 1 serve (sweet chilli kept)")
  } else {
    console.log("⚠️ fritters components already swapped")
  }

  // ── Dish: Wombok Miso Chicken Salad ──────────────────────────────
  const existingDish = await db.dish.findUnique({ where: { name_venue: { name: "Wombok Miso Chicken Salad", venue: "BEACH_HOUSE" } } })
  if (existingDish) {
    console.log("⚠️ dish exists, skipping:", existingDish.id)
  } else {
    const dish = await db.dish.create({
      data: {
        name: "Wombok Miso Chicken Salad",
        menuCategory: "LUNCH",
        venue: "BEACH_HOUSE",
        sellingPrice: 24.90,
        sellingPriceExGst: 22.6364,
        notes:
          "Currumbin winter menu (adaptation of Burleigh wombok slaw). Per Chris's spec 2026-06-12: wombok 220g, coriander 15g, " +
          "fried onion 10g, thai basil 15g, mint 5g, poached shredded chicken 115g, spring onion 10g, crispy chilli 20g. Wontons removed from spec. " +
          "MISSING: sesame-miso citrus dressing — quantities on chef's notepad ambiguous, awaiting Chris's totals + ml per serve. " +
          "Selling price $24.90 PLACEHOLDER.",
        components: {
          create: [
            { ingredientId: IDS.WOMBOK, quantity: 220, unit: "g", sortOrder: 0 },
            { ingredientId: IDS.CHICKEN_BREAST, quantity: 115, unit: "g", sortOrder: 1 },
            { ingredientId: IDS.CORIANDER, quantity: 15, unit: "g", sortOrder: 2 },
            { ingredientId: IDS.THAI_BASIL, quantity: 15, unit: "g", sortOrder: 3 },
            { ingredientId: IDS.MINT, quantity: 5, unit: "g", sortOrder: 4 },
            { ingredientId: IDS.SPRING_ONION, quantity: 10, unit: "g", sortOrder: 5 },
            { ingredientId: IDS.FRIED_ONION, quantity: 10, unit: "g", sortOrder: 6 },
            { preparationId: IDS.CRISPY_CHILLI_PREP, quantity: 20, unit: "g", sortOrder: 7 },
          ],
        },
      },
    })
    console.log("✅ dish Wombok Miso Chicken Salad:", dish.id)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
