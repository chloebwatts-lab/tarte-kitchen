export const dynamic = "force-dynamic"
export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { PastryBakeTime, Venue } from "@/generated/prisma/client"

/**
 * Auto-fill the pastry rotation from what ACTUALLY happened (per Chloe,
 * 2026-08-05): the bakery sells out inside the rotation window, so
 *   sold      = POS quantity from the Lightspeed EOD import (DailySales)
 *   discarded = anything staff logged in the wastage register that day
 *   prepared  = sold + discarded
 * Staff never touch the register unless something unusual happens; wastage
 * entries flow into the discarded column automatically.
 *
 * Rows written by this job carry staffName 'auto'. Human-entered rows are
 * NEVER overwritten. Re-runs replace only auto/seed rows (idempotent).
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD backfills a window; default = yesterday
 * and the day before (EOD emails land the following morning).
 */

const AUTO_NAMES = new Set(["auto", "JP", "BM", "BB", "DE", "TZ"])
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
// Last fully hand-entered day per venue — used only for the bake-time split.
const SPLIT_TEMPLATE_DAY: Record<string, string> = {
  BURLEIGH: "2026-07-25",
  BEACH_HOUSE: "2026-07-11",
  TEA_GARDEN: "2026-07-11",
}
const DEFAULT_SPLIT = [0.6, 0.3, 0.1]
const BAKES: PastryBakeTime[] = ["SIX_AM", "NINE_AM", "TWELVE_PM"]

/** Map a POS / wastage item name to a PastryProduct name. Null = not a
 * tracked pastry (almond croissants, generic "Cruellers", sourdough…). */
function matchProduct(raw: string): string | null {
  const n = raw.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
  if (/tarte?s?\b/.test(n)) {
    if (/strawberry|berry/.test(n)) return "Strawberry tarte"
    if (/blueberry/.test(n)) return "Blueberry tarte"
    if (/raspberry/.test(n)) return "Raspberry tarte"
    if (/rhubarb/.test(n)) return "Rhubarb tarte"
    if (/passionfruit/.test(n)) return "Passionfruit tarte"
  }
  if (/muffin top/.test(n)) return "Muffin top"
  if (/triple choc/.test(n)) return "Dark triple chocolate cookie"
  if (/choc chip/.test(n)) return "Choc chip cookie"
  if (/pistachio/.test(n) && /cookie/.test(n)) return "Pistachio cookie"
  if (/crueller|cruller/.test(n)) {
    if (/vanilla/.test(n)) return "Vanilla crueller"
    if (/dul/.test(n)) return "Dulce crueller"
    return null // cinnamon / generic — not tracked products
  }
  if (/croissant/.test(n)) {
    if (/almond|chocolate|choc|ham|cheese/.test(n)) return null
    return "Plain croissant"
  }
  if (/scroll/.test(n) && /cinnamon/.test(n)) return "Cinnamon scroll"
  if (/^cinnamon scroll/.test(n)) return "Cinnamon scroll"
  if (/kouign/.test(n)) return "Kouign amann"
  if (/cheesecake/.test(n)) return "Cheesecake"
  if (/lemon butter/.test(n)) return "Lemon butter cake"
  if (/pecan/.test(n)) return "Pecan pie"
  if (/friand/.test(n)) return "Friand"
  return null
}

/** Largest-remainder split of a total across bake times. */
function splitAcrossBakes(total: number, props: number[]): number[] {
  const raw = props.map((p) => total * p)
  const base = raw.map(Math.floor)
  let rem = total - base.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const o of order) {
    if (rem <= 0) break
    base[o.i]++
    rem--
  }
  return base
}

