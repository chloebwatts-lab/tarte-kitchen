/**
 * Sesame-Miso Citrus Dressing — Wombok Miso Chicken Salad (Currumbin).
 * Final quantities confirmed by Chris 2026-06-12: miso 150g, rice vinegar 190g,
 * sesame oil 9g, soy 100g, maple 175g, orange juice 185g. 80ml per salad.
 *
 * New ingredients:
 *  - Sesame Oil (Pandaroo 150ml) — Bidfood $3.90/btl (inv 2026-05-20)
 *  - Orange Juice - Fresh (house) — $3.74/L (Valencia $1.87/kg @ ~50% juice yield)
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const WHITE_MISO = "cmn8ccfan00ho16qzfo96iptu"
const RICE_VINEGAR = "cmn8cceoj00do16qzd1hp5l4r"
const SOY_SAUCE = "cmn8cceze00fc16qzjkzlwmey"
const MAPLE = "cmn8cce7l009x16qz90yjvb3g"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const bidfood = await db.supplier.findFirst({ where: { name: "Bidfood" } })
  if (!bidfood) throw new Error("Bidfood not found")

  const sesameOil = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Sesame Oil", supplierId: bidfood.id } },
    update: { purchasePrice: 3.90 },
    create: {
      name: "Sesame Oil", category: "OIL", baseUnitType: "VOLUME",
      supplierId: bidfood.id, purchaseQuantity: 150, purchaseUnit: "ml",
      purchasePrice: 3.90, baseUnitsPerPurchase: 150, wastePercentage: 0,
      notes: "OIL SESAME PANDAROO 150ml — Bidfood inv 2026-05-20 $3.90.",
    },
  })
  let oj = await db.ingredient.findFirst({ where: { name: "Orange Juice - Fresh (house)" } })
  oj = oj ?? await db.ingredient.create({
    data: {
      name: "Orange Juice - Fresh (house)", category: "OTHER", baseUnitType: "VOLUME",
      supplierId: null, purchaseQuantity: 1, purchaseUnit: "L",
      purchasePrice: 3.74, baseUnitsPerPurchase: 1000, wastePercentage: 0,
      notes: "House-squeezed from Orange Valencia ($1.87/kg, ~50% juice yield → $3.74/L).",
    },
  })
  await db.supplierItemMapping.upsert({
    where: { supplierId_invoiceDescription: { supplierId: bidfood.id, invoiceDescription: "OIL SESAME PANDAROO 150ml" } },
    update: { ingredientId: sesameOil.id },
    create: { supplierId: bidfood.id, invoiceDescription: "OIL SESAME PANDAROO 150ml", ingredientId: sesameOil.id },
  })
  console.log("✅ ingredients:", sesameOil.id, oj.id)

  const existing = await db.preparation.findUnique({ where: { name: "Sesame-Miso Citrus Dressing" } })
  const dressing = existing ?? await db.preparation.create({
    data: {
      name: "Sesame-Miso Citrus Dressing",
      category: "DRESSING",
      method:
        "Whisk miso, rice vinegar, soy, sesame oil, orange juice and maple until smooth and emulsified. " +
        "Store in squeeze bottle in the fridge. 80ml per Wombok Miso Chicken Salad.\n" +
        "(Final quantities confirmed by Chris 2026-06-12.)",
      yieldQuantity: 809,
      yieldUnit: "ml",
      yieldWeightGrams: 809,
      items: {
        create: [
          { ingredientId: WHITE_MISO, quantity: 150, unit: "g", sortOrder: 0 },
          { ingredientId: RICE_VINEGAR, quantity: 190, unit: "g", sortOrder: 1 },
          { ingredientId: sesameOil.id, quantity: 9, unit: "g", sortOrder: 2 },
          { ingredientId: SOY_SAUCE, quantity: 100, unit: "g", sortOrder: 3 },
          { ingredientId: MAPLE, quantity: 175, unit: "g", sortOrder: 4 },
          { ingredientId: oj.id, quantity: 185, unit: "g", sortOrder: 5 },
        ],
      },
    },
  })
  console.log(existing ? "⚠️ dressing existed:" : "✅ prep Sesame-Miso Citrus Dressing:", dressing.id)

  const dish = await db.dish.findUnique({
    where: { name_venue: { name: "Wombok Miso Chicken Salad", venue: "BEACH_HOUSE" } },
    include: { components: true },
  })
  if (!dish) throw new Error("salad dish not found")
  if (dish.components.some((c) => c.preparationId === dressing.id)) {
    console.log("⚠️ dressing already on dish")
  } else {
    await db.dishComponent.create({
      data: { dishId: dish.id, preparationId: dressing.id, quantity: 80, unit: "ml", sortOrder: 8 },
    })
    console.log("✅ 80ml dressing added to Wombok Miso Chicken Salad")
  }
  await db.dish.update({
    where: { id: dish.id },
    data: {
      notes:
        "Currumbin winter menu (adaptation of Burleigh wombok slaw). Per Chris's spec 2026-06-12: wombok 220g, coriander 15g, " +
        "fried onion 10g, thai basil 15g, mint 5g, poached shredded chicken 115g, spring onion 10g, crispy chilli 20g, " +
        "80ml sesame-miso citrus dressing. Wontons removed from spec. Selling price $24.90 PLACEHOLDER.",
    },
  })

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
