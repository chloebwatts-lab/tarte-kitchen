/**
 * Hash Bagel + Spanish Baked Beans (vege, + chorizo variant) — winter menu 2026-07.
 * Spec: Chloe WhatsApp 2026-07-15 + Spanish_Chorizo_Beans_Cafe_Recipe_Improved.pdf.
 *
 * Hash Bagel = BEC Bagel minus bacon, minus gochujang mayo, plus plain Kewpie
 * mayo (same 25g), plus 1 serve of Potato Hash. Menu: "House made rosti potato
 * hash, free range egg, cheese, pickles, house BBQ sauce, mayo".
 *
 * Spanish Baked Beans: vege base prep (NO chorizo — chorizo is cooked into the
 * skillet per order as its own dish variant). Base batched at 4x the recipe PDF.
 * Portion 300g = "small customer skillet, bit less than a tomato soup portion"
 * (Chloe's guess — RE-WEIGH a real skillet and adjust).
 * Parmesan 7g / chives 2g / sourdough 90g / butter 10g mirror Miso Scramble.
 * Goat feta 40g ASSUMED. Chorizo 70g raw/serve ASSUMED ("large scoop").
 *
 * Data fixes riding along:
 *  - "Goat - marinated" (= Meredith marinated goat cheese 2kg, SOB): allergens
 *    {} -> {MILK} (real gap found during allergen review)
 *  - Chorizo sausage $18.15 -> $18.60/kg (SOB inv 2026-07-09) + PriceHistory
 *
 * New ingredient: Five Bean Mix (tin) — PLACEHOLDER $12.50 / 2.95kg A9 tin
 * (Edgell-style, no invoice yet), waste 37% = drained brine.
 *
 * SELLING PRICES ARE PLACEHOLDERS: Hash Bagel $19.90, Beans $23.90,
 * Beans+Chorizo $29.90 (= +$6 add-on). Chloe to confirm.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const IDS = {
  BAGEL_EVERYTHING: "cmn8cccgz001f16qzu0k0bce2",
  RED_CHEDDAR: "cmn8cceno00df16qz7xpq0rto",
  HOUSE_PICKLES_PREP: "cmn8ccfig00kj16qzauax8p61",
  BBQ_SAUCE_PREP: "cmn8ccfd200il16qzn5x0bm3e",
  SCRAMBLE_PREP: "cmn8ccfmt00m416qz6k2vj5gt",
  POTATO_HASH_PREP: "cmn8ccflr00lr16qzsh8vckiz",
  SALTED_BUTTER: "cmn8ccer200e616qzwbqhl3tt",
  EGG: "cmn8ccdwm007916qzosd7ljjv",
  TABLE_SALT: "cmn8ccf3400g616qzc5i2k5g2",
  SOURDOUGH_WHITE: "cmn8ccez300fa16qz1mdo57w2",
  PARMESAN_CHEESE: "cmn8cceec00bj16qzai0g0899",
  CHIVES: "cmn8ccdfu004g16qzynxy0p7p",
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const byName = async (name: string) => {
    const i = await db.ingredient.findFirst({ where: { name } })
    if (!i) throw new Error(`ingredient lookup failed: ${name}`)
    return i
  }

  const kewpie = await byName("Mayonnaise Kewpie")
  const goatFeta = await byName("Goat - marinated")
  const chorizo = await byName("Chorizo sausage")
  const oliveOil2 = await byName("Olive oil 2nd grade")
  const brownOnion = await byName("Onion - Brown Large Bag")
  const redCapsicum = await byName("Red capsicum")
  const garlic = await byName("Garlic (peeled)")
  const tomatoPaste = await byName("Tomato Paste")
  const polpa = await byName("Tomato polpa")
  const vegStock = await byName("Vegetable Stock - Real Campbells")
  const smokedPaprika = await byName("Smoked paprika")
  const cumin = await byName("Cumin powder")
  const sweetPaprika = await byName("Paprika sweet")
  const chilliFlakes = await byName("Chilli Flakes")
  const brownSugar = await byName("Brown sugar")
  const blackPepper = await byName("Black pepper ground")
  const sherry = await byName("Sherry vinegar")
  const parsley = await byName("Flat Parsley")

  // ── data fixes ───────────────────────────────────────────────────
  if (!goatFeta.allergens.includes("MILK")) {
    await db.ingredient.update({
      where: { id: goatFeta.id },
      data: {
        allergens: [...goatFeta.allergens, "MILK"],
        notes: ((goatFeta.notes ?? "") + " Meredith marinated goat CHEESE (feta) 2kg — MILK added 2026-07-15 (was blank).").trim(),
      },
    })
    console.log("✅ Goat - marinated: +MILK")
  } else console.log("NO-OP goat feta milk")

  if (Number(chorizo.purchasePrice) !== 18.6) {
    await db.priceHistory.create({
      data: { ingredientId: chorizo.id, oldPrice: chorizo.purchasePrice, newPrice: 18.6, oldUnit: chorizo.purchaseUnit, oldQuantity: chorizo.purchaseQuantity },
    })
    await db.ingredient.update({
      where: { id: chorizo.id },
      data: { purchasePrice: 18.6, notes: ((chorizo.notes ?? "") + " $18.60/kg per SOB inv 2026-07-09 (Chorizo Rodriguez). Rodriguez = soy/gluten free, may contain milk traces; CHECK LABEL for sulphites (preservative 220-228).").trim() },
    })
    console.log("✅ Chorizo price 18.15 -> 18.60 (+PriceHistory)")
  } else console.log("NO-OP chorizo price")

  // ── new ingredient: five bean mix ────────────────────────────────
  let beans = await db.ingredient.findFirst({ where: { name: "Five Bean Mix (tin)" } })
  if (!beans) {
    beans = await db.ingredient.create({
      data: {
        name: "Five Bean Mix (tin)", category: "OTHER", baseUnitType: "WEIGHT",
        purchaseQuantity: 2.95, purchaseUnit: "kg", purchasePrice: 12.5,
        baseUnitsPerPurchase: 2950, wastePercentage: 37,
        notes: "A9 tin (Edgell-style) — $12.50 is a PLACEHOLDER, no invoice yet; UPDATE on first invoice. Waste 37% = drained brine (recipe uses drained beans).",
      },
    })
    console.log("✅ ingredient Five Bean Mix (tin):", beans.id)
  } else console.log("NO-OP five bean mix exists:", beans.id)

  // ── prep: Spanish Baked Beans (Vege Base), 4x the recipe PDF ─────
  let beansPrep = await db.preparation.findUnique({ where: { name: "Spanish Baked Beans (Vege Base)" } })
  if (!beansPrep) {
    beansPrep = await db.preparation.create({
      data: {
        name: "Spanish Baked Beans (Vege Base)",
        category: "SAUCE",
        method:
          "VEGE base — chorizo is cooked separately per order (see dish note). 4x the recipe PDF.\n" +
          "1) Heat oil, sweat onion + capsicum 8-10 min until soft and sweet.\n" +
          "2) Garlic 1 min. Tomato paste 2-3 min to caramelise.\n" +
          "3) Smoked paprika, sweet paprika, cumin, chilli flakes — 30 sec.\n" +
          "4) Tomato polpa, drained five-bean mix, brown sugar; loosen with veg stock.\n" +
          "5) Gentle simmer uncovered 20-25 min until rich and thick. Season.\n" +
          "6) Off heat: sherry vinegar + chopped parsley. Rest before service.\n" +
          "CHORIZO OPTION (per order): large scoop (~70g) diced chorizo, browned, beans added to the pan so chorizo cooks INSIDE the sauce while warming; broken feta UNDER the egg, fried egg to finish (per Chloe/Vini).",
        yieldQuantity: 4100,
        yieldUnit: "g",
        yieldWeightGrams: 4100,
        items: {
          create: [
            { ingredientId: oliveOil2.id, quantity: 80, unit: "ml", sortOrder: 0 },
            { ingredientId: brownOnion.id, quantity: 800, unit: "g", sortOrder: 1 },
            { ingredientId: redCapsicum.id, quantity: 720, unit: "g", sortOrder: 2 },
            { ingredientId: garlic.id, quantity: 80, unit: "g", sortOrder: 3 },
            { ingredientId: tomatoPaste.id, quantity: 160, unit: "g", sortOrder: 4 },
            { ingredientId: polpa.id, quantity: 1600, unit: "g", sortOrder: 5 },
            { ingredientId: beans.id, quantity: 1000, unit: "g", sortOrder: 6 },
            { ingredientId: vegStock.id, quantity: 400, unit: "ml", sortOrder: 7 },
            { ingredientId: smokedPaprika.id, quantity: 20, unit: "g", sortOrder: 8 },
            { ingredientId: cumin.id, quantity: 12, unit: "g", sortOrder: 9 },
            { ingredientId: sweetPaprika.id, quantity: 6, unit: "g", sortOrder: 10 },
            { ingredientId: chilliFlakes.id, quantity: 2, unit: "g", sortOrder: 11 },
            { ingredientId: brownSugar.id, quantity: 20, unit: "g", sortOrder: 12 },
            { ingredientId: IDS.TABLE_SALT, quantity: 12, unit: "g", sortOrder: 13 },
            { ingredientId: blackPepper.id, quantity: 4, unit: "g", sortOrder: 14 },
            { ingredientId: sherry.id, quantity: 20, unit: "ml", sortOrder: 15 },
            { ingredientId: parsley.id, quantity: 30, unit: "g", sortOrder: 16 },
          ],
        },
      },
    })
    console.log("✅ prep Spanish Baked Beans (Vege Base):", beansPrep.id)
  } else console.log("NO-OP beans prep exists:", beansPrep.id)

  // ── dish: Hash Bagel ─────────────────────────────────────────────
  const hashBagelExists = await db.dish.findUnique({ where: { name_venue: { name: "Hash Bagel", venue: "BOTH" } } })
  if (hashBagelExists) {
    console.log("NO-OP Hash Bagel exists:", hashBagelExists.id)
  } else {
    const dish = await db.dish.create({
      data: {
        name: "Hash Bagel",
        menuCategory: "BREAKFAST",
        venue: "BOTH",
        sellingPrice: 19.9,
        sellingPriceExGst: 18.0909,
        notes:
          "Winter menu 2026-07. = BEC Bagel minus bacon, minus gochujang mayo; plain Kewpie mayo 25g (same weight), + 1 serve Potato Hash. " +
          "Menu: house made rosti potato hash, free range egg, cheese, pickles, house BBQ sauce, mayo. SELLING PRICE $19.90 PLACEHOLDER — Chloe to confirm.",
        components: {
          create: [
            { ingredientId: IDS.BAGEL_EVERYTHING, quantity: 1, unit: "ea", sortOrder: 0 },
            { preparationId: IDS.POTATO_HASH_PREP, quantity: 1, unit: "serve", sortOrder: 1 },
            { preparationId: IDS.SCRAMBLE_PREP, quantity: 130, unit: "g", sortOrder: 2 },
            { ingredientId: IDS.RED_CHEDDAR, quantity: 35, unit: "g", sortOrder: 3 },
            { preparationId: IDS.HOUSE_PICKLES_PREP, quantity: 80, unit: "g", sortOrder: 4 },
            { preparationId: IDS.BBQ_SAUCE_PREP, quantity: 30, unit: "g", sortOrder: 5 },
            { ingredientId: kewpie.id, quantity: 25, unit: "g", sortOrder: 6 },
            { ingredientId: IDS.SALTED_BUTTER, quantity: 15, unit: "g", sortOrder: 7 },
          ],
        },
      },
    })
    console.log("✅ dish Hash Bagel:", dish.id)
  }

  // ── dishes: Spanish Baked Beans (+ chorizo variant) ──────────────
  const beansDishes: Array<{ name: string; price: number; exGst: number; extra?: Array<{ ingredientId: string; quantity: number; unit: string }>; note: string }> = [
    {
      name: "Spanish Baked Beans",
      price: 23.9, exGst: 21.7273,
      note: "VEGE (kept vege this year — no chorizo in base). 300g base = small skillet, bit less than a tomato soup portion (Chloe's guess) — RE-WEIGH and adjust. Feta 40g assumed. Parmesan/chives/sourdough/butter mirror Miso Scramble. PRICE $23.90 PLACEHOLDER.",
    },
    {
      name: "Spanish Baked Beans - Chorizo",
      price: 29.9, exGst: 27.1818,
      extra: [{ ingredientId: chorizo.id, quantity: 70, unit: "g" }],
      note: "Chorizo option: ~70g raw diced chorizo (ASSUMED 'large scoop') browned, cooked INSIDE the sauce while warming per order; broken feta UNDER the egg, fried egg on top. PRICE $29.90 PLACEHOLDER (= vege + $6).",
    },
  ]
  for (const d of beansDishes) {
    const exists = await db.dish.findUnique({ where: { name_venue: { name: d.name, venue: "BEACH_HOUSE" } } })
    if (exists) { console.log(`NO-OP ${d.name} exists:`, exists.id); continue }
    const base = [
      { preparationId: beansPrep.id, quantity: 300, unit: "g", sortOrder: 0 },
      { ingredientId: IDS.EGG, quantity: 1, unit: "ea", sortOrder: 1 },
      { ingredientId: goatFeta.id, quantity: 40, unit: "g", sortOrder: 2 },
      { ingredientId: IDS.SOURDOUGH_WHITE, quantity: 90, unit: "g", sortOrder: 3 },
      { ingredientId: IDS.SALTED_BUTTER, quantity: 10, unit: "g", sortOrder: 4 },
      { ingredientId: IDS.PARMESAN_CHEESE, quantity: 7, unit: "g", sortOrder: 5 },
      { ingredientId: IDS.CHIVES, quantity: 2, unit: "g", sortOrder: 6 },
    ]
    const extra = (d.extra ?? []).map((e, i) => ({ ...e, sortOrder: base.length + i }))
    const dish = await db.dish.create({
      data: {
        name: d.name,
        menuCategory: "BREAKFAST",
        venue: "BEACH_HOUSE",
        sellingPrice: d.price,
        sellingPriceExGst: d.exGst,
        notes: "Winter menu 2026-07. Menu: 5 beans, rich tomato sauce, capsicum, spices, fried egg, Meredith goat's feta, toasted sourdough, parmesan, chives. " + d.note,
        components: { create: [...base, ...extra] },
      },
    })
    console.log(`✅ dish ${d.name}:`, dish.id)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
