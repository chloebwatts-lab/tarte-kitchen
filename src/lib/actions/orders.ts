"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"
import Decimal from "decimal.js"

// ============================================================================
// Types
// ============================================================================

export interface OrderListRow {
  id: string
  supplierId: string
  supplierName: string
  venue: Venue
  status: string
  orderDate: string
  expectedDate: string | null
  subtotal: number
  lineCount: number
  emailTo: string | null
}

export interface OrderDetail {
  id: string
  supplierId: string
  supplierName: string
  supplierEmail: string | null
  venue: Venue
  status: string
  orderDate: string
  expectedDate: string | null
  subtotal: number
  notes: string | null
  emailSubject: string | null
  emailTo: string | null
  emailBody: string | null
  submittedAt: string | null
  lines: {
    id: string
    ingredientId: string
    ingredientName: string
    supplierCode: string | null
    quantity: number
    unit: string
    unitPrice: number
    lineTotal: number
    receivedQty: number | null
    note: string | null
  }[]
}

export interface OrderSuggestionLine {
  ingredientId: string
  ingredientName: string
  supplierCode: string | null
  onHandBase: number | null // may be null when no prior stocktake
  forecastUsageBase: number
  parBase: number
  suggestedQty: number
  unit: string // purchase unit
  unitPrice: number
  lineTotal: number
  reason: string
}

export interface OrderSuggestion {
  supplierId: string
  supplierName: string
  supplierEmail: string | null
  venue: Venue
  lines: OrderSuggestionLine[]
  total: number
}

// ============================================================================
// Helpers
// ============================================================================

function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}

function toBaseUnits(
  qty: number,
  unit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT"
): number {
  const u = unit.toLowerCase()
  if (baseType === "WEIGHT") {
    if (u === "kg") return qty * 1000
    return qty
  }
  if (baseType === "VOLUME") {
    if (u === "l") return qty * 1000
    return qty
  }
  return qty
}

function fromBaseUnits(
  baseQty: number,
  purchaseUnit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT"
): number {
  const u = purchaseUnit.toLowerCase()
  if (baseType === "WEIGHT" && u === "kg") return baseQty / 1000
  if (baseType === "VOLUME" && u === "l") return baseQty / 1000
  return baseQty
}

/**
 * Round an order quantity up to the supplier's minimum pack size. We treat
 * the ingredient's own `purchaseQuantity` as the atomic pack — if they buy
 * "2 × 5 kg flour" that's `purchaseQuantity = 2`, `purchaseUnit = kg`, and
 * the smallest sensible order is 2. This keeps suggestions practical
 * (nobody orders 1.3 kg of flour from the distributor).
 */
function roundUpToPack(qty: number, pack: number): number {
  if (pack <= 0) return qty
  return Math.ceil(qty / pack) * pack
}

// ============================================================================
// Suggestion engine
// ============================================================================

/**
 * Build order suggestions grouped by supplier.
 *
 * For each ingredient that has a supplier + parLevel > 0:
 *   onHand  = most recent stocktake count (in base units), or null if we've
 *             never counted this item
 *   usage   = theoretical usage over the cover-window (default 7 days)
 *   need    = parBase + usage − onHand   (clamped to 0)
 *
 * When onHand is unknown we fall back to `need = par + usage` so the chef
 * still gets a reasonable suggestion on first run. The row's `reason` text
 * tells them which branch fired so they can trust-or-trim.
 */
