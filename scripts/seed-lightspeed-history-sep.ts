/**
 * One-off top-up to seed-lightspeed-history.ts: real Lightspeed figures for
 * 16-30 Sep 2026 (read from the back office on 5 Oct 2026, after the first
 * export). Replaces the ESTIMATE hourly rows with LIGHTSPEED ones and fills
 * the cafe / restaurant / online split and order counts for those days.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-lightspeed-history-sep.ts /tmp/ls-sep
 * expects <dir>/<VENUE>/hourly.csv (archive hourly format) and feed.csv.
 */
import { readFileSync, existsSync } from "node:fs"
import { db } from "../src/lib/db"
import type { Venue } from "../src/generated/prisma/client"

const ROOT = process.argv[2] ?? "/tmp/ls-sep"
const FROM = "2026-09-16", TO = "2026-09-30"
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" }
const d = (s: string) => new Date(`${s}T00:00:00Z`)
function csv(path: string): string[][] {
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "")
  const rows: string[][] = []; let row: string[] = [], field = "", q = false
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
function channelFor(terminal: string, operator: string): string {
  if ((operator ?? "").trim().toLowerCase() === "shawna") return "ONLINE"
  const t = (terminal ?? "").trim().toUpperCase()
  if (t === "" || t === "0") return "ONLINE"
  if (t.startsWith("CAFE") || t.startsWith("MARKET") || t.startsWith("POS")) return "CAFE"
  if (t.startsWith("RESTAURANT")) return "RESTAURANT"
  return "OTHER"
}

async function main() {
  for (const venue of ["BEACH_HOUSE", "TEA_GARDEN"] as Venue[]) {
    const dir = `${ROOT}/${venue}`
    // hourly: replace every ESTIMATE/LIGHTSPEED row in the window with the real ones
    const hourly = csv(`${dir}/hourly.csv`); const header = hourly[0]
    await db.hourlySales.deleteMany({ where: { venue, date: { gte: d(FROM), lte: d(TO) }, source: { in: ["ESTIMATE", "LIGHTSPEED"] } } })
    let hrows = 0; const dayTotals = new Map<string, number>()
    for (const r of hourly.slice(1)) {
      const m = r[0].match(/^(\d{1,2}) (\w{3}) (\d{4})$/); if (!m) continue
      const date = `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`
      if (date < FROM || date > TO) continue
      for (let i = 1; i < header.length; i++) {
        const v = parseFloat(r[i] || "0") || 0; if (v === 0) continue
        await db.hourlySales.create({ data: { date: d(date), venue, hour: parseInt(header[i], 10), revenueIncGst: v, source: "LIGHTSPEED" } })
        hrows++; dayTotals.set(date, (dayTotals.get(date) ?? 0) + v)
      }
    }
    // channels + counts from the feed
    let chDays = 0, counts = 0
    if (existsSync(`${dir}/feed.csv`)) {
      const rows = csv(`${dir}/feed.csv`); const h = rows[0]
      const iId = h.indexOf("SaleID"), iDate = h.indexOf("SaleDate"), iTerm = h.indexOf("TerminalName"), iTotal = h.indexOf("Total"), iOp = h.indexOf("Operator")
      const seen = new Set<string>(); const agg = new Map<string, { rev: number; n: number }>(); const perDay = new Map<string, number>()
      for (const r of rows.slice(1)) {
        const date = (r[iDate] ?? "").slice(0, 10)
        if (date < FROM || date > TO || seen.has(r[iId])) continue
        seen.add(r[iId])
        const key = `${date}|${channelFor(r[iTerm], r[iOp])}`
        const a = agg.get(key) ?? { rev: 0, n: 0 }; a.rev += parseFloat(r[iTotal] || "0") || 0; a.n++; agg.set(key, a)
        perDay.set(date, (perDay.get(date) ?? 0) + 1)
      }
      await db.dailyChannelSales.deleteMany({ where: { venue, date: { gte: d(FROM), lte: d(TO) }, source: "LIGHTSPEED" } })
      for (const [key, a] of agg) {
        const [date, channel] = key.split("|")
        await db.dailyChannelSales.create({ data: { date: d(date), venue, channel, revenueIncGst: Math.round(a.rev * 100) / 100, orders: a.n, source: "LIGHTSPEED" } })
        chDays++
      }
      for (const [date, n] of perDay) {
        const res = await db.dailySalesSummary.updateMany({ where: { date: d(date), venue }, data: { totalOrders: n } }); counts += res.count
      }
    }
    // sanity: hourly day totals vs the end-of-day totals already stored
    const sums = await db.dailySalesSummary.findMany({ where: { venue, date: { gte: d(FROM), lte: d(TO) } }, select: { date: true, totalRevenue: true } })
    let maxDiff = 0, worst = ""
    for (const s of sums) { const k = s.date.toISOString().slice(0, 10); const diff = Math.abs((dayTotals.get(k) ?? 0) - Number(s.totalRevenue)); if (diff > maxDiff) { maxDiff = diff; worst = `${k} hourly ${(dayTotals.get(k) ?? 0).toFixed(2)} vs EOD ${Number(s.totalRevenue).toFixed(2)}` } }
    console.log(`${venue}: hourly rows ${hrows} over ${dayTotals.size} days, channel rows ${chDays}, counts set ${counts}, biggest gap vs EOD total $${maxDiff.toFixed(2)} (${worst})`)
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
