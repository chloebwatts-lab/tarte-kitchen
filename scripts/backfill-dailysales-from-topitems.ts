/**
 * Backfill DailySales from DailyCategoryTopItem history (Apr 2026 →), then
 * run the standard enrichment per (date, venue): dish matching, EMAIL
 * revenue estimation, theoretical COGS onto DailySalesSummary, theoretical
 * ingredient usage.
 *
 * Purely additive: DailySales has 0 rows today; theoreticalCogs is NULL on
 * every summary row. Nothing is deleted. Re-running is idempotent (upserts).
 *
 * The enrichment steps mirror src/lib/sales/enrich.ts (kept inline because
 * scripts can't resolve the "@/" import alias that module uses).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-dailysales-from-topitems.ts           # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-dailysales-from-topitems.ts --apply   # write
 */
import { PrismaClient, Venue } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"
import Fuse from "fuse.js"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

const APPLY = process.argv.includes("--apply")

// --- mirrors matchSalesToDishes (enrich.ts) ---
async function matchSalesToDishes(date: Date, venue: Venue) {
  const unmatched = await db.dailySales.findMany({ where: { date, venue, dishId: null } })
  if (unmatched.length === 0) return
  const dishes = await db.dish.findMany({
    where: { isActive: true, venue: { in: [venue, "BOTH"] } },
    select: { id: true, name: true },
  })
  if (dishes.length === 0) return
  const fuse = new Fuse(dishes, { keys: ["name"], threshold: 0.3, includeScore: true })
  for (const sale of unmatched) {
    const r = fuse.search(sale.menuItemName)
    if (r.length > 0 && r[0].score !== undefined && r[0].score < 0.3) {
      await db.dailySales.update({ where: { id: sale.id }, data: { dishId: r[0].item.id } })
    }
  }
}

// --- mirrors estimateEmailItemRevenue (enrich.ts) ---
async function estimateEmailItemRevenue(date: Date, venue: Venue) {
  const rows = await db.dailySales.findMany({
    where: { date, venue, source: "EMAIL", dishId: { not: null } },
    include: { dish: { select: { sellingPrice: true } } },
  })
  for (const row of rows) {
    if (!row.dish?.sellingPrice) continue
    const inc = new Decimal(row.dish.sellingPrice).mul(row.quantitySold)
    if (inc.equals(new Decimal(row.revenue))) continue
    await db.dailySales.update({
      where: { id: row.id },
      data: { revenue: inc, revenueExGst: inc.div(1.1) },
    })
  }
}

// --- mirrors calculateTheoreticalCogs (enrich.ts) ---
async function calculateTheoreticalCogs(date: Date, venue: Venue): Promise<Decimal | null> {
  const matched = await db.dailySales.findMany({
    where: { date, venue, dishId: { not: null } },
    include: { dish: { select: { totalCost: true } } },
  })
  if (matched.length === 0) return null
  let total = new Decimal(0)
  for (const sale of matched) {
    if (sale.dish) total = total.plus(new Decimal(sale.dish.totalCost).mul(sale.quantitySold))
  }
  return total
}

// --- mirrors calculateTheoreticalUsage (enrich.ts) ---
async function calculateTheoreticalUsage(date: Date, venue: Venue) {
  const matched = await db.dailySales.findMany({
    where: { date, venue, dishId: { not: null } },
    include: {
      dish: {
        include: {
          components: {
            include: {
              ingredient: { select: { id: true } },
              preparation: { include: { items: { include: { ingredient: { select: { id: true } } } } } },
            },
          },
        },
      },
    },
  })
  const usage = new Map<string, { qty: Decimal; cost: Decimal; unit: string }>()
  for (const sale of matched) {
    if (!sale.dish) continue
    const mult = sale.quantitySold
    for (const comp of sale.dish.components) {
      if (comp.ingredientId && comp.ingredient) {
        const e = usage.get(comp.ingredientId) ?? { qty: new Decimal(0), cost: new Decimal(0), unit: comp.unit }
        e.qty = e.qty.plus(new Decimal(comp.quantity).mul(mult))
        e.cost = e.cost.plus(new Decimal(comp.lineCost).mul(mult))
        usage.set(comp.ingredientId, e)
      }
      if (comp.preparationId && comp.preparation) {
        for (const pi of comp.preparation.items) {
          if (pi.ingredientId && pi.ingredient) {
            const e = usage.get(pi.ingredientId) ?? { qty: new Decimal(0), cost: new Decimal(0), unit: pi.unit }
            e.qty = e.qty.plus(new Decimal(pi.quantity).mul(mult))
            e.cost = e.cost.plus(new Decimal(pi.lineCost).mul(mult))
            usage.set(pi.ingredientId, e)
          }
        }
      }
    }
  }
  for (const [ingredientId, data] of usage) {
    await db.theoreticalUsage.upsert({
      where: { date_venue_ingredientId: { date, venue, ingredientId } },
      update: { theoreticalQty: data.qty, theoreticalCost: data.cost, unit: data.unit },
      create: { date, venue, ingredientId, theoreticalQty: data.qty, theoreticalCost: data.cost, unit: data.unit },
    })
  }
}

async function main() {
  const groups = await db.dailyCategoryTopItem.groupBy({
    by: ["date", "venue"],
    orderBy: [{ date: "asc" }],
  })
  console.log(`${groups.length} (date, venue) groups in DailyCategoryTopItem`)
  console.log(APPLY ? "APPLY mode — writing." : "DRY RUN — no writes. Pass --apply to write.")

  let upserts = 0
  let updatedSummaries = 0
  let processed = 0

  for (const g of groups) {
    const items = await db.dailyCategoryTopItem.findMany({ where: { date: g.date, venue: g.venue } })
    const qtyByProduct = new Map<string, number>()
    for (const it of items) {
      qtyByProduct.set(it.productName, (qtyByProduct.get(it.productName) ?? 0) + it.quantity)
    }

    if (APPLY) {
      for (const [productName, quantity] of qtyByProduct) {
        await db.dailySales.upsert({
          where: { date_venue_menuItemName: { date: g.date, venue: g.venue, menuItemName: productName } },
          update: { quantitySold: quantity, source: "EMAIL" },
          create: {
            date: g.date,
            venue: g.venue,
            menuItemName: productName,
            quantitySold: quantity,
            revenue: new Decimal(0),
            revenueExGst: new Decimal(0),
            source: "EMAIL",
          },
        })
        upserts++
      }
      await matchSalesToDishes(g.date, g.venue)
      await estimateEmailItemRevenue(g.date, g.venue)
      const cogs = await calculateTheoreticalCogs(g.date, g.venue)
      if (cogs) {
        try {
          await db.dailySalesSummary.update({
            where: { date_venue: { date: g.date, venue: g.venue } },
            data: { theoreticalCogs: cogs },
          })
          updatedSummaries++
        } catch {
          // Top items without an EOD summary row that day — skip, don't invent.
        }
      }
      await calculateTheoreticalUsage(g.date, g.venue)
    } else {
      upserts += qtyByProduct.size
    }

    processed++
    if (processed % 25 === 0) console.log(`  ${processed}/${groups.length} groups…`)
  }

  console.log(
    APPLY
      ? `Done. ${upserts} DailySales upserts across ${processed} groups; theoreticalCogs written on ${updatedSummaries} summaries.`
      : `Dry run: would upsert ~${upserts} DailySales rows across ${processed} groups.`
  )
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
