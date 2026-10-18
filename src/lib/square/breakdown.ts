/**
 * Pure maths for the Sales insights page: turn a day's Square orders and
 * payments into hourly buckets, channel split, registers, staff, reporting
 * groups and the surcharge, all in Brisbane time and inc GST, tips excluded.
 * No I/O here; fetch + caching live in live.ts and the sync.
 */
import Decimal from "decimal.js"
import { cents, cleanItemName, isPaidOrder, type SquareOrder, type SquarePayment } from "./client"

export type Channel = "CAFE" | "RESTAURANT" | "ONLINE" | "OTHER"

export interface CatalogLookup {
  (variationId: string | undefined): { itemName?: string; reportingCategory?: string } | undefined
}
export interface TeamLookup {
  (teamMemberId: string | undefined): string | undefined
}

export interface RegisterRow {
  name: string
  channel: Channel
  sales: number
  orders: number
  avgSale: number
}
export interface StaffRow {
  id: string
  name: string
  channel: Channel
  registers: string[]
  sales: number
  orders: number
  avgSale: number
}
/** One staff member's paid orders on one channel (the Average sale board). */
export interface StaffChannelRow {
  id: string
  name: string
  channel: Channel
  sales: number
  orders: number
}
export interface GroupRow {
  name: string
  sales: number
  qty: number
  topItems: Array<{ name: string; qty: number; sales: number }>
}

export interface DayBreakdown {
  date: string
  /**
   * Money taken inc GST, tips excluded, counted the way Square's own
   * dashboard counts it: completed and paid-open orders, plus part payments
   * already taken on tables still open, plus completed payments whose order
   * the orders search has not returned (or that have no order at all).
   */
  paidIncGst: number
  /** Part payments on open tables, inside paidIncGst. */
  partPaidIncGst: number
  /** Bills open and not yet settled: what is still owing after part payments. */
  openTablesIncGst: number
  openTables: number
  paidOrders: number
  avgTransaction: number
  /** Sunday / public holiday surcharge inside paidIncGst. */
  surchargeIncGst: number
  surchargeName: string | null
  tipsIncGst: number
  /** 24 buckets by closed time (paid). */
  hourly: number[]
  /** 24 buckets, orders paid per hour. */
  hourlyOrders: number[]
  channels: Record<Channel, { sales: number; orders: number }>
  registers: RegisterRow[]
  staff: StaffRow[]
  /** Staff split by channel: someone on a cafe till in the morning and a handheld at lunch gets two rows. */
  staffChannels: StaffChannelRow[]
  groups: GroupRow[]
  /** Payment ids that no order referenced (diagnostic). */
  unmatchedPayments: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function aestHour(iso: string | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + 10 * 3600e3).getUTCHours()
}

/** Register / device name -> channel. "HH" is a restaurant handheld. */
export function channelForDevice(deviceName: string | undefined, sourceName: string | undefined): Channel {
  const src = (sourceName ?? "").toLowerCase()
  if (src.includes("bopple") || src.includes("online") || src.includes("ecom")) return "ONLINE"
  const d = (deviceName ?? "").toLowerCase()
  if (!d) return "OTHER"
  // Handhelds ("HH 4 - RESTAURANT", "HH8- TEA GARDEN") are table service.
  if (/\bhh\s*\d/.test(d) || d.includes("restaurant") || d.includes("handheld") || d.includes("floor")) return "RESTAURANT"
  if (d.includes("cafe") || d.includes("market") || d.includes("counter") || d.includes("takeaway") || d.includes("pos")) return "CAFE"
  // Any other named register is a counter till.
  return "CAFE"
}

export function isSurchargeName(name: string | undefined): boolean {
  return /surcharge|public holiday|sunday/i.test(name ?? "")
}

interface OrderLike extends SquareOrder {
  service_charges?: Array<{ name?: string; total_money?: { amount?: number } }>
  total_tip_money?: { amount?: number }
  total_service_charge_money?: { amount?: number }
  source?: { name?: string }
  created_by_team_member_id?: string
}

