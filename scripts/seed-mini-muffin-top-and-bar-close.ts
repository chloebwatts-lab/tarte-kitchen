/**
 * 2026-09-04 (Chloe request)
 *   1. Adds per-piece Preparation rows so staff can log wastage of
 *      Mini Muffin Tops (Strawberry + Blueberry). Each mini = 1/3 of the
 *      existing per-piece "Muffin Top - <flavour> - Each" prep, matching the
 *      Mini Bagel / Scone - MINI fractions. Naming leads with "Mini" so the
 *      wastage search prefix-matches on "mini m…"; the canonicaliser keeps
 *      mini:: keys separate from full-size muffin tops in reports.
 *   2. Adds a "Bar — Closing Clean" checklist for Beach House (Currumbin
 *      restaurant bar): DAILY / CLOSE, due by 17:00 like the other closing
 *      lists. Equipment named from the maintenance asset register
 *      (Hobart glass washer, Manitowoc ice machine, Williams wine fridges,
 *      beer taps).
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-mini-muffin-top-and-bar-close.ts
 * Safe to re-run: skips preps / template that already exist by name.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const MINI_PREPS = [
  { name: "Mini Muffin Top - Strawberry - each", fromPrep: "Muffin Top - Strawberry - Each", qty: 0.33 },
  { name: "Mini Muffin Top - Blueberry - each", fromPrep: "Muffin Top - Blueberry - Each", qty: 0.33 },
]

const BAR_CLOSE = {
  name: "Bar — Closing Clean",
  area: "Bar",
  venue: "BEACH_HOUSE" as const,
  cadence: "DAILY" as const,
  shift: "CLOSE" as const,
  dueByHour: 17,
  items: [
    { label: "Wash, polish and put away all glassware", instructions: "Nothing left on the drying rack overnight. Check for chips and lipstick before shelving." },
    { label: "Run Hobart glass washer final cycle; drain, remove and rinse filters, wipe inside and out, leave door open" },
    { label: "Wipe beer taps and font; rinse and sanitise drip trays; cover tap nozzles", instructions: "Flush drip trays with hot water so they don't smell in the morning." },
    { label: "Wipe down bar top, back bar shelves and speed rail", instructions: "Hot soapy water then sanitiser. Lift bottles, don't wipe around them." },
    { label: "Wipe spirit bottles and pourers; swap pourers for caps overnight" },
    { label: "Open wine: vacuum seal, date and put in wine fridge; tip anything past 3 days" },
    { label: "Wipe Williams wine fridge doors, glass and seals; rotate and restock stock" },
    { label: "Empty ice well, rinse and sanitise; leave to drain" },
    { label: "Wash ice scoop; store in its holder, never in the Manitowoc ice machine" },
    { label: "Cling wrap, date and fridge all garnishes; tip anything tired", instructions: "Lemons, limes, mint, oranges. Wash and sanitise garnish containers before refilling." },
    { label: "Soak bar mats in hot soapy water, rinse and hang to dry" },
    { label: "Clean bar sink and drain; wipe taps and splashback" },
    { label: "Empty bar bins and reline; take bottles to recycling" },
    { label: "Sweep and mop bar floor including under the fridges and behind the bar" },
    { label: "Check keg and stock levels; note anything low for ordering", instructions: "Write it on the order sheet or tell the manager. Don't leave a keg to blow mid-service." },
    { label: "Lock liquor storeroom and bar fridges; turn off bar lights" },
  ],
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  // ── 1. Mini muffin top preps ──────────────────────────────────────────
  for (const spec of MINI_PREPS) {
    const existing = await db.preparation.findUnique({ where: { name: spec.name } })
    if (existing) { console.log(`  • ${spec.name} already exists — skipping`); continue }
    const src = await db.preparation.findUnique({ where: { name: spec.fromPrep } })
    if (!src) throw new Error(`Source prep not found: ${spec.fromPrep}`)

    // Same cost maths as scripts/recalculate-all.ts count→count branch.
    const lineCost = new Decimal(spec.qty).div(new Decimal(String(src.yieldQuantity))).mul(new Decimal(String(src.batchCost))).toDecimalPlaces(4)
    const prep = await db.preparation.create({
      data: {
        name: spec.name,
        category: "PASTRY",
        yieldQuantity: 1,
        yieldUnit: "ea",
        yieldWeightGrams: 35, // ~1/3 of the 100g per-piece placeholder
        batchCost: Number(lineCost.toDecimalPlaces(2)),
        costPerGram: Number(lineCost.div(35).toDecimalPlaces(4)),
        costPerServe: Number(lineCost.toDecimalPlaces(2)),
        items: { create: [{ subPreparationId: src.id, quantity: spec.qty, unit: "ea", sortOrder: 0, lineCost: Number(lineCost) }] },
      },
    })
    console.log(`  ✅ created ${prep.name}  →  $${lineCost.toFixed(2)} per piece (1/3 of ${spec.fromPrep})`)
  }

  // ── 2. Bar closing checklist ──────────────────────────────────────────
  const tpl = await db.checklistTemplate.findFirst({ where: { name: BAR_CLOSE.name, venue: BAR_CLOSE.venue } })
  if (tpl) {
    console.log(`  • ${BAR_CLOSE.name} (${BAR_CLOSE.venue}) already exists — skipping`)
  } else {
    const created = await db.checklistTemplate.create({
      data: {
        name: BAR_CLOSE.name,
        area: BAR_CLOSE.area,
        venue: BAR_CLOSE.venue,
        cadence: BAR_CLOSE.cadence,
        shift: BAR_CLOSE.shift,
        dueByHour: BAR_CLOSE.dueByHour,
        isFoodSafety: false,
        items: { create: BAR_CLOSE.items.map((it, i) => ({ sortOrder: i, label: it.label, instructions: it.instructions ?? null })) },
      },
      include: { _count: { select: { items: true } } },
    })
    console.log(`  ✅ created ${created.name} for ${created.venue} — ${created._count.items} items (${created.cadence}/${created.shift}, due ${created.dueByHour}:00)`)
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
