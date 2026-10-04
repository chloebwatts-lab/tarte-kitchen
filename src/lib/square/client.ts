/**
 * Thin Square Connect v2 client + pure aggregation helpers. Only what the
 * sales sync needs: locations, closed orders for a trading day, payments
 * (for processing fees / card takings). No SDK, plain fetch.
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
}

export interface SquareTender {
  id?: string
  type?: string // CARD, CASH, OTHER, SQUARE_GIFT_CARD, WALLET, ...
  amount_money?: Money
}

export interface SquareOrder {
  id: string
  location_id?: string
  state?: string
  closed_at?: string
  created_at?: string
  line_items?: SquareLineItem[]
  total_money?: Money
  total_tax_money?: Money
  total_discount_money?: Money
  return_amounts?: { total_money?: Money }
  returns?: unknown[]
  tenders?: SquareTender[]
  net_amount_due_money?: Money
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

/**
 * The day's sales as Square's dashboard counts them: COMPLETED orders closed
 * in the day plus OPEN orders created in the day that are fully paid.
 * `openUnpaid` is the open-tables figure (bills opened, not yet settled).
 */
export async function fetchDayOrders(
  accessToken: string,
  locationId: string,
  dateStr: string
): Promise<{ sales: SquareOrder[]; openUnpaid: SquareOrder[] }> {
  const [completed, open] = await Promise.all([
    searchClosedOrders(accessToken, locationId, dateStr),
    searchOpenOrders(accessToken, locationId, dateStr),
  ])
  const seen = new Set(completed.map((o) => o.id))
  const sales = [...completed]
  const openUnpaid: SquareOrder[] = []
  for (const o of open) {
    if (seen.has(o.id)) continue
    if (isPaidOrder(o)) sales.push(o)
    else openUnpaid.push(o)
  }
  return { sales, openUnpaid }
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
  /** Sum of order totals inc GST (what the customer paid, after discounts). */
  totalIncGst: Decimal
  totalTax: Decimal
  totalDiscount: Decimal
  returnsIncGst: Decimal
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
  let orderCount = 0

  for (const order of orders) {
    const lineItems = order.line_items ?? []
    const isReturnOnly = lineItems.length === 0 && (order.returns?.length ?? 0) > 0
    if (!isReturnOnly) orderCount++
    totalIncGst = totalIncGst.plus(cents(order.total_money))
    totalTax = totalTax.plus(cents(order.total_tax_money))
    totalDiscount = totalDiscount.plus(cents(order.total_discount_money))
    returnsIncGst = returnsIncGst.plus(cents(order.return_amounts?.total_money))

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
  return { items, orderCount, totalIncGst, totalTax, totalDiscount, returnsIncGst }
}

/** Square item names often end in a stray full stop ("Corona."). */
export function cleanItemName(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim()
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
