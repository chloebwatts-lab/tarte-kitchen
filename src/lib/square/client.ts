/**
 * Thin Square Connect v2 client + pure aggregation helpers. Only what the
 * sales sync needs: locations, closed orders for a trading day, payments
 * (for processing fees / card takings), plus completing paid Bopple orders
 * (see complete-online.ts). No SDK, plain fetch.
 */
import Decimal from "decimal.js"

const SQUARE_API = "https://connect.squareup.com/v2"
export const SQUARE_VERSION = "2025-07-16"

export interface SquareLocation {
  id: string
  name: string
  status?: string
  timezone?: string
  merchant_id?: string
}

interface Money {
  amount?: number // cents
  currency?: string
}

export interface SquareLineItemModifier {
  uid?: string
  /** The MODIFIER catalogue object; resolves to its modifier list. */
  catalog_object_id?: string
  name?: string
  quantity?: string
  /** Unit price; $0 for a free choice ("No onion"). */
  base_price_money?: Money
  total_price_money?: Money
}

export interface SquareLineItem {
  uid?: string
  name?: string
  variation_name?: string
  catalog_object_id?: string
  quantity?: string
  item_type?: string
  gross_sales_money?: Money
  total_discount_money?: Money
  total_tax_money?: Money
  total_money?: Money
  modifiers?: SquareLineItemModifier[]
}

export interface SquareTender {
  id?: string
  type?: string // CARD, CASH, OTHER, SQUARE_GIFT_CARD, WALLET, ...
  amount_money?: Money
  /** Bopple pays as OTHER with { source: "BOPPLE", status: "CAPTURED" }. */
  other_details?: { source?: string; status?: string }
}

export interface SquareFulfillment {
  uid?: string
  type?: string // PICKUP, IN_STORE, DELIVERY, SHIPMENT
  state?: string // PROPOSED, RESERVED, PREPARED, COMPLETED, CANCELED, FAILED
  pickup_details?: { pickup_at?: string }
}

export interface SquareOrder {
  id: string
  location_id?: string
  /** Needed to update an order (optimistic concurrency). */
  version?: number
  /** "Point of Sale", "Bopple", ... */
  source?: { name?: string }
  fulfillments?: SquareFulfillment[]
  state?: string
  closed_at?: string
  created_at?: string
  line_items?: SquareLineItem[]
  total_money?: Money
  total_tax_money?: Money
  total_discount_money?: Money
  total_tip_money?: Money
  /** Money handed back on a return order (inc tax), with the tax inside it. */
  return_amounts?: { total_money?: Money; tax_money?: Money }
  /** Items returned; a refund of a completed sale lands as its own order with no line items. */
  returns?: Array<{ source_order_id?: string }>
  tenders?: SquareTender[]
  net_amount_due_money?: Money
  /** Open ticket / table name on Square for Restaurants orders. */
  ticket_name?: string
}

export interface SquarePayment {
  id: string
  status?: string
  location_id?: string
  created_at?: string
  amount_money?: Money
  refunded_money?: Money
  processing_fee?: Array<{ amount_money?: Money; type?: string }>
  source_type?: string // CARD, CASH, EXTERNAL, ...
  card_details?: { card?: { card_brand?: string } }
}

