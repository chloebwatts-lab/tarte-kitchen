export const dynamic = "force-dynamic"
export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { PastryBakeTime, Venue } from "@/generated/prisma/client"
import { isAutoRow, isHumanRow, matchProduct, buildBakeRows } from "@/lib/pastry-rotation-sync"

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

const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
// Last fully hand-entered day per venue, used only for the bake-time split.
const SPLIT_TEMPLATE_DAY: Record<string, string> = {
  BURLEIGH: "2026-07-25",
  BEACH_HOUSE: "2026-07-11",
  TEA_GARDEN: "2026-07-11",
}
const DEFAULT_SPLIT = [0.6, 0.3, 0.1]
const BAKES: PastryBakeTime[] = ["SIX_AM", "NINE_AM", "TWELVE_PM"]

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

  // Per-venue bake-split proportions + raw quantities from the template day.
  const splitByVenueProduct = new Map<string, number[]>()
  const templateRows = new Map<string, number[]>() // venue|pid -> per-bake prepared
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
      if (sum > 0) {
        splitByVenueProduct.set(`${venue}|${pid}`, totals.map((t) => t / sum))
        templateRows.set(`${venue}|${pid}`, totals)
      }
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
      if (sales.length === 0) continue // no POS data, leave the day alone

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
      // NULL staff names count as HUMAN: they are only producible by manual
      // paths, and a row that is neither protected nor deletable would be
      // overwritten by the upsert then destroyed on the following run.
      const humanCells = new Set(
        existing.filter((e) => isHumanRow(e.staffName)).map((e) => `${e.productId}|${e.bakeTime}`)
      )
      humanKept += humanCells.size
      const autoIds = existing.filter((e) => isAutoRow(e.staffName)).map((e) => e.id)

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
        if (prepared <= 0) continue // guards negative POS net-return days too
        const props = splitByVenueProduct.get(`${venue}|${pid}`) ?? DEFAULT_SPLIT
        const rows = buildBakeRows(prepared, discarded, props)
        for (let bi = 0; bi < BAKES.length; bi++) {
          if (rows[bi].prepared === 0) continue
          if (humanCells.has(`${pid}|${BAKES[bi]}`)) continue
          inserts.push({
            venue,
            entryDate,
            bakeTime: BAKES[bi],
            productId: pid,
            prepared: rows[bi].prepared,
            sold: rows[bi].sold,
            discarded: rows[bi].discarded,
            staffName: "auto",
          })
        }
      }

      // Template top-up: products in the venue's normal daily spread that
      // the till didn't name (Currumbin tills use generic names like
      // "Cruellers"; some products never appear by name at all). Without
      // this, those products vanish from the register on sales-derived
      // days and the record looks gap-ridden. Template quantities go in as
      // sell-through; real till numbers always take precedence above.
      for (const [key, totals] of templateRows) {
        const [tv, pid] = key.split("|")
        if (tv !== venue) continue
        if (productIds.has(pid)) continue
        for (let bi = 0; bi < BAKES.length; bi++) {
          if (totals[bi] === 0) continue
          if (humanCells.has(`${pid}|${BAKES[bi]}`)) continue
          inserts.push({
            venue,
            entryDate,
            bakeTime: BAKES[bi],
            productId: pid,
            prepared: totals[bi],
            sold: totals[bi],
            discarded: 0,
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