export async function suggestOrders(params: {
  venue: Venue | "ALL"
  windowDays?: number
}): Promise<OrderSuggestion[]> {
  const { venue, windowDays = 7 } = params
  const venues =
    venue === "ALL" ? ([...SINGLE_VENUES] as Venue[]) : ([venue] as Venue[])

  // Pull every ingredient that has a supplier + par level — these are the
  // candidates for auto-ordering.
  const ingredients = await db.ingredient.findMany({
    where: {
      supplierId: { not: null },
      parLevel: { not: null },
    },
    include: {
      supplier: { select: { id: true, name: true, email: true } },
    },
  })
  if (ingredients.length === 0) return []

  // Latest submitted stocktake per (venue, ingredient) — we only trust a
  // submitted stocktake for "on hand". Draft counts are ignored.
  // Approach: fetch all submitted stocktakes for each venue in date desc
  // and build a per-venue map of ingredientId → baseQty.
  const onHandByVenue = new Map<Venue, Map<string, { base: number; date: Date }>>()
  for (const v of venues) {
    const recent = await db.stocktake.findFirst({
      where: { venue: v, status: "SUBMITTED" },
      orderBy: { date: "desc" },
      include: {
        items: {
          select: {
            ingredientId: true,
            countedBaseQty: true,
          },
        },
      },
    })
    const m = new Map<string, { base: number; date: Date }>()
    if (recent) {
      for (const it of recent.items) {
        m.set(it.ingredientId, {
          base: Number(it.countedBaseQty),
          date: recent.date,
        })
      }
    }
    onHandByVenue.set(v, m)
  }

  // Theoretical usage since last stocktake per (venue, ingredient). If we
  // don't have a prior stocktake, use the last `windowDays` of usage as a
  // rough forecast.
  const usageByVenue = new Map<Venue, Map<string, number>>()
  const forecastByVenue = new Map<Venue, Map<string, number>>()
  const forecastStart = new Date(todayAest())
  forecastStart.setDate(forecastStart.getDate() - windowDays)

  for (const v of venues) {
    const stockMap = onHandByVenue.get(v) ?? new Map()

    // Usage since last stocktake date (per ingredient, different dates)
    const sinceMap = new Map<string, number>()
    for (const [ingId, stock] of stockMap.entries()) {
      const rows = await db.theoreticalUsage.aggregate({
        where: {
          venue: v,
          ingredientId: ingId,
          date: { gt: stock.date, lte: todayAest() },
        },
        _sum: { theoreticalQty: true },
      })
      sinceMap.set(ingId, Number(rows._sum.theoreticalQty ?? 0))
    }
    usageByVenue.set(v, sinceMap)

    // Forward forecast: last N days of usage scaled to the cover-window.
    const forecast = await db.theoreticalUsage.groupBy({
      by: ["ingredientId"],
      where: { venue: v, date: { gte: forecastStart } },
      _sum: { theoreticalQty: true },
    })
    const forecastMap = new Map<string, number>()
    for (const r of forecast) {
      forecastMap.set(r.ingredientId, Number(r._sum.theoreticalQty ?? 0))
    }
    forecastByVenue.set(v, forecastMap)
  }

  // Group into per-supplier suggestions (one group per (supplier, venue))
  const groups = new Map<string, OrderSuggestion>()

  for (const ing of ingredients) {
    if (!ing.supplier) continue
    const baseType = ing.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
    const parBase = ing.parUnit
      ? toBaseUnits(Number(ing.parLevel ?? 0), ing.parUnit, baseType)
      : Number(ing.parLevel ?? 0)
    if (parBase <= 0) continue

    const unitCostBase =
      Number(ing.baseUnitsPerPurchase) > 0
        ? Number(ing.purchasePrice) / Number(ing.baseUnitsPerPurchase)
        : 0

    for (const v of venues) {
      const onHand = onHandByVenue.get(v)?.get(ing.id)?.base ?? null
      const usageSince = usageByVenue.get(v)?.get(ing.id) ?? 0
      const forwardForecast = forecastByVenue.get(v)?.get(ing.id) ?? 0

      let needBase: number
      let reason: string
      if (onHand !== null) {
        const projected = Math.max(onHand - usageSince, 0)
        needBase = parBase + forwardForecast - projected
        reason = `Par ${parBase} + forecast ${Math.round(forwardForecast)} − projected on-hand ${Math.round(projected)}`
      } else {
        needBase = parBase + forwardForecast
        reason = `No prior stocktake — par + ${windowDays}d forecast`
      }
      if (needBase <= 0) continue

      // Convert back to purchase unit, then round up to the supplier's pack
      const purchaseQty = fromBaseUnits(needBase, ing.purchaseUnit, baseType)
      const pack = Number(ing.purchaseQuantity) || 1
      const packedQty = roundUpToPack(purchaseQty, pack)
      const lineTotal =
        Math.round(
          (packedQty / pack) * Number(ing.purchasePrice) * 100
        ) / 100

      const groupKey = `${ing.supplier.id}|${v}`
      let group = groups.get(groupKey)
      if (!group) {
        group = {
          supplierId: ing.supplier.id,
          supplierName: ing.supplier.name,
          supplierEmail: ing.supplier.email,
          venue: v,
          lines: [],
          total: 0,
        }
        groups.set(groupKey, group)
      }

      const line: OrderSuggestionLine = {
        ingredientId: ing.id,
        ingredientName: ing.name,
        supplierCode: ing.supplierProductCode,
        onHandBase: onHand,
        forecastUsageBase: Math.round(forwardForecast * 100) / 100,
        parBase,
        suggestedQty: Math.round(packedQty * 1000) / 1000,
        unit: ing.purchaseUnit,
        unitPrice: Number(ing.purchasePrice) / pack,
        lineTotal,
        reason,
      }
      group.lines.push(line)
      group.total = Math.round((group.total + lineTotal) * 100) / 100
    }
  }

  // Sort lines within each group by value desc; sort groups by total desc
  const out = Array.from(groups.values())
  for (const g of out) {
    g.lines.sort((a, b) => b.lineTotal - a.lineTotal)
  }
  out.sort((a, b) => b.total - a.total)
  return out
}