async function squareFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${SQUARE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Square ${path} failed: ${res.status} ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/** The account's business name ("Tarte Bakery") and merchant id. */
export async function getMerchant(accessToken: string): Promise<{ id: string; businessName: string | null }> {
  const data = await squareFetch<{ merchant?: { id?: string; business_name?: string } }>(accessToken, "/merchants/me")
  return { id: data.merchant?.id ?? "", businessName: data.merchant?.business_name ?? null }
}

export async function listLocations(accessToken: string): Promise<SquareLocation[]> {
  const data = await squareFetch<{ locations?: SquareLocation[] }>(accessToken, "/locations")
  return (data.locations ?? []).filter((l) => (l.status ?? "ACTIVE") === "ACTIVE")
}

/**
 * Brisbane trading day (UTC+10, no daylight saving) as RFC3339 bounds.
 */
export function aestDayRange(dateStr: string): { startAt: string; endAt: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error(`bad date ${dateStr}`)
  const start = new Date(`${dateStr}T00:00:00+10:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}

/** All COMPLETED orders closed within the day at one location. */
export async function searchClosedOrders(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<SquareOrder[]> {
  const { startAt, endAt } = aestDayRange(dateStr)
  const out: SquareOrder[] = []
  let cursor: string | undefined
  do {
    const data = await squareFetch<{ orders?: SquareOrder[]; cursor?: string }>(
      accessToken,
      "/orders/search",
      {
        method: "POST",
        body: JSON.stringify({
          location_ids: [locationId],
          limit: 500,
          return_entries: false,
          cursor,
          query: {
            filter: {
              state_filter: { states: ["COMPLETED"] },
              date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
        }),
      }
    )
    out.push(...(data.orders ?? []))
    cursor = data.cursor
  } while (cursor)
  return out
}

/**
 * OPEN orders created within the day. Bopple online orders land in Square
 * already paid (an external tender) but stay OPEN until the kitchen marks
 * them done, sometimes for the whole day, and restaurant tables sit OPEN
 * until the bill is settled. Square's own dashboard counts the paid ones as
 * sales straight away, so the sync must too; see isPaidOrder.
 */
export async function searchOpenOrders(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<SquareOrder[]> {
  const { startAt, endAt } = aestDayRange(dateStr)
  const out: SquareOrder[] = []
  let cursor: string | undefined
  do {
    const data = await squareFetch<{ orders?: SquareOrder[]; cursor?: string }>(
      accessToken,
      "/orders/search",
      {
        method: "POST",
        body: JSON.stringify({
          location_ids: [locationId],
          limit: 500,
          return_entries: false,
          cursor,
          query: {
            filter: {
              state_filter: { states: ["OPEN"] },
              date_time_filter: { created_at: { start_at: startAt, end_at: endAt } },
            },
            sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
          },
        }),
      }
    )
    out.push(...(data.orders ?? []))
    cursor = data.cursor
  } while (cursor)
  return out
}

/**
 * An order whose tenders cover its total (or that Square says has nothing
 * left due). Open tables with a part payment are not paid.
 */
export function isPaidOrder(o: SquareOrder): boolean {
  const total = o.total_money?.amount ?? 0
  if (total <= 0) return false
  if (o.net_amount_due_money && (o.net_amount_due_money.amount ?? 0) <= 0 && (o.tenders?.length ?? 0) > 0) return true
  const tendered = (o.tenders ?? []).reduce((s, t) => s + (t.amount_money?.amount ?? 0), 0)
  return tendered >= total
}

/** The Brisbane calendar date (YYYY-MM-DD) of an instant; null when missing or bad. */
export function aestDateOf(iso: string | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + 10 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Bopple online order: paid when placed, left OPEN until someone completes it. */
export function isBoppleOrder(o: SquareOrder): boolean {
  return (o.source?.name ?? "").toLowerCase().includes("bopple")
}

/**
 * COMPLETED Bopple orders created within the day, whenever they were
 * completed. Since Nov 2026 the nightly job completes them (so Amaka sends
 * them to Xero), sometimes days after they were placed; they still belong
 * to the day they were placed and paid. See mergeDayOrders.
 */
export async function searchCompletedBoppleCreated(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<SquareOrder[]> {
  const { startAt, endAt } = aestDayRange(dateStr)
  const out: SquareOrder[] = []
  let cursor: string | undefined
  do {
    const data = await squareFetch<{ orders?: SquareOrder[]; cursor?: string }>(
      accessToken,
      "/orders/search",
      {
        method: "POST",
        body: JSON.stringify({
          location_ids: [locationId],
          limit: 500,
          return_entries: false,
          cursor,
          query: {
            filter: {
              state_filter: { states: ["COMPLETED"] },
              source_filter: { source_names: ["Bopple"] },
              date_time_filter: { created_at: { start_at: startAt, end_at: endAt } },
            },
            sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
          },
        }),
      }
    )
    out.push(...(data.orders ?? []))
    cursor = data.cursor
  } while (cursor)
  return out
}

/**
 * Pure. The day's sales from the three searches: orders completed in the
 * day, orders still open that were created in the day, and Bopple orders
 * created in the day that were completed later. A Bopple order counts on
 * the day it was placed (Square's dashboard counts it then, when it is
 * paid), so one completed on a later day is dropped from that later day.
 * `openUnpaid` is the open-tables figure (bills opened, not yet settled).
 */
export function mergeDayOrders(
  dateStr: string,
  completed: SquareOrder[],
  open: SquareOrder[],
  boppleCompletedCreated: SquareOrder[] = []
): { sales: SquareOrder[]; openUnpaid: SquareOrder[] } {
  const seen = new Set<string>()
  const sales: SquareOrder[] = []
  for (const o of completed) {
    if (seen.has(o.id)) continue
    if (isBoppleOrder(o)) {
      const placed = aestDateOf(o.created_at)
      if (placed && placed !== dateStr) continue
    }
    seen.add(o.id)
    sales.push(o)
  }
  for (const o of boppleCompletedCreated) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    sales.push(o)
  }
  const openUnpaid: SquareOrder[] = []
  for (const o of open) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    if (isPaidOrder(o)) sales.push(o)
    else openUnpaid.push(o)
  }
  return { sales, openUnpaid }
}

/**
 * The day's sales as Square's dashboard counts them: COMPLETED orders closed
 * in the day plus OPEN orders created in the day that are fully paid, with
 * Bopple orders always on the day they were placed (mergeDayOrders).
 * `openUnpaid` is the open-tables figure (bills opened, not yet settled).
 */
export async function fetchDayOrders(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<{ sales: SquareOrder[]; openUnpaid: SquareOrder[] }> {
  const [completed, open, boppleLate] = await Promise.all([
    searchClosedOrders(accessToken, locationId, dateStr),
    searchOpenOrders(accessToken, locationId, dateStr),
    searchCompletedBoppleCreated(accessToken, locationId, dateStr),
  ])
  return mergeDayOrders(dateStr, completed, open, boppleLate)
}

/** OPEN Bopple orders created from `startAt` (RFC3339) up to now, oldest first. */
export async function searchOpenBoppleOrders(
  accessToken: string,
  locationId: string,
  startAt: string,
  endAt: string = new Date().toISOString()
): Promise<SquareOrder[]> {
  const out: SquareOrder[] = []
  let cursor: string | undefined
  do {
    const data = await squareFetch<{ orders?: SquareOrder[]; cursor?: string }>(
      accessToken,
      "/orders/search",
      {
        method: "POST",
        body: JSON.stringify({
          location_ids: [locationId],
          limit: 500,
          return_entries: false,
          cursor,
          query: {
            filter: {
              state_filter: { states: ["OPEN"] },
              source_filter: { source_names: ["Bopple"] },
              date_time_filter: { created_at: { start_at: startAt, end_at: endAt } },
            },
            sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
          },
        }),
      }
    )
    out.push(...(data.orders ?? []))
    cursor = data.cursor
  } while (cursor)
  return out
}

/**
 * Mark an open order and all its fulfilments COMPLETED (the Square "Picked
 * up" tap). The idempotency key is tied to the order version, so a retry of
 * the same run cannot complete anything twice. Throws on any Square error.
 */
export async function completeOrder(accessToken: string, order: SquareOrder): Promise<SquareOrder> {
  const data = await squareFetch<{ order?: SquareOrder }>(accessToken, `/orders/${order.id}`, {
    method: "PUT",
    body: JSON.stringify({
      idempotency_key: `tk-complete-${order.id}-v${order.version ?? 0}`,
      order: {
        location_id: order.location_id,
        version: order.version,
        state: "COMPLETED",
        fulfillments: (order.fulfillments ?? []).map((f) => ({ uid: f.uid, state: "COMPLETED" })),
      },
    }),
  })
  if (data.order?.state !== "COMPLETED") throw new Error(`Square left ${order.id} ${data.order?.state ?? "unknown"}`)
  return data.order
}

/** All payments created within the day at one location (any status). */
export async function listPayments(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<SquarePayment[]> {
  const { startAt, endAt } = aestDayRange(dateStr)
  const out: SquarePayment[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({
      location_id: locationId,
      begin_time: startAt,
      end_time: endAt,
      limit: "100",
      sort_order: "ASC",
    })
    if (cursor) params.set("cursor", cursor)
    const data = await squareFetch<{ payments?: SquarePayment[]; cursor?: string }>(
      accessToken,
      `/payments?${params.toString()}`
    )
    out.push(...(data.payments ?? []))
    cursor = data.cursor
  } while (cursor)
  return out
}

// ─── Pure aggregation ───────────────────────────────────────────────────────

export function cents(m: Money | undefined): Decimal {
  return new Decimal(m?.amount ?? 0).div(100)
}

export interface ItemAggregate {
  name: string
  catalogObjectId: string | null
  qty: number
  /** Line totals inc GST, after line discounts. */
  revenue: Decimal
}

export interface OrderAggregate {
  items: ItemAggregate[]
  orderCount: number
  /**
   * Sales inc GST the way Square's dashboard and daily email count them
   * ("Gross sales"): order totals less tips, less what return orders handed
   * back. Beach House 21 Oct 2026: orders summed to $9,705.05, of which
   * $8.60 was tips and $19.00 a refund; Square reported $9,677.45.
   */
  totalIncGst: Decimal
  /** GST inside totalIncGst (tax on the sales less tax handed back on returns). */
  totalTax: Decimal
  totalDiscount: Decimal
  returnsIncGst: Decimal
  tipsIncGst: Decimal
}

/**
 * What a return order (an itemised refund of a completed sale, which Square
 * writes as a new COMPLETED order with no line items) hands back, inc GST,
 * and the tax inside it. Null for any order that is not a return-only shell.
 * Square sets the shell's own totals to zero and puts the money in
 * return_amounts; a negative total is honoured too, in case it ever does.
 */
export function returnOnlyAmount(o: SquareOrder): { incGst: Decimal; tax: Decimal } | null {
  if ((o.line_items?.length ?? 0) > 0 || (o.returns?.length ?? 0) === 0) return null
  const total = cents(o.total_money).minus(cents(o.total_tip_money))
  const tax = cents(o.total_tax_money)
  return {
    incGst: total.lt(0) ? total.neg() : cents(o.return_amounts?.total_money),
    tax: tax.lt(0) ? tax.neg() : cents(o.return_amounts?.tax_money),
  }
}

/**
 * Collapse a day's orders into one row per item name. Variations
 * ("Cappuccino." + "Large") fold into the item so dish matching sees the
 * same name Lightspeed used to send; quantities are decimal strings in
 * Square but whole numbers in practice (weights are not sold here).
 */
export function aggregateOrders(orders: SquareOrder[]): OrderAggregate {
  const byName = new Map<string, ItemAggregate>()
  let totalIncGst = new Decimal(0)
  let totalTax = new Decimal(0)
  let totalDiscount = new Decimal(0)
  let returnsIncGst = new Decimal(0)
  let tipsIncGst = new Decimal(0)
  let orderCount = 0

  for (const order of orders) {
    const lineItems = order.line_items ?? []
    const back = returnOnlyAmount(order)
    if (back) {
      // A refund: not an order, and it comes off the day's sales (Square's
      // "Returns" line) on the day it was given.
      returnsIncGst = returnsIncGst.plus(back.incGst)
      totalIncGst = totalIncGst.minus(back.incGst)
      totalTax = totalTax.minus(back.tax)
      continue
    }
    const tip = cents(order.total_tip_money)
    orderCount++
    tipsIncGst = tipsIncGst.plus(tip)
    totalIncGst = totalIncGst.plus(cents(order.total_money).minus(tip))
    totalTax = totalTax.plus(cents(order.total_tax_money))
    totalDiscount = totalDiscount.plus(cents(order.total_discount_money))

    for (const li of lineItems) {
      if (li.item_type && li.item_type !== "ITEM") continue // custom amounts, gift cards
      const name = cleanItemName(li.name)
      if (!name) continue
      const qty = Math.round(parseFloat(li.quantity ?? "1")) || 0
      const row = byName.get(name) ?? {
        name,
        catalogObjectId: li.catalog_object_id ?? null,
        qty: 0,
        revenue: new Decimal(0),
      }
      row.qty += qty
      row.revenue = row.revenue.plus(cents(li.total_money))
      if (!row.catalogObjectId && li.catalog_object_id) row.catalogObjectId = li.catalog_object_id
      byName.set(name, row)
    }
  }

  const items = Array.from(byName.values()).sort((a, b) => b.revenue.comparedTo(a.revenue))
  return { items, orderCount, totalIncGst, totalTax, totalDiscount, returnsIncGst, tipsIncGst }
}

/** Square item names often end in a stray full stop ("Corona."). */
export function cleanItemName(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim()
}

/**
 * The name a product shows under in a top 10. Square holds the same product
 * twice: the cafe version ends in a full stop ("Cappuccino.") and the
 * restaurant one in " - R" ("Cappuccino - R"); a cafe combo puts the full
 * stop before the dash ("Kids Meal. - Toastie."). All three become one row.
 * Item-level sales and recipe matching keep cleanItemName, so dish
 * mappings do not move.
 */
export function mergeItemName(raw: string | undefined): string {
  return cleanItemName(raw)
    .replace(/\.\s*-\s*/g, " - ")
    .replace(/\s*-\s*R$/i, "")
    .replace(/[.\s]+$/, "")
    .trim()
}

export interface PaymentAggregate {
  /** Processing fees incl GST (Square reports fee amounts GST-inclusive). */
  fees: Decimal
  /** Card payments taken (gross, COMPLETED), before refunds. */
  cardTakings: Decimal
  cashTakings: Decimal
  otherTakings: Decimal
  cardPayments: number
}

export function aggregatePayments(payments: SquarePayment[]): PaymentAggregate {
  let fees = new Decimal(0)
  let card = new Decimal(0)
  let cash = new Decimal(0)
  let other = new Decimal(0)
  let cardPayments = 0
  for (const p of payments) {
    if (p.status && p.status !== "COMPLETED") continue
    const amt = cents(p.amount_money)
    for (const f of p.processing_fee ?? []) fees = fees.plus(cents(f.amount_money))
    if (p.source_type === "CARD" || p.source_type === "WALLET" || p.source_type === "BUY_NOW_PAY_LATER") {
      card = card.plus(amt)
      cardPayments++
    } else if (p.source_type === "CASH") {
      cash = cash.plus(amt)
    } else {
      other = other.plus(amt)
    }
  }
  return { fees, cardTakings: card, cashTakings: cash, otherTakings: other, cardPayments }
}

/** Effective processing rate as a percentage (incl GST), null when no card takings. */
export function feeRatePct(fees: Decimal, cardTakings: Decimal): number | null {
  if (cardTakings.lte(0)) return null
  return fees.div(cardTakings).times(100).toDecimalPlaces(3).toNumber()
}
