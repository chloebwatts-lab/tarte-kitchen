/**
 * Recompute TheoreticalUsage for every (date, venue) that has dish-matched
 * DailySales rows, using the current calculator (dish share of a prep
 * batch, base units, sub-preps). Safe to rerun: upserts plus removal of
 * ingredients that no longer appear for that day.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-theoretical-usage.ts [from YYYY-MM-DD] [to YYYY-MM-DD]
 */
import { db } from "../src/lib/db"
import { calculateTheoreticalUsage } from "../src/lib/sales/enrich"

async function main() {
  const from = process.argv[2] ? new Date(process.argv[2]) : undefined
  const to = process.argv[3] ? new Date(process.argv[3]) : undefined
  const groups = await db.dailySales.groupBy({
    by: ["date", "venue"],
    where: { dishId: { not: null }, ...(from || to ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}) },
    orderBy: [{ date: "asc" }, { venue: "asc" }],
  })
  console.log(`${groups.length} (date, venue) groups to recompute`)
  let n = 0
  for (const g of groups) {
    await calculateTheoreticalUsage(g.date, g.venue)
    n++
    if (n % 25 === 0) console.log(`${n}/${groups.length} ${g.date.toISOString().slice(0, 10)} ${g.venue}`)
  }
  console.log(`done: ${n} groups`)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
