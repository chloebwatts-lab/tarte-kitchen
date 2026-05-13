/**
 * Spot-check: sum DailySalesSummary.totalRevenueExGst per venue for a
 * given Wed-Tue trading week. Usage:
 *
 *   npx tsx scripts/check-week-sales.ts            # last completed Wed-Tue
 *   npx tsx scripts/check-week-sales.ts 2026-04-29 # Wed-Tue starting that date
 */
import { Pool } from "pg"
import "dotenv/config"
import { lastCompletedTarteWeek, startOfTarteWeekUtc, tarteWeekLabel } from "../src/lib/dates"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
})

async function main() {
  const arg = process.argv[2]
  let start: Date
  let end: Date
  if (arg) {
    const wed = startOfTarteWeekUtc(new Date(`${arg}T00:00:00Z`))
    start = wed
    end = new Date(wed)
    end.setUTCDate(end.getUTCDate() + 6)
    end.setUTCHours(23, 59, 59, 999)
  } else {
    const w = lastCompletedTarteWeek()
    start = w.start
    end = w.end
  }

  const label = tarteWeekLabel(start)
  const startIso = start.toISOString().split("T")[0]
  const endIso = end.toISOString().split("T")[0]
  console.log(`\nTarte week: ${label}   (${startIso} → ${endIso})\n`)

  const { rows } = await pool.query(
    `SELECT venue,
            date::text AS date,
            "totalRevenueExGst"::float AS revenue,
            "totalCovers" AS covers
       FROM "DailySalesSummary"
      WHERE date >= $1::date AND date <= $2::date
      ORDER BY venue, date`,
    [startIso, endIso]
  )

  const byVenue = new Map<string, { revenue: number; covers: number; days: string[] }>()
  for (const r of rows) {
    const v = byVenue.get(r.venue) ?? { revenue: 0, covers: 0, days: [] }
    v.revenue += Number(r.revenue)
    v.covers += Number(r.covers)
    v.days.push(`  ${r.date}  $${Number(r.revenue).toFixed(2).padStart(10)}  ${r.covers} covers`)
    byVenue.set(r.venue, v)
  }

  for (const [venue, v] of byVenue) {
    console.log(`${venue}`)
    for (const d of v.days) console.log(d)
    console.log(`  ─── total: $${v.revenue.toFixed(2)}  (${v.covers} covers)\n`)
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