/**
 * Persist a suggestion (or edited version of it) as a DRAFT PO.
 */
export async function createDraftOrder(params: {
  supplierId: string
  venue: Venue
  expectedDate?: string
  notes?: string
  lines: {
    ingredientId: string
    quantity: number
    unit: string
    unitPrice: number
    note?: string
  }[]
}) {
  const subtotal = params.lines.reduce(
    (s, l) => s + l.quantity * l.unitPrice,
    0
  )

  const order = await db.purchaseOrder.create({
    data: {
      supplierId: params.supplierId,
      venue: params.venue,
      status: "DRAFT",
      orderDate: todayAest(),
      expectedDate: params.expectedDate ? new Date(params.expectedDate) : null,
      subtotal: new Decimal(subtotal),
      notes: params.notes,
      lines: {
        create: params.lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: new Decimal(l.quantity),
          unit: l.unit,
          unitPrice: new Decimal(l.unitPrice),
          lineTotal: new Decimal(l.quantity * l.unitPrice),
          note: l.note,
        })),
      },
    },
  })
  revalidatePath("/orders")
  return order.id
}

export async function listOrders(params?: {
  status?: string
  venue?: Venue | "ALL"
}): Promise<OrderListRow[]> {
  const where: Record<string, unknown> = {}
  if (params?.status) where.status = params.status
  if (params?.venue && params.venue !== "ALL") where.venue = params.venue

  const orders = await db.purchaseOrder.findMany({
    where,
    orderBy: [{ status: "asc" }, { orderDate: "desc" }],
    include: {
      supplier: { select: { name: true } },
      _count: { select: { lines: true } },
    },
    take: 100,
  })
  return orders.map((o) => ({
    id: o.id,
    supplierId: o.supplierId,
    supplierName: o.supplier.name,
    venue: o.venue,
    status: o.status,
    orderDate: o.orderDate.toISOString().split("T")[0],
    expectedDate: o.expectedDate
      ? o.expectedDate.toISOString().split("T")[0]
      : null,
    subtotal: Number(o.subtotal),
    lineCount: o._count.lines,
    emailTo: o.emailTo,
  }))
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const o = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, email: true } },
      lines: {
        include: {
          ingredient: {
            select: { name: true, supplierProductCode: true },
          },
        },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  })
  if (!o) return null
  return {
    id: o.id,
    supplierId: o.supplier.id,
    supplierName: o.supplier.name,
    supplierEmail: o.supplier.email,
    venue: o.venue,
    status: o.status,
    orderDate: o.orderDate.toISOString().split("T")[0],
    expectedDate: o.expectedDate
      ? o.expectedDate.toISOString().split("T")[0]
      : null,
    subtotal: Number(o.subtotal),
    notes: o.notes,
    emailSubject: o.emailSubject,
    emailTo: o.emailTo,
    emailBody: o.emailBody,
    submittedAt: o.submittedAt?.toISOString() ?? null,
    lines: o.lines.map((l) => ({
      id: l.id,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredient.name,
      supplierCode: l.ingredient.supplierProductCode,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
      receivedQty: l.receivedQty !== null ? Number(l.receivedQty) : null,
      note: l.note,
    })),
  }
}

