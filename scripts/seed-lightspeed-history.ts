/**
 * One-off: seed HourlySales + DailyChannelSales (+ DailySalesSummary.totalOrders)
 * from the Lightspeed back-office export for Beach House and Tea Gardens.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-lightspeed-history.ts /tmp/ls-archive
 *
 * Idempotent (upserts). 16 Sep 2026 is the export day (partial) and gets an
 * ESTIMATE hourly row set like 17-30 Sep, built from the venue's weekday
 * hourly shape over 1 Jul-15 Sep scaled to that day's known total.
 */
import { readFileSync, existsSync } from "node:fs"
import { db } from "../src/lib/db"
import type { Venue } from "../src/generated/prisma/client"

const ROOT = process.argv[2] ?? "/tmp/ls-archive"
const VENUES: Array<{ folder: string; venue: Venue }> = [
  { folder: "Tarte Beach House (Currumbin)", venue: "BEACH_HOUSE" },
  { folder: "Tarte Market (Tea Garden, Currumbin)", venue: "TEA_GARDEN" },
]
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" }
const EXPORT_DAY = "2026-09-16"
const LAST_LS_DAY = "2026-09-30"

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
function channelFor(terminal: string, operator: string): string {
  // Bopple pushed online orders into Lightspeed under the integration user
  // "Shawna" (657 sales in Sep 2026, none rung up by a person).
  if ((operator ?? "").trim().toLowerCase() === "shawna") return "ONLINE"
  const t = (terminal ?? "").trim().toUpperCase()
  if (t === "" || t === "0") return "ONLINE"
  if (t.startsWith("CAFE") || t.startsWith("MARKET") || t.startsWith("POS")) return "CAFE"
  if (t.startsWith("RESTAURANT")) return "RESTAURANT"
  return "OTHER"
}

async function main() {
  for (const { folder, venue } of VENUES) {
    const base = `${ROOT}/${folder}`
    // ---- hourly ----
    const hourly = csv(`${base}/hourly-sales-daily/FY2027 (Jul26-16Sep26).csv`)
    const header = hourly[0]
    let hourlyRows = 0
    const profile = new Map<number, number[]>() // dow -> 24 sums
    const profileDays = new Map<number, number>()
    for (const r of hourly.slice(1)) {
      const m = r[0].match(/^(\d{2}) (\w{3}) (\d{4})$/)
      if (!m) continue
      const date = `${m[3]}-${MONTHS[m[2]]}-${m[1]}`
      if (date >= EXPORT_DAY) continue
      const vals = header.slice(1).map((h, i) => ({ hour: parseInt(h, 10), v: parseFloat(r[i + 1] || "0") || 0 }))
      const dayTotal = vals.reduce((s, x) => s + x.v, 0)
      if (dayTotal <= 0) continue
      const dow = d(date).getUTCDay()
      const p = profile.get(dow) ?? new Array(24).fill(0)
      for (const x of vals) p[x.hour] += x.v / dayTotal
      profile.set(dow, p); profileDays.set(dow, (profileDays.get(dow) ?? 0) + 1)
      for (const x of vals) {
        if (x.v === 0) continue
        await db.hourlySales.upsert({
          where: { date_venue_hour: { date: d(date), venue, hour: x.hour } },
          update: { revenueIncGst: x.v, source: "LIGHTSPEED" },
          create: { date: d(date), venue, hour: x.hour, revenueIncGst: x.v, source: "LIGHTSPEED" },
        })
        hourlyRows++
      }
    }
    // ---- estimate hourly for 16-30 Sep from the weekday shape ----
    let est = 0
    for (let day = d(EXPORT_DAY); day <= d(LAST_LS_DAY); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = new Date(day)
      const sum = await db.dailySalesSummary.findUnique({ where: { date_venue: { date, venue } } })
      if (!sum || Number(sum.totalRevenue) <= 0) continue
      const dow = date.getUTCDay(); const p = profile.get(dow); const n = profileDays.get(dow) ?? 0
      if (!p || n === 0) continue
      for (let h = 0; h < 24; h++) {
        const share = p[h] / n
        if (share <= 0) continue
        await db.hourlySales.upsert({
          where: { date_venue_hour: { date, venue, hour: h } },
          update: { revenueIncGst: Math.round(Number(sum.totalRevenue) * share * 100) / 100, source: "ESTIMATE" },
          create: { date, venue, hour: h, revenueIncGst: Math.round(Number(sum.totalRevenue) * share * 100) / 100, source: "ESTIMATE" },
        })
        est++
      }
    }
    // ---- channels + counts from the sales feed ----
    const agg = new Map<string, { rev: number; n: number }>() // date|channel
    for (const m of ["2026-07", "2026-08", "2026-09"]) {
      const f = `${base}/sales-feed-every-sale-monthly/${m}.csv`
      if (!existsSync(f)) continue
      const rows = csv(f); const h = rows[0]
      const iDate = h.indexOf("SaleDate"), iTerm = h.indexOf("TerminalName"), iTotal = h.indexOf("Total"), iOp = h.indexOf("Operator")
      for (const r of rows.slice(1)) {
        const date = (r[iDate] ?? "").slice(0, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= EXPORT_DAY) continue
        const total = parseFloat(r[iTotal] || "0") || 0
        const key = `${date}|${channelFor(r[iTerm], r[iOp])}`
        const a = agg.get(key) ?? { rev: 0, n: 0 }; a.rev += total; a.n += 1; agg.set(key, a)
      }
    }
    for (const [key, a] of agg) {
      const [date, channel] = key.split("|")
      await db.dailyChannelSales.upsert({
        where: { date_venue_channel: { date: d(date), venue, channel } },
        update: { revenueIncGst: Math.round(a.rev * 100) / 100, orders: a.n, source: "LIGHTSPEED" },
        create: { date: d(date), venue, channel, revenueIncGst: Math.round(a.rev * 100) / 100, orders: a.n, source: "LIGHTSPEED" },
      })
    }
    // ---- order counts onto the daily summary ----
    const daily = csv(`${base}/sales-summary-daily/FY2027 (Jul26-16Sep26).csv`); const dh = daily[0]
    const iD = dh.indexOf("saledate"), iC = dh.indexOf("salecount")
    let counts = 0
    for (const r of daily.slice(1)) {
      const date = r[iD]; if (!date || date >= EXPORT_DAY) continue
      const res = await db.dailySalesSummary.updateMany({ where: { date: d(date), venue, totalOrders: null }, data: { totalOrders: parseInt(r[iC], 10) || 0 } })
      counts += res.count
    }
    console.log(`${venue}: hourly ${hourlyRows} rows, estimate ${est} rows, channel days ${agg.size}, counts set ${counts}`)
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