export function computeDayBreakdown(
  date: string,
  orders: SquareOrder[],
  payments: SquarePayment[],
  catalog: CatalogLookup,
  team: TeamLookup,
  nowAestHour: number | null = null
): DayBreakdown {
  // Payment facts per order: device + team member from the first completed
  // payment, and every completed payment by order for part payments.
  type PaymentLike = SquarePayment & { order_id?: string; device_details?: { device_name?: string }; team_member_id?: string }
  const payByOrder = new Map<string, { device?: string; teamMemberId?: string }>()
  const paymentsByOrder = new Map<string, PaymentLike[]>()
  const orderless: PaymentLike[] = []
  for (const p of payments as PaymentLike[]) {
    if (p.status && p.status !== "COMPLETED") continue
    if (!p.order_id) { orderless.push(p); continue }
    if (!payByOrder.has(p.order_id)) {
      payByOrder.set(p.order_id, { device: p.device_details?.device_name, teamMemberId: p.team_member_id })
    }
    ;(paymentsByOrder.get(p.order_id) ?? paymentsByOrder.set(p.order_id, []).get(p.order_id)!).push(p)
  }
  /** What a payment took, ex tip (amount_money never includes the tip), less anything refunded back. */
  const taken = (p: PaymentLike): Decimal => cents(p.amount_money).minus(cents(p.refunded_money))

  const hourly = new Array(24).fill(0) as number[]
  const hourlyOrders = new Array(24).fill(0) as number[]
  const channels: Record<Channel, { sales: number; orders: number }> = {
    CAFE: { sales: 0, orders: 0 }, RESTAURANT: { sales: 0, orders: 0 }, ONLINE: { sales: 0, orders: 0 }, OTHER: { sales: 0, orders: 0 },
  }
  const registers = new Map<string, RegisterRow>()
  const staff = new Map<string, StaffRow>()
  const staffChannels = new Map<string, StaffChannelRow>()
  const groups = new Map<string, { sales: Decimal; qty: number; items: Map<string, { qty: number; sales: Decimal }> }>()
  let paid = new Decimal(0), partPaid = new Decimal(0), openTotal = new Decimal(0), surcharge = new Decimal(0), tips = new Decimal(0)
  let openCount = 0, paidOrders = 0, unmatchedPayments = 0
  let surchargeName: string | null = null
  const seen = new Set<string>()

  for (const raw of orders) {
    if (seen.has(raw.id)) continue
    seen.add(raw.id)
    const o = raw as OrderLike
    const tip = cents(o.total_tip_money)
    const total = cents(o.total_money).minus(tip)
    const isPaid = o.state === "COMPLETED" || isPaidOrder(o)
    if (!isPaid) {
      // A table still open: whatever has been tapped so far is a sale now
      // (Square counts it the moment the payment completes); the rest is owing.
      let tendered = new Decimal(0)
      for (const p of paymentsByOrder.get(o.id) ?? []) {
        let amt = taken(p)
        // Never more than the bill (an item taken off after a tap).
        if (amt.gt(total.minus(tendered))) amt = total.minus(tendered)
        if (amt.lte(0)) continue
        tendered = tendered.plus(amt)
        const ph = aestHour(p.created_at)
        if (ph !== null) hourly[ph] += amt.toNumber()
      }
      paid = paid.plus(tendered)
      partPaid = partPaid.plus(tendered)
      const owing = total.minus(tendered)
      if (owing.gt(0)) { openTotal = openTotal.plus(owing); openCount++ }
      continue
    }
    if (total.lte(0) && (o.line_items?.length ?? 0) === 0) continue // return-only shells
    paid = paid.plus(total)
    tips = tips.plus(tip)
    paidOrders++
    for (const sc of o.service_charges ?? []) {
      if (isSurchargeName(sc.name)) {
        surcharge = surcharge.plus(cents(sc.total_money))
        surchargeName = surchargeName ?? sc.name ?? "Surcharge"
      }
    }
    const h = aestHour(o.closed_at ?? o.created_at)
    if (h !== null) { hourly[h] += total.toNumber(); hourlyOrders[h]++ }

    const pay = payByOrder.get(o.id)
    const channel = channelForDevice(pay?.device, o.source?.name)
    channels[channel].sales += total.toNumber(); channels[channel].orders++

    const regName = channel === "ONLINE" ? (o.source?.name ?? "Online") : (pay?.device ?? "Unknown register")
    const reg = registers.get(regName) ?? { name: regName, channel, sales: 0, orders: 0, avgSale: 0 }
    reg.sales += total.toNumber(); reg.orders++; registers.set(regName, reg)

    const tmId = pay?.teamMemberId ?? o.created_by_team_member_id
    if (tmId && channel !== "ONLINE") {
      const row = staff.get(tmId) ?? { id: tmId, name: team(tmId) ?? "Unknown", channel, registers: [], sales: 0, orders: 0, avgSale: 0 }
      row.sales += total.toNumber(); row.orders++
      if (!row.registers.includes(regName)) row.registers.push(regName)
      staff.set(tmId, row)
      const ck = `${tmId}|${channel}`
      const sc = staffChannels.get(ck) ?? { id: tmId, name: row.name, channel, sales: 0, orders: 0 }
      sc.sales += total.toNumber(); sc.orders++
      staffChannels.set(ck, sc)
    }

    for (const li of o.line_items ?? []) {
      if (li.item_type && li.item_type !== "ITEM") continue
      const info = catalog(li.catalog_object_id)
      const groupName = info?.reportingCategory ?? "Uncategorised"
      const itemName = cleanItemName(li.name) || info?.itemName || "Item"
      const qty = Math.round(parseFloat(li.quantity ?? "1")) || 0
      const lineSales = cents(li.total_money)
      const g = groups.get(groupName) ?? { sales: new Decimal(0), qty: 0, items: new Map() }
      g.sales = g.sales.plus(lineSales); g.qty += qty
      const it = g.items.get(itemName) ?? { qty: 0, sales: new Decimal(0) }
      it.qty += qty; it.sales = it.sales.plus(lineSales); g.items.set(itemName, it)
      groups.set(groupName, g)
    }
  }

  // Completed payments whose order is not in the set we fetched: no order id
  // at all, or an order the orders search has not caught up with yet. Square
  // already counts them, so the live total does too; they sit in the hour
  // the payment was taken.
  const stray = [...orderless, ...[...paymentsByOrder.entries()].filter(([id]) => !seen.has(id)).flatMap(([, ps]) => ps)]
  for (const p of stray) {
    unmatchedPayments++
    const amt = taken(p)
    if (amt.lte(0)) continue
    paid = paid.plus(amt)
    paidOrders++
    const ph = aestHour(p.created_at)
    if (ph !== null) { hourly[ph] += amt.toNumber(); hourlyOrders[ph]++ }
  }

  const paidNum = paid.toNumber()
  const regRows = [...registers.values()].map((r) => ({ ...r, sales: r2(r.sales), avgSale: r.orders ? r2(r.sales / r.orders) : 0 })).sort((a, b) => b.sales - a.sales)
  const staffRows = [...staff.values()].map((s) => ({ ...s, sales: r2(s.sales), avgSale: s.orders ? r2(s.sales / s.orders) : 0 })).sort((a, b) => b.sales - a.sales)
  const groupRows: GroupRow[] = [...groups.entries()]
    .map(([name, g]) => ({
      name, sales: r2(g.sales.toNumber()), qty: g.qty,
      topItems: [...g.items.entries()].map(([n, v]) => ({ name: n, qty: v.qty, sales: r2(v.sales.toNumber()) })).sort((a, b) => b.sales - a.sales).slice(0, 10),
    }))
    .sort((a, b) => b.sales - a.sales)
  void nowAestHour

  return {
    date,
    paidIncGst: r2(paidNum),
    partPaidIncGst: r2(partPaid.toNumber()),
    openTablesIncGst: r2(openTotal.toNumber()),
    openTables: openCount,
    paidOrders,
    avgTransaction: paidOrders ? r2(paidNum / paidOrders) : 0,
    surchargeIncGst: r2(surcharge.toNumber()),
    surchargeName,
    tipsIncGst: r2(tips.toNumber()),
    hourly: hourly.map(r2),
    hourlyOrders,
    channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, { sales: r2(v.sales), orders: v.orders }])) as DayBreakdown["channels"],
    registers: regRows,
    staff: staffRows,
    staffChannels: [...staffChannels.values()].map((s) => ({ ...s, sales: r2(s.sales) })).sort((a, b) => b.sales - a.sales),
    groups: groupRows,
    unmatchedPayments,
  }
}
