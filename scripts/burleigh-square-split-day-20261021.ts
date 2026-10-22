/**
 * One-off for Burleigh's split day, Wed 21 Oct 2026: Lightspeed until about
 * 3pm (summary + hourly already in the DB from the Lightspeed EOD email and
 * the archive), Square from then on. Adds Square's afternoon (paid orders,
 * tips excluded, as the Sales page counts them) ON TOP of the Lightspeed
 * figures: DailySalesSummary totals + orders, HourlySales per hour. Safe to
 * run once only; it refuses to run twice (marker in AppSetting).
 *
 * Needs the Burleigh Square account connected. Run on the droplet (the token
 * key lives there):
 *   set -a; . ./.env; set +a
 *   docker compose run --rm -T -e TOKEN_ENCRYPTION_KEY -e DATABASE_URL \
 *     -v $PWD/scripts/burleigh-square-split-day-20261021.ts:/app/scripts/x.ts \
 *     migrate npx tsx scripts/x.ts
 */
import Decimal from "decimal.js"
import { db } from "../src/lib/db"
import { fetchDayOrders, listPayments } from "../src/lib/square/client"
import { squareAccessFor } from "../src/lib/square/token"
import { computeDayBreakdown } from "../src/lib/square/breakdown"

const DATE = "2026-10-21"
const VENUE = "BURLEIGH" as const
const MARK = "burleighSplitDay20261021"

async function main() {
  const done = await db.appSetting.findUnique({ where: { key: MARK } }).catch(() => null)
  if (done) throw new Error("already applied")
  const access = await squareAccessFor(VENUE)
  if (!access) throw new Error("Burleigh Square account not connected")
  const [{ sales, openUnpaid }, payments] = await Promise.all([
    fetchDayOrders(access.token, access.locationId, DATE),
    listPayments(access.token, access.locationId, DATE),
  ])
  const b = computeDayBreakdown(DATE, [...sales, ...openUnpaid], payments, () => undefined, () => undefined)
  const date = new Date(DATE)
  const sum = await db.dailySalesSummary.findUnique({ where: { date_venue: { date, venue: VENUE } } })
  if (!sum) throw new Error("no Lightspeed summary row for 21 Oct")
  const add = new Decimal(b.paidIncGst)
  console.log("Square afternoon:", b.paidIncGst, "paid,", b.paidOrders, "orders; Lightspeed morning:", String(sum.totalRevenue))
  await db.$transaction(async (tx) => {
    await tx.dailySalesSummary.update({
      where: { date_venue: { date, venue: VENUE } },
      data: {
        totalRevenue: new Decimal(sum.totalRevenue).plus(add),
        totalRevenueExGst: new Decimal(sum.totalRevenueExGst).plus(add.div(1.1)),
        totalOrders: (sum.totalOrders ?? 0) + b.paidOrders,
      },
    })
    for (let h = 0; h < 24; h++) {
      if (b.hourly[h] <= 0) continue
      const row = await tx.hourlySales.findUnique({ where: { date_venue_hour: { date, venue: VENUE, hour: h } } })
      await tx.hourlySales.upsert({
        where: { date_venue_hour: { date, venue: VENUE, hour: h } },
        update: { revenueIncGst: new Decimal(row?.revenueIncGst ?? 0).plus(b.hourly[h]), orders: (row?.orders ?? 0) + b.hourlyOrders[h] },
        create: { date, venue: VENUE, hour: h, revenueIncGst: b.hourly[h], orders: b.hourlyOrders[h], source: "LIGHTSPEED" },
      })
    }
    const ch = await tx.dailyChannelSales.findUnique({ where: { date_venue_channel: { date, venue: VENUE, channel: "CAFE" } } })
    if (ch) await tx.dailyChannelSales.update({ where: { id: ch.id }, data: { revenueIncGst: new Decimal(ch.revenueIncGst).plus(add), orders: ch.orders + b.paidOrders } })
    await tx.appSetting.create({ data: { key: MARK, value: JSON.stringify({ squareAfternoon: b.paidIncGst, orders: b.paidOrders, at: new Date().toISOString() }) } })
  })
  console.log("done")
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
