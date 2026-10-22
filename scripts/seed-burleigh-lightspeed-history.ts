/**
 * One-off: seed Burleigh's HourlySales + DailyChannelSales (+ the order
 * count on DailySalesSummary) from the Lightspeed archive, 1 Jul to 21 Oct
 * 2026 (Burleigh's last Lightspeed day), so the Sales pages have same-weekday
 * comparisons from its first Square day.
 *
 *   npx tsx --env-file=.env.local scripts/seed-burleigh-lightspeed-history.ts
 *
 * Idempotent (upserts). Burleigh's tills were all counter tills (MAIN POS,
 * MAIN POS 1, TAKEAWAY TILL, SPARE, BUMP IT, MANAGER BACK UP), so every sale
 * is the CAFE channel. 21 Oct holds the Lightspeed morning only; the Square
 * afternoon is added separately once the Burleigh Square account is connected.
 */
import { readFileSync, existsSync } from "node:fs"
import { db } from "../src/lib/db"

const BASE = process.argv[2] ?? "/Users/chris/C/tarte-lightspeed-archive/Tarte Pty Ltd (Burleigh)"
const VENUE = "BURLEIGH" as const
const FROM = "2026-07-01"
const TO = "2026-10-21"
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" }

function csv(path: string): string[][] {
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = [], field = "", q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
    else if (c !== "\r") field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x !== ""))
}
const d = (s: string) => new Date(`${s}T00:00:00Z`)

async function main() {
  // ---- hourly ----
  const hourly = csv(`${BASE}/hourly-sales-daily/FY2027 (Jul26-21Oct26).csv`)
  const header = hourly[0]
  let hourlyRows = 0, days = 0
  for (const r of hourly.slice(1)) {
    const m = r[0].match(/^(\d{2}) (\w{3}) (\d{4})$/)
    if (!m) continue
    const date = `${m[3]}-${MONTHS[m[2]]}-${m[1]}`
    if (date < FROM || date > TO) continue
    const vals = header.slice(1).map((h, i) => ({ hour: parseInt(h, 10), v: parseFloat(r[i + 1] || "0") || 0 }))
    if (vals.reduce((s, x) => s + x.v, 0) <= 0) continue
    days++
    for (const x of vals) {
      if (x.v === 0) continue
      await db.hourlySales.upsert({
        where: { date_venue_hour: { date: d(date), venue: VENUE, hour: x.hour } },
        update: { revenueIncGst: x.v, source: "LIGHTSPEED" },
        create: { date: d(date), venue: VENUE, hour: x.hour, revenueIncGst: x.v, source: "LIGHTSPEED" },
      })
      hourlyRows++
    }
  }
  // ---- channel (all CAFE) + counts from the sales feed ----
  const agg = new Map<string, { rev: number; n: number }>()
  for (const mth of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const f = `${BASE}/sales-feed-every-sale-monthly/${mth}.csv`
    if (!existsSync(f)) continue
    const rows = csv(f); const h = rows[0]
    const iDate = h.indexOf("SaleDate"), iTotal = h.indexOf("Total")
    for (const r of rows.slice(1)) {
      const date = (r[iDate] ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FROM || date > TO) continue
      const total = parseFloat(r[iTotal] || "0") || 0
      const a = agg.get(date) ?? { rev: 0, n: 0 }; a.rev += total; a.n += 1; agg.set(date, a)
    }
  }
  for (const [date, a] of agg) {
    await db.dailyChannelSales.upsert({
      where: { date_venue_channel: { date: d(date), venue: VENUE, channel: "CAFE" } },
      update: { revenueIncGst: Math.round(a.rev * 100) / 100, orders: a.n, source: "LIGHTSPEED" },
      create: { date: d(date), venue: VENUE, channel: "CAFE", revenueIncGst: Math.round(a.rev * 100) / 100, orders: a.n, source: "LIGHTSPEED" },
    })
  }
  // ---- order counts onto the daily summary (only where empty) ----
  const daily = csv(`${BASE}/sales-summary-daily/FY2027 (Jul26-21Oct26).csv`); const dh = daily[0]
  const iD = dh.indexOf("saledate"), iC = dh.indexOf("salecount")
  let counts = 0
  for (const r of daily.slice(1)) {
    const date = r[iD]; if (!date || date < FROM || date > TO) continue
    const res = await db.dailySalesSummary.updateMany({ where: { date: d(date), venue: VENUE, totalOrders: null }, data: { totalOrders: parseInt(r[iC], 10) || 0 } })
    counts += res.count
  }
  console.log(`${VENUE}: ${days} days, hourly ${hourlyRows} rows, channel days ${agg.size}, counts set ${counts}`)
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
