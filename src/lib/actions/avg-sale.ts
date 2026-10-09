"use server"

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { assertManager } from "@/lib/manager-auth"
import { isSquareVenueOn } from "@/lib/pos"
import { fetchLiveDay, persistDayBreakdown } from "@/lib/square/live"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate, tarteWeekStart } from "@/lib/sales/compare"
import { buildAvgBoard, weekMinOrders, DAY_MIN_ORDERS, type AvgBoard, type BoardChannel } from "@/lib/sales/avg-sale"

export type AvgTab = "today" | "yesterday" | "week"
export interface AvgSaleData {
  venue: Venue
  tab: AvgTab
  channel: BoardChannel
  onSquare: boolean
  rangeLabel: string
  board: AvgBoard
  live: boolean
}

const D = (s: string) => new Date(`${s}T00:00:00Z`)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Average sale board for a channel over today / yesterday / this week.
 * Today refreshes from Square on every load (2-minute cache in fetchLiveDay)
 * and writes the day back, so the sync and the page agree.
 */
export async function getAvgSaleBoard(venue: Venue, tab: AvgTab, channel: BoardChannel): Promise<AvgSaleData> {
  await assertManager()
  const today = brisbaneNow().date
  const from = tab === "today" ? today : tab === "yesterday" ? shiftDate(today, -1) : tarteWeekStart(today)
  const to = tab === "yesterday" ? from : today
  const onSquare = isSquareVenueOn(venue, to)

  if (onSquare && tab !== "yesterday") {
    try {
      const live = await fetchLiveDay(venue, today)
      if (live) await persistDayBreakdown(venue, today, live.breakdown)
    } catch (err) { console.error("[avg-sale] live refresh failed", err) }
  }

  const raw = await db.dailyStaffSales.findMany({ where: { venue, date: { gte: D(from), lte: D(to) } } })
  const rows = raw.map((r) => ({ date: ymd(r.date), teamMemberId: r.teamMemberId, staffName: r.staffName, channel: r.channel, sales: Number(r.salesIncGst), orders: r.orders }))
  const daysSoFar = Math.round((D(to).getTime() - D(from).getTime()) / 86400000) + 1
  const minOrders = tab === "week" ? weekMinOrders(daysSoFar) : DAY_MIN_ORDERS
  const board = buildAvgBoard(rows, channel, minOrders)

  const fmt = (s: string) => D(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  return { venue, tab, channel, onSquare, rangeLabel: from === to ? fmt(from) : `${fmt(from)} to ${fmt(to)}`, board, live: tab !== "yesterday" }
}
