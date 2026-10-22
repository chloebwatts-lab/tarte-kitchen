/**
 * One row per Square order on a venue-day, with the minute it was opened
 * and the minute it was paid. The Sales page uses these for exact
 * same-time-of-day comparisons on Square days: sales paid by that time plus
 * tables that were open at that time and paid later. Lightspeed days have
 * no orders, so they are still estimated from their hourly shape.
 */
import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { fetchDayOrders, listPayments, isPaidOrder, cents, returnOnlyAmount, type SquareOrder, type SquarePayment } from "./client"
import { channelForDevice, type Channel } from "./breakdown"
import { squareAccessFor } from "./token"
import { isSquareVenueOn } from "@/lib/pos"
import { brisbaneNow } from "@/lib/sales/insights"

export interface DayOrderRow {
  orderId: string
  createdMin: number
  paidMin: number | null
  paidIncGst: number
  table: boolean
  channel: Channel
}

/** Minutes since Brisbane midnight of `dateStr` for an instant (may run outside 0..1439). */
export function minutesOnDay(dateStr: string, iso: string | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const midnight = new Date(`${dateStr}T00:00:00+10:00`).getTime()
  return Math.floor((t - midnight) / 60000)
}

type OrderLike = SquareOrder & { source?: { name?: string } }
type PaymentLike = SquarePayment & { order_id?: string; device_details?: { device_name?: string } }

/**
 * Pure. Bopple orders are paid when they are placed, so their paid minute is
 * their created minute; a table is paid when it closed (or, still OPEN with
 * tenders covering it, at its last completed payment). A refund given in the
 * day is a negative paid row at the minute it was given, so "paid by then"
 * ends the day on Square's gross sales.
 */
export function dayOrderRows(dateStr: string, orders: SquareOrder[], payments: SquarePayment[]): DayOrderRow[] {
  const device = new Map<string, string | undefined>()
  const lastPay = new Map<string, number>()
  for (const p of payments as PaymentLike[]) {
    if (p.status && p.status !== "COMPLETED") continue
    if (!p.order_id) continue
    if (!device.has(p.order_id)) device.set(p.order_id, p.device_details?.device_name)
    const m = minutesOnDay(dateStr, p.created_at)
    if (m !== null) lastPay.set(p.order_id, Math.max(lastPay.get(p.order_id) ?? -Infinity, m))
  }
  const out: DayOrderRow[] = []
  const seen = new Set<string>()
  for (const raw of orders) {
    if (seen.has(raw.id)) continue
    seen.add(raw.id)
    const o = raw as OrderLike
    const createdMin = minutesOnDay(dateStr, o.created_at)
    if (createdMin === null) continue
    const back = returnOnlyAmount(o)
    if (back) {
      if (back.incGst.lte(0)) continue
      const refundMin = minutesOnDay(dateStr, o.closed_at) ?? createdMin
      out.push({ orderId: o.id, createdMin, paidMin: refundMin, paidIncGst: -back.incGst.toNumber(), table: false, channel: "OTHER" })
      continue
    }
    const value = cents(o.total_money).minus(cents(o.total_tip_money)).toNumber()
    const channel = channelForDevice(device.get(o.id), o.source?.name)
    const isPaid = o.state === "COMPLETED" || isPaidOrder(o)
    if (!isPaid && value <= 0) continue
    if (isPaid && value <= 0 && (o.line_items?.length ?? 0) === 0) continue // empty shells
    let paidMin: number | null = null
    if (isPaid) {
      paidMin = channel === "ONLINE" ? createdMin : (minutesOnDay(dateStr, o.closed_at) ?? lastPay.get(o.id) ?? createdMin)
    }
    const table = channel === "RESTAURANT" || Boolean(o.ticket_name)
    out.push({ orderId: o.id, createdMin, paidMin, paidIncGst: Math.round(value * 100) / 100, table, channel })
  }
  return out
}

export interface ExactAtMinute { paid: number; open: number; total: number }

/**
 * Pure. What the day looked like at `minutes` past midnight: paid by then,
 * plus tables opened by then and still unpaid at that minute.
 */
export function exactAtMinute(rows: DayOrderRow[], minutes: number): ExactAtMinute {
  let paid = 0, open = 0
  for (const r of rows) {
    if (r.paidMin !== null && r.paidMin <= minutes) paid += r.paidIncGst
    else if (r.table && r.createdMin <= minutes) open += r.paidIncGst
  }
  paid = Math.round(paid * 100) / 100
  open = Math.round(open * 100) / 100
  return { paid, open, total: Math.round((paid + open) * 100) / 100 }
}

export async function persistDayOrders(venue: Venue, dateStr: string, rows: DayOrderRow[]) {
  const date = new Date(dateStr)
  await db.$transaction([
    db.squareDayOrder.deleteMany({ where: { venue, date } }),
    ...(rows.length ? [db.squareDayOrder.createMany({
      data: rows.map((r) => ({ venue, date, orderId: r.orderId, createdMin: r.createdMin, paidMin: r.paidMin, paidIncGst: r.paidIncGst, table: r.table, channel: r.channel })),
      skipDuplicates: true,
    })] : []),
  ])
}

/** Closed Square days with no orders at all, so they are not refetched on every view. */
const emptyDays = new Map<string, number>()
const EMPTY_TTL_MS = 6 * 3600e3

/**
 * The stored rows for a closed Square day; a day the sync never wrote (before
 * this existed) is fetched from Square once and kept. Null for Lightspeed
 * days, today, or when Square is unreachable.
 */
export async function loadDayOrders(venue: Venue, dateStr: string): Promise<DayOrderRow[] | null> {
  if (!isSquareVenueOn(venue, dateStr) || dateStr >= brisbaneNow().date) return null
  const stored = await db.squareDayOrder.findMany({ where: { venue, date: new Date(dateStr) } })
  if (stored.length) {
    return stored.map((r) => ({ orderId: r.orderId, createdMin: r.createdMin, paidMin: r.paidMin, paidIncGst: Number(r.paidIncGst), table: r.table, channel: r.channel as Channel }))
  }
  const key = `${venue}|${dateStr}`
  const empty = emptyDays.get(key)
  if (empty && Date.now() - empty < EMPTY_TTL_MS) return []
  try {
    const access = await squareAccessFor(venue)
    if (!access) return null
    const { locationId, token } = access
    const [{ sales, openUnpaid }, payments] = await Promise.all([fetchDayOrders(token, locationId, dateStr), listPayments(token, locationId, dateStr)])
    const rows = dayOrderRows(dateStr, [...sales, ...openUnpaid], payments)
    if (rows.length) await persistDayOrders(venue, dateStr, rows)
    else emptyDays.set(key, Date.now())
    return rows
  } catch (err) {
    console.error("[day-orders] backfill failed", venue, dateStr, err)
    return null
  }
}
