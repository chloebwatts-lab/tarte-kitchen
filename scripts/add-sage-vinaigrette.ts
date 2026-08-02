/**
 * Brown Butter & Sage Vinaigrette — from Chris's Currumbin menu trials artifact
 * (screenshot pasted 2026-06-12). Completes the Winter Salad costing: adds the
 * 55ml/serve dressing line that was left as a TODO.
 *
 * Recipe (per artifact): 200g brown butter (from pastry), 20-30 fresh sage
 * leaves (costed as 25 ≈ 12.5g), 60ml apple cider vinegar, 1 tbsp dijon (20g),
 * 1 tbsp maple (20ml), salt & cracked pepper to taste (3g + 2g nominal).
 *
 * Also fixes: Bidfood "Dijon mustard" pack 370g → 2200g (price sheet shows
 * Frenchmaid 2.2kg @ exactly $16.15 — the 370g jar size was wrong).
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const BUTTER_NZ = "cmn8ccf6w00h016qz8qfgiufq"   // Unsalted Butter NZ 25kg (Fermex — pastry butter)
const SAGE = "cmn8cceqk00e216qz31hpan3x"         // Sage bunch, 50g, 30% waste
const ACV = "cmn8ccc95000v16qz4ji0434g"          // Apple cider vinegar 2L Bidfood
const DIJON_TARTE = "cmn8ccdq1006016qzoj9vs8l7"  // Dijon Mustard Tarte 1kg Fino
const MAPLE = "cmn8cce7l009x16qz90yjvb3g"        // Maple Syrup Canadian Premium 1L Bidfood
const TABLE_SALT = "cmn8ccf3400g616qzc5i2k5g2"
const BLACK_PEPPER_GROUND = "cmn8cccrt002916qz50nmrlz0"
const DIJON_BIDFOOD_BROKEN = "cmn8ccdpu005z16qz2up6s4h4"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  await db.ingredient.update({
    where: { id: DIJON_BIDFOOD_BROKEN },
    data: {
      purchaseQuantity: 2200, purchaseUnit: "g", baseUnitsPerPurchase: 2200,
      notes: "Frenchmaid 2.2kg tub — $16.15 per Bidfood price list. Pack size was wrongly 370g.",
    },
  })
  console.log("✅ fixed Bidfood Dijon pack size 370g → 2.2kg")

  const existing = await db.preparation.findUnique({ where: { name: "Brown Butter & Sage Vinaigrette" } })
  const prep = existing ?? await db.preparation.create({
    data: {
      name: "Brown Butter & Sage Vinaigrette",
      category: "DRESSING",
      method:
        "1) Re-melt 200g brown butter (from pastry) over medium heat until foaming and golden with a nutty aroma.\n" +
        "2) Add 20-30 fresh sage leaves, fry ~30 sec until crisp.\n" +
        "3) Remove from heat immediately. Whisk in 60ml apple cider vinegar, 1 tbsp dijon, 1 tbsp maple syrup — it will bubble. Season to taste.\n" +
        "Yield ≈ 315ml ≈ 5-6 × 55ml serves. (Recipe: Currumbin menu trials artifact.)",
      yieldQuantity: 315,
      yieldUnit: "ml",
      yieldWeightGrams: 315,
      items: {
        create: [
          { ingredientId: BUTTER_NZ, quantity: 200, unit: "g", sortOrder: 0 },
          { ingredientId: SAGE, quantity: 12.5, unit: "g", sortOrder: 1 },
          { ingredientId: ACV, quantity: 60, unit: "ml", sortOrder: 2 },
          { ingredientId: DIJON_TARTE, quantity: 20, unit: "g", sortOrder: 3 },
          { ingredientId: MAPLE, quantity: 20, unit: "ml", sortOrder: 4 },
          { ingredientId: TABLE_SALT, quantity: 3, unit: "g", sortOrder: 5 },
          { ingredientId: BLACK_PEPPER_GROUND, quantity: 2, unit: "g", sortOrder: 6 },
        ],
      },
    },
  })
  console.log(existing ? "⚠️ prep existed:" : "✅ prep created:", prep.id)

  const dish = await db.dish.findUnique({
    where: { name_venue: { name: "Winter Salad (Roast Vegetable)", venue: "BEACH_HOUSE" } },
    include: { components: true },
  })
  if (!dish) throw new Error("Winter Salad dish not found")
  if (dish.components.some((c) => c.preparationId === prep.id)) {
    console.log("⚠️ dressing component already on dish")
  } else {
    await db.dishComponent.create({
      data: { dishId: dish.id, preparationId: prep.id, quantity: 55, unit: "ml", sortOrder: 10 },
    })
    console.log("✅ 55ml dressing added to Winter Salad")
  }
  await db.dish.update({
    where: { id: dish.id },
    data: {
      notes:
        "NEW June 2026 — Currumbin winter menu trial (replaces Thai beef). Per-serve portions from Chris's doc 2026-06-12. " +
        "Dressing costed from Currumbin menu trials artifact recipe. Selling price $24.90 is a PLACEHOLDER.",
    },
  })

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
