/**
 * One-off, 9 Nov 2026: apply TILL_NAME_ALIASES to existing DailySales rows
 * that never matched a card, unlink the deny-listed names (Espresso costed
 * as Maca Espresso), then recompute theoretical COGS + usage for the days
 * touched. Read-mostly: only DailySales.dishId, DailySalesSummary.theoreticalCogs
 * and TheoreticalUsage change. Safe to rerun.
 *   npx tsx --env-file=.env.local scripts/backfill-dish-links-20261109.ts [--apply]
 */
import { db } from "../src/lib/db"
import { TILL_NAME_ALIASES, NEVER_MATCH_TILL_NAMES, normaliseTillName, calculateTheoreticalCogs, calculateTheoreticalUsage } from "../src/lib/sales/enrich"
import type { Venue } from "../src/generated/prisma/client"

const apply = process.argv.includes("--apply")
/** The Square sync rebuilds the last two days' rows every half hour; a row that vanished mid-run is relinked by the sync itself (alias table). */
const skipGone = (e: unknown) => { if ((e as { code?: string }).code === "P2025") return; throw e }
async function main() {
  const dishes = await db.dish.findMany({ where: { isActive: true }, select: { id: true, name: true, venue: true } })
  const touched = new Map<string, { date: Date; venue: Venue }>()
  let linked = 0, unlinked = 0
  const unmatched = await db.dailySales.findMany({ where: { dishId: null }, select: { id: true, date: true, venue: true, menuItemName: true, quantitySold: true } })
  const tally = new Map<string, number>()
  for (const row of unmatched) {
    const alias = TILL_NAME_ALIASES[normaliseTillName(row.menuItemName)]
    if (!alias) continue
    const dish = dishes.find((d) => d.name.toLowerCase() === alias.toLowerCase() && (d.venue === row.venue || d.venue === "BOTH"))
    if (!dish) continue
    const k = `${row.venue} | ${row.menuItemName} -> ${dish.name}`
    tally.set(k, (tally.get(k) ?? 0) + row.quantitySold)
    linked++
    touched.set(`${row.venue}|${row.date.toISOString()}`, { date: row.date, venue: row.venue })
    if (apply) await db.dailySales.update({ where: { id: row.id }, data: { dishId: dish.id } }).catch(skipGone)
  }
  const wrong = await db.dailySales.findMany({ where: { dishId: { not: null } }, select: { id: true, date: true, venue: true, menuItemName: true, quantitySold: true, dish: { select: { name: true } } } })
  for (const row of wrong) {
    if (!NEVER_MATCH_TILL_NAMES.has(normaliseTillName(row.menuItemName))) continue
    const k = `${row.venue} | ${row.menuItemName} UNLINK from ${row.dish?.name}`
    tally.set(k, (tally.get(k) ?? 0) + row.quantitySold)
    unlinked++
    touched.set(`${row.venue}|${row.date.toISOString()}`, { date: row.date, venue: row.venue })
    if (apply) await db.dailySales.update({ where: { id: row.id }, data: { dishId: null } }).catch(skipGone)
  }
  for (const [k, q] of [...tally.entries()].sort()) console.log(`${k}  (${q} sold)`)
  console.log(`rows to link ${linked}, rows to unlink ${unlinked}, days touched ${touched.size}, apply=${apply}`)
  if (!apply) return
  let n = 0
  for (const { date, venue } of touched.values()) {
    const cogs = await calculateTheoreticalCogs(date, venue)
    const summary = await db.dailySalesSummary.findUnique({ where: { date_venue: { date, venue } }, select: { id: true } })
    if (summary) await db.dailySalesSummary.update({ where: { date_venue: { date, venue } }, data: { theoreticalCogs: cogs } })
    await calculateTheoreticalUsage(date, venue)
    if (++n % 25 === 0) console.log(`recomputed ${n}/${touched.size}`)
  }
  console.log("done")
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
