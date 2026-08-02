/**
 * Winter Salad (Roast Vegetable Salad) — Currumbin menu trials, per Chris's
 * portion doc (2026-06-12) + invoice-verified prices.
 *
 * Also applies Chris's corrections from the same message:
 *  - Gruyere = Lustenberger Swiss from Bidfood (rename existing ingredient; price unverified, no invoice yet)
 *  - Sourdough - White: loaf is actually 1200g (marketed 1400g), 30% waste per loaf
 *
 * Price fixes from recent invoices (existing-data corrections):
 *  - Eggplant: broken COUNT box ($32/box @350g/unit) → WEIGHT $4.40/kg Pacific (inv 2026-06-11)
 *  - Red capsicum $4.35 → $5.88/kg (Pacific 2026-05-15)
 *  - Zucchini Med/Lg $3.60 → $2.88/kg (Pacific 2026-06-09)
 *  - Eshallot - golden $7.45 → $5.60/kg (Pacific 2026-06-10)
 *  - Baby red beetroot $3.95 → $4.85/bunch (Jensens 2026-06-11)
 *  - Hazelnut whole $16.25 → $48.56/kg Bidfood (inv 2026-06-07 + 06-10)
 *  - Sage $3.80 → $4.75/bunch (Pacific 2026-06-07)
 *
 * New ingredients (ASSUMED pack weights flagged in notes):
 *  - Leek (Pacific $5.20/bunch, assume 2 stems ≈ 700g, 30% trim)
 *  - Frisee - Gourmet Endive (Jensens $46.50/box, ASSUME 3kg box, 40% trim)
 *  - Red Vein Sorrel (Jensens $11.55/punnet, ASSUME 100g punnet)
 *
 * NOT created: Sage Butter Dressing prep — recipe lives in Chris's
 * "Currumbin menu trials" artifact which is not accessible here. Dish notes
 * carry the 55ml line as a TODO; do not invent the recipe.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/add-winter-salad.ts && npx tsx scripts/recalculate-all.ts
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
  const pacific = await db.supplier.findFirst({ where: { name: "Pacific Wholesale" } })
  const jensens = await db.supplier.findFirst({ where: { name: "Jensens" } })
  if (!bidfood || !pacific || !jensens) throw new Error("supplier lookup failed")

  // ── Chris's corrections ──────────────────────────────────────────
  await db.ingredient.update({
    where: { id: "cmn8ccdzd007w16qz3iycttam" },
    data: {
      name: "Gruyere Swiss Lustenberger",
      notes: "Lustenberger Swiss gruyere via Bidfood (confirmed by Chris 2026-06-12). $43.88/kg is pre-existing price — no invoice on record yet, verify on next Bidfood invoice.",
    },
  })
  await db.ingredient.update({
    where: { id: "cmn8ccez300fa16qz1mdo57w2" },
    data: {
      purchaseQuantity: 1200, purchaseUnit: "g", purchasePrice: 9.40,
      baseUnitsPerPurchase: 1200, wastePercentage: 30,
      notes: "Pixel 'WHITE Sourdough 1400g' invoice line — actual loaf weight 1200g (marketed 1400g), 30% waste per loaf (Chris 2026-06-12).",
    },
  })
  console.log("✅ gruyere renamed + sourdough white corrected (1200g / 30% waste)")

  // ── Price fixes from invoices ────────────────────────────────────
  await db.ingredient.update({
    where: { id: "cmn8ccds6006c16qzfegnftpl" }, // Eggplant: broken box/350g data
    data: {
      baseUnitType: "WEIGHT", purchaseQuantity: 1, purchaseUnit: "kg",
      purchasePrice: 4.40, baseUnitsPerPurchase: 1000, gramsPerUnit: null,
      supplierId: pacific.id,
      notes: "EGGPLANT GLASSHOUSE KG — Pacific inv 2026-06-11. Was broken COUNT box ($32/box, 350g/unit).",
    },
  })
  await db.ingredient.update({ where: { id: "cmn8ccend00de16qzfb861942" }, data: { purchasePrice: 5.88 } }) // Red capsicum
  await db.ingredient.update({ where: { id: "cmn8ccfc700ib16qzj07wh3xz" }, data: { purchasePrice: 2.88 } }) // Zucchini Med/Lg
  await db.ingredient.update({ where: { id: "cmn8ccdsk006g16qzwin225ba" }, data: { purchasePrice: 5.60 } }) // Eshallot - golden
  await db.ingredient.update({ where: { id: "cmn8cccf1001916qz3em3wtv6" }, data: { purchasePrice: 4.85 } }) // Baby red beetroot
  await db.ingredient.update({
    where: { id: "cmn8cce0u008816qzot8c0eyr" }, // Hazelnut whole
    data: { purchasePrice: 48.56, supplierId: bidfood.id, notes: "HAZELNUTS KERNELS CATERERS C 1kg — Bidfood inv 2026-06-07/06-10. Fermex had 3kg @ $21/kg on Aug-2025 list — worth a requote." },
  })
  await db.ingredient.update({ where: { id: "cmn8cceqk00e216qz31hpan3x" }, data: { purchasePrice: 4.75 } }) // Sage bunch
  console.log("✅ produce price fixes applied")

  // ── New ingredients ──────────────────────────────────────────────
  const leek = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Leek", supplierId: pacific.id } },
    update: {},
    create: {
      name: "Leek", category: "VEGETABLE", baseUnitType: "COUNT",
      supplierId: pacific.id, purchaseQuantity: 1, purchaseUnit: "bunch",
      purchasePrice: 5.20, baseUnitsPerPurchase: 1, gramsPerUnit: 700, wastePercentage: 30,
      notes: "LEEK BUNCH — Pacific inv 2026-06-08. ASSUMED 2 stems ≈ 700g/bunch, 30% trim (tops/outer) — confirm.",
    },
  })
  const frisee = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Frisee (Gourmet Endive)", supplierId: jensens.id } },
    update: {},
    create: {
      name: "Frisee (Gourmet Endive)", category: "SALAD", baseUnitType: "COUNT",
      supplierId: jensens.id, purchaseQuantity: 1, purchaseUnit: "box",
      purchasePrice: 46.50, baseUnitsPerPurchase: 1, gramsPerUnit: 3000, wastePercentage: 40,
      notes: "Gourmet - Endive — Jensens inv 2026-06-11. ASSUMED 3kg net/box, 40% trim to pale heart — confirm box weight.",
    },
  })
  const sorrel = await db.ingredient.upsert({
    where: { name_supplierId: { name: "Red Vein Sorrel", supplierId: jensens.id } },
    update: {},
    create: {
      name: "Red Vein Sorrel", category: "HERB", baseUnitType: "COUNT",
      supplierId: jensens.id, purchaseQuantity: 1, purchaseUnit: "punnet",
      purchasePrice: 11.55, baseUnitsPerPurchase: 1, gramsPerUnit: 100, wastePercentage: 0,
      notes: "Boutique - Red Vein Sorrel (Punnets) — Jensens inv 2026-06-11. ASSUMED 100g punnet — confirm.",
    },
  })
  console.log("✅ new ingredients:", leek.id, frisee.id, sorrel.id)

  // ── Supplier mappings for price tracking ─────────────────────────
  const maps: Array<[string, string, string]> = [
    [pacific.id, "LEEK BUNCH", leek.id],
    [pacific.id, "EGGPLANT GLASSHOUSE KG", "cmn8ccds6006c16qzfegnftpl"],
    [jensens.id, "Gourmet - Endive", frisee.id],
    [jensens.id, "Boutique - Red Vein Sorrel (Punnets)", sorrel.id],
    [bidfood.id, "HAZELNUTS KERNELS CATERERS C 1kg", "cmn8cce0u008816qzot8c0eyr"],
    [bidfood.id, "HAZELNUTS KERNELS", "cmn8cce0u008816qzot8c0eyr"],
  ]
  for (const [supplierId, desc, ingredientId] of maps) {
    await db.supplierItemMapping.upsert({
      where: { supplierId_invoiceDescription: { supplierId, invoiceDescription: desc } },
      update: { ingredientId },
      create: { supplierId, invoiceDescription: desc, ingredientId },
    })
  }
  console.log("✅ supplier mappings created")

  // ── Dish: Winter Salad ───────────────────────────────────────────
  const dishName = "Winter Salad (Roast Vegetable)"
  const existing = await db.dish.findUnique({ where: { name_venue: { name: dishName, venue: "BEACH_HOUSE" } } })
  if (existing) {
    console.log("⚠️ dish exists, skipping:", existing.id)
  } else {
    const dish = await db.dish.create({
      data: {
        name: dishName,
        menuCategory: "LUNCH",
        venue: "BEACH_HOUSE",
        sellingPrice: 24.90,
        sellingPriceExGst: 22.6364,
        notes:
          "NEW June 2026 — Currumbin winter menu trial (replaces Thai beef). Per-serve portions from Chris's doc 2026-06-12. " +
          "MISSING: Sage Butter Dressing 55ml — recipe in Chris's 'Currumbin menu trials' artifact, not yet costed (~$0.80-1.00/serve est). " +
          "Selling price $24.90 is a PLACEHOLDER.",
        components: {
          create: [
            { ingredientId: "cmn8cccf1001916qz3em3wtv6", quantity: 55, unit: "g", sortOrder: 0 }, // Baby red beetroot
            { ingredientId: "cmn8ccds6006c16qzfegnftpl", quantity: 40, unit: "g", sortOrder: 1 }, // Eggplant
            { ingredientId: "cmn8ccend00de16qzfb861942", quantity: 35, unit: "g", sortOrder: 2 }, // Red capsicum (roasted)
            { ingredientId: "cmn8ccfc700ib16qzj07wh3xz", quantity: 40, unit: "g", sortOrder: 3 }, // Zucchini Med/Lg
            { ingredientId: "cmn8ccdsk006g16qzwin225ba", quantity: 50, unit: "g", sortOrder: 4 }, // Eshallot - golden
            { ingredientId: leek.id, quantity: 25, unit: "g", sortOrder: 5 },
            { ingredientId: "cmn8ccf2i00g116qz3gjw5mkr", quantity: 40, unit: "g", sortOrder: 6 }, // Sweet potato
            { ingredientId: frisee.id, quantity: 55, unit: "g", sortOrder: 7 },
            { ingredientId: sorrel.id, quantity: 10, unit: "g", sortOrder: 8 },
            { ingredientId: "cmn8cce0u008816qzot8c0eyr", quantity: 10, unit: "g", sortOrder: 9 }, // Hazelnut whole (toasted)
          ],
        },
      },
    })
    console.log("✅ dish Winter Salad:", dish.id)
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