function aestDateString(offsetDays: number): string {
  const d = new Date(Date.now() + 10 * 3600_000 - offsetDays * 86400_000)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const sp = request.nextUrl.searchParams
  const from = sp.get("from") ?? aestDateString(2)
  const to = sp.get("to") ?? aestDateString(1)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Bad date", { status: 400 })
  }

  const products = await db.pastryProduct.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })
  const productByName = new Map(products.map((p) => [p.name, p.id]))

  // Per-venue bake-split proportions from the template day.
  const splitByVenueProduct = new Map<string, number[]>()
  for (const venue of VENUES) {
    const tpl = await db.pastryRotationEntry.findMany({
      where: { venue, entryDate: new Date(`${SPLIT_TEMPLATE_DAY[venue]}T00:00:00.000Z`) },
      select: { productId: true, bakeTime: true, prepared: true },
    })
    const byProduct = new Map<string, Map<PastryBakeTime, number>>()
    for (const t of tpl) {
      const m = byProduct.get(t.productId) ?? new Map()
      m.set(t.bakeTime, t.prepared)
      byProduct.set(t.productId, m)
    }
    for (const [pid, m] of byProduct) {
      const totals = BAKES.map((b) => m.get(b) ?? 0)
      const sum = totals.reduce((a, b) => a + b, 0)
      if (sum > 0) splitByVenueProduct.set(`${venue}|${pid}`, totals.map((t) => t / sum))
    }
  }

  let daysDone = 0
  let rowsWritten = 0
  let humanKept = 0
  const start = new Date(`${from}T00:00:00.000Z`).getTime()
  const end = new Date(`${to}T00:00:00.000Z`).getTime()

  for (let t = start; t <= end; t += 86400_000) {
    const date = new Date(t).toISOString().slice(0, 10)
    const entryDate = new Date(`${date}T00:00:00.000Z`)
    for (const venue of VENUES) {
      const sales = await db.dailySales.findMany({
        where: { date: entryDate, venue },
        select: { menuItemName: true, quantitySold: true },
      })
      if (sales.length === 0) continue // no POS data — leave the day alone

      const soldByProduct = new Map<string, number>()
      for (const s of sales) {
        const name = matchProduct(s.menuItemName)
        if (!name) continue
        const pid = productByName.get(name)
        if (!pid) continue
        soldByProduct.set(pid, (soldByProduct.get(pid) ?? 0) + s.quantitySold)
      }

      const waste = await db.wasteEntry.findMany({
        where: { date: entryDate, venue },
        select: { itemName: true, quantity: true, unit: true },
      })
      const wasteByProduct = new Map<string, number>()
      for (const w of waste) {
        const name = matchProduct(w.itemName)
        if (!name) continue
        const pid = productByName.get(name)
        if (!pid) continue
        const qty = Math.round(Number(w.quantity))
        if (qty > 0 && /^(ea|each|piece|pieces|serve|serves|unit)s?$/i.test(w.unit.trim()))
          wasteByProduct.set(pid, (wasteByProduct.get(pid) ?? 0) + qty)
      }

      if (soldByProduct.size === 0 && wasteByProduct.size === 0) continue

      const existing = await db.pastryRotationEntry.findMany({
        where: { venue, entryDate },
        select: { id: true, bakeTime: true, productId: true, staffName: true },
      })
      const humanCells = new Set(
        existing
          .filter((e) => e.staffName !== null && !AUTO_NAMES.has(e.staffName))
          .map((e) => `${e.productId}|${e.bakeTime}`)
      )
      humanKept += humanCells.size
      const autoIds = existing
        .filter((e) => e.staffName !== null && AUTO_NAMES.has(e.staffName))
        .map((e) => e.id)

      const inserts: {
        venue: Venue
        entryDate: Date
        bakeTime: PastryBakeTime
        productId: string
        prepared: number
        sold: number
        discarded: number
        staffName: string
      }[] = []
      const productIds = new Set([...soldByProduct.keys(), ...wasteByProduct.keys()])
      for (const pid of productIds) {
        const sold = soldByProduct.get(pid) ?? 0
        const discarded = wasteByProduct.get(pid) ?? 0
        const prepared = sold + discarded
        if (prepared === 0) continue
        const props = splitByVenueProduct.get(`${venue}|${pid}`) ?? DEFAULT_SPLIT
        const prepSplit = splitAcrossBakes(prepared, props)
        // Waste is discovered at close, so the entire discard sits on the
        // last bake that actually produced; sold = prepared − discarded on
        // that bake, prepared elsewhere. Keeps every row internally
        // consistent (prepared = sold + discarded) with no rounding drift.
        const lastIdx = prepSplit.reduce((last, v, i) => (v > 0 ? i : last), 0)
        for (let bi = 0; bi < BAKES.length; bi++) {
          if (prepSplit[bi] === 0) continue
          if (humanCells.has(`${pid}|${BAKES[bi]}`)) continue
          const rowDiscard = bi === lastIdx ? Math.min(discarded, prepSplit[bi]) : 0
          inserts.push({
            venue,
            entryDate,
            bakeTime: BAKES[bi],
            productId: pid,
            prepared: prepSplit[bi],
            sold: prepSplit[bi] - rowDiscard,
            discarded: rowDiscard,
            staffName: "auto",
          })
        }
      }

      await db.$transaction([
        db.pastryRotationEntry.deleteMany({ where: { id: { in: autoIds } } }),
        ...inserts.map((data) =>
          db.pastryRotationEntry.upsert({
            where: {
              venue_entryDate_bakeTime_productId: {
                venue: data.venue,
                entryDate: data.entryDate,
                bakeTime: data.bakeTime,
                productId: data.productId,
              },
            },
            create: data,
            update: {
              prepared: data.prepared,
              sold: data.sold,
              discarded: data.discarded,
              staffName: "auto",
            },
          })
        ),
      ])
      rowsWritten += inserts.length
    }
    daysDone++
  }

  return NextResponse.json({ from, to, daysDone, rowsWritten, humanKept })
}
