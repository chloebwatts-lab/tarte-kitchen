// READ-ONLY: reconstruct what the live trackers forecast for the week
// Wed 2026-07-08 → Tue 2026-07-14, to compare against Louise's actuals.
//  - Labour: Deputy ROSTER rows × on-cost multiplier per bucket + mgr forecast
//  - COGS: invoice spend (ex GST) per venue vs mgr forecast × targetPct
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { bucketFor } from "../src/lib/labour/buckets"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

// Trading week in AEST: Wed 08 Jul 00:00 AEST = 07 Jul 14:00 UTC
const SHIFT_START = new Date("2026-07-07T14:00:00Z")
const SHIFT_END = new Date("2026-07-14T14:00:00Z")
// Date-typed columns (weekStartWed, invoiceDate) store plain dates
const WEEK = new Date("2026-07-08T00:00:00Z")
const INV_END = new Date("2026-07-15T00:00:00Z")

async function main() {
  const [conn, shifts, forecasts, targets, invoices] = await Promise.all([
    db.deputyConnection.findFirst(),
    db.labourShift.findMany({
      where: { shiftStart: { gte: SHIFT_START, lt: SHIFT_END } },
    }),
    db.managerSalesForecast.findMany({ where: { weekStartWed: WEEK } }),
    db.venueCogsTarget.findMany(),
    db.invoice.findMany({
      where: { invoiceDate: { gte: WEEK, lt: INV_END } },
      select: { venue: true, supplier: true, subtotal: true, total: true },
    }),
  ])

  const mult =
    1 + Number(conn?.superRate ?? 0.12) + Number((conn as any)?.onCostUpliftRate ?? 0)
  console.log(`labour multiplier = ${mult}`)

  console.log("=== ManagerSalesForecast (week 2026-07-08) ===")
  for (const f of forecasts)
    console.log(`${f.venue}: $${Number(f.amount).toFixed(0)} (${f.source})`)

  console.log("=== Deputy shifts by venue/source/bucket (x multiplier) ===")
  const agg = new Map<string, { cost: number; hours: number; n: number }>()
  for (const s of shifts) {
    const bucket = bucketFor(s.venue, s.area)
    const k = `${s.venue}|${s.source}|${bucket}`
    const a = agg.get(k) ?? { cost: 0, hours: 0, n: 0 }
    a.cost += Number(s.cost) * mult
    a.hours += Number(s.hours)
    a.n += 1
    agg.set(k, a)
  }
  for (const [k, a] of [...agg.entries()].sort())
    console.log(`${k}: $${a.cost.toFixed(0)} (${a.hours.toFixed(0)}h, ${a.n} shifts)`)

  // Venue totals per source
  const tot = new Map<string, number>()
  for (const s of shifts) {
    const k = `${s.venue}|${s.source}`
    tot.set(k, (tot.get(k) ?? 0) + Number(s.cost) * mult)
  }
  console.log("=== Venue totals (x multiplier) ===")
  for (const [k, v] of [...tot.entries()].sort()) console.log(`${k}: $${v.toFixed(0)}`)

  console.log("=== VenueCogsTarget ===")
  for (const t of targets) console.log(`${t.venue}: ${Number(t.targetPct)}%`)

  console.log("=== Invoice spend (ex GST) 08–14 Jul by venue ===")
  const inv = new Map<string, number>()
  const invN = new Map<string, number>()
  for (const i of invoices) {
    const v = i.venue ?? "UNASSIGNED"
    const amt = Number(i.subtotal ?? i.total ?? 0)
    inv.set(v, (inv.get(v) ?? 0) + amt)
    invN.set(v, (invN.get(v) ?? 0) + 1)
  }
  for (const [v, amt] of [...inv.entries()].sort())
    console.log(`${v}: $${amt.toFixed(0)} across ${invN.get(v)} invoices`)

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