export async function updateOrderLines(params: {
  orderId: string
  lines: {
    id?: string // existing line id; omit for a new one
    ingredientId: string
    quantity: number
    unit: string
    unitPrice: number
    note?: string
  }[]
  removeIds?: string[]
}) {
  const order = await db.purchaseOrder.findUnique({
    where: { id: params.orderId },
  })
  if (!order) throw new Error("Order not found")
  if (order.status !== "DRAFT") {
    throw new Error("Can only edit draft orders")
  }

  // Delete removed lines
  if (params.removeIds && params.removeIds.length > 0) {
    await db.purchaseOrderLine.deleteMany({
      where: { id: { in: params.removeIds }, orderId: params.orderId },
    })
  }

  for (const l of params.lines) {
    const lineTotal = l.quantity * l.unitPrice
    if (l.id) {
      await db.purchaseOrderLine.update({
        where: { id: l.id },
        data: {
          quantity: new Decimal(l.quantity),
          unit: l.unit,
          unitPrice: new Decimal(l.unitPrice),
          lineTotal: new Decimal(lineTotal),
          note: l.note,
        },
      })
    } else {
      await db.purchaseOrderLine.create({
        data: {
          orderId: params.orderId,
          ingredientId: l.ingredientId,
          quantity: new Decimal(l.quantity),
          unit: l.unit,
          unitPrice: new Decimal(l.unitPrice),
          lineTotal: new Decimal(lineTotal),
          note: l.note,
        },
      })
    }
  }

  const lines = await db.purchaseOrderLine.findMany({
    where: { orderId: params.orderId },
    select: { lineTotal: true },
  })
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal), 0)
  await db.purchaseOrder.update({
    where: { id: params.orderId },
    data: { subtotal: new Decimal(subtotal) },
  })

  revalidatePath("/orders")
  revalidatePath(`/orders/${params.orderId}`)
  return { subtotal: Math.round(subtotal * 100) / 100 }
}

export async function submitOrder(params: {
  orderId: string
  by?: string
}) {
  const order = await db.purchaseOrder.findUnique({
    where: { id: params.orderId },
    include: {
      supplier: { select: { name: true, email: true } },
      lines: {
        include: {
          ingredient: {
            select: { name: true, supplierProductCode: true },
          },
        },
      },
    },
  })
  if (!order) throw new Error("Order not found")
  if (order.status !== "DRAFT") throw new Error("Order is not a draft")

  // Build a deterministic plain-text email body. We save this snapshot on
  // the order so the copy the supplier received lives alongside the PO —
  // handy when they query "I got 12 kg of flour, not 10" next week.
  const subject = `Order — ${order.supplier.name} — ${order.orderDate
    .toISOString()
    .split("T")[0]}`
  const bodyLines = [
    `Hi ${order.supplier.name},`,
    ``,
    `Please deliver the below to Tarte (${order.venue.replace(/_/g, " ")}):`,
    ``,
    ...order.lines.map((l) => {
      const code = l.ingredient.supplierProductCode
        ? ` [${l.ingredient.supplierProductCode}]`
        : ""
      return `  ${Number(l.quantity)} ${l.unit} × ${l.ingredient.name}${code}`
    }),
    ``,
    `Total (ex GST): $${Number(order.subtotal).toFixed(2)}`,
    order.expectedDate
      ? `Required by: ${order.expectedDate.toISOString().split("T")[0]}`
      : "",
    ``,
    `Thanks,`,
    `Tarte`,
  ].filter(Boolean)
  const body = bodyLines.join("\n")

  await db.purchaseOrder.update({
    where: { id: params.orderId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedBy: params.by ?? null,
      emailSubject: subject,
      emailTo: order.supplier.email,
      emailBody: body,
    },
  })

  revalidatePath("/orders")
  revalidatePath(`/orders/${params.orderId}`)
  return { subject, body, to: order.supplier.email }
}

export async function cancelOrder(orderId: string) {
  await db.purchaseOrder.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  })
  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)
}
