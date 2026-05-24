"use server"

/**
 * Order-checklist actions — the chef-facing daily ordering workflow.
 *
 * Each supplier is treated like a daily checklist run:
 *   - There's at most ONE open DRAFT order per (supplier, venue) per day.
 *   - The chef opens it, ticks items + enters qty, saves as they go.
 *   - When ready, they submit → email goes to supplier, PO flips to SUBMITTED.
 *
 * Mirrors the checklist UX: cards on the landing show today's progress
 * (X of Y items, draft/submitted/not started), the per-supplier page is the
 * actual fill-in form.
 */

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

// ---------- Date helpers ----------
function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}
function tomorrowAest(): Date {
  const t = todayAest()
  t.setUTCDate(t.getUTCDate() + 1)
  return t
}

// ---------- Types ----------
export type SupplierOrderCard = {
  supplierId: string
  supplierName: string
  supplierEmail: string | null
  deliveryDays: number[]
  itemCount: number // items on this supplier's approved form
  todayDraft: {
    orderId: string
    status: string // DRAFT | SUBMITTED
    lineCount: number
    total: number
    submittedAt: string | null
  } | null
}

export type SupplierOrderRow = {
  approvedItemId: string
  ingredientId: string | null
  name: string
  category: string | null
  packSize: string | null
  packPrice: number
  unitPrice: number | null
  unit: string | null
  /** Existing draft-line entry for this approved item (if already ticked). */
  draftLine: {
    id: string
    quantity: number
    note: string | null
  } | null
}

// ---------- Landing: cards per supplier ----------
export async function listSupplierOrderCards(
  venue: Venue
): Promise<SupplierOrderCard[]> {
  const start = todayAest()
  const end = tomorrowAest()

  const suppliers = await db.supplier.findMany({
    where: { approvedItems: { some: { active: true } } },
    select: {
      id: true,
      name: true,
      email: true,
      deliveryDays: true,
      _count: { select: { approvedItems: { where: { active: true } } } },
    },
    orderBy: { name: "asc" },
  })

  // Today's drafts/submitted orders per supplier
  const todaysOrders = await db.purchaseOrder.findMany({
    where: {
      venue,
      orderDate: { gte: start, lt: end },
      supplierId: { in: suppliers.map((s) => s.id) },
    },
    include: { _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" },
  })
  const orderBySupplier = new Map<string, (typeof todaysOrders)[number]>()
  for (const o of todaysOrders) {
    if (!o.supplierId) continue
    if (!orderBySupplier.has(o.supplierId)) orderBySupplier.set(o.supplierId, o)
  }

  return suppliers.map((s) => {
    const o = orderBySupplier.get(s.id) ?? null
    return {
      supplierId: s.id,
      supplierName: s.name,
      supplierEmail: s.email,
      deliveryDays: s.deliveryDays,
      itemCount: s._count.approvedItems,
      todayDraft: o
        ? {
            orderId: o.id,
            status: o.status,
            lineCount: o._count.lines,
            total: Number(o.subtotal),
            submittedAt: o.submittedAt?.toISOString() ?? null,
          }
        : null,
    }
  })
}

// ---------- Resolver: today's open draft or create one ----------
export async function findOrCreateTodayDraftOrder(
  supplierId: string,
  venue: Venue
): Promise<string> {
  const start = todayAest()
  const end = tomorrowAest()
  const existing = await db.purchaseOrder.findFirst({
    where: {
      supplierId,
      venue,
      status: "DRAFT",
      orderDate: { gte: start, lt: end },
    },
    orderBy: { createdAt: "desc" },
  })
  if (existing) return existing.id
  const order = await db.purchaseOrder.create({
    data: {
      supplierId,
      venue,
      status: "DRAFT",
      orderDate: todayAest(),
      subtotal: new Decimal(0),
    },
  })
  return order.id
}

// ---------- Run page rows (approved items + any existing draft-line state) ----------
export async function getOrderRunRows(
  supplierId: string,
  orderId: string
): Promise<{
  supplier: { id: string; name: string; email: string | null; deliveryDays: number[] } | null
  order: { id: string; status: string; venue: Venue; subtotal: number; submittedAt: string | null } | null
  rows: SupplierOrderRow[]
}> {
  const [supplier, order, items] = await Promise.all([
    db.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, email: true, deliveryDays: true },
    }),
    db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    }),
    db.approvedSupplierItem.findMany({
      where: { supplierId, active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ])
  if (!supplier || !order) return { supplier: null, order: null, rows: [] }

  // Existing draft lines: index by ingredientId or by description-match on the
  // approved item name (handles unlinked items).
  type LineRef = { id: string; quantity: number; note: string | null }
  const linesByIngredient = new Map<string, LineRef>()
  const linesByDescription = new Map<string, LineRef>()
  for (const l of order.lines) {
    const ref: LineRef = {
      id: l.id,
      quantity: Number(l.quantity),
      note: l.note,
    }
    if (l.ingredientId) linesByIngredient.set(l.ingredientId, ref)
    if (l.description) linesByDescription.set(l.description.toLowerCase(), ref)
  }

  const rows: SupplierOrderRow[] = items.map((it) => {
    let draft: LineRef | null = null
    if (it.ingredientId && linesByIngredient.has(it.ingredientId)) {
      draft = linesByIngredient.get(it.ingredientId) ?? null
    } else if (linesByDescription.has(it.name.toLowerCase())) {
      draft = linesByDescription.get(it.name.toLowerCase()) ?? null
    }
    return {
      approvedItemId: it.id,
      ingredientId: it.ingredientId,
      name: it.name,
      category: it.category,
      packSize: it.packSize,
      packPrice: Number(it.packPrice),
      unitPrice: 0, // not currently in ApprovedSupplierItem schema; price-per-pack is enough for UI
      unit: it.unit,
      draftLine: draft,
    }
  })

  return {
    supplier,
    order: {
      id: order.id,
      status: order.status,
      venue: order.venue,
      subtotal: Number(order.subtotal),
      submittedAt: order.submittedAt?.toISOString() ?? null,
    },
    rows,
  }
}

// ---------- Save: upsert a single line (chef ticks / changes qty / clears) ----------
export async function upsertOrderLine(params: {
  orderId: string
  approvedItemId: string
  quantity: number // 0 = remove the line
}): Promise<void> {
  const { orderId, approvedItemId, quantity } = params

  const item = await db.approvedSupplierItem.findUnique({
    where: { id: approvedItemId },
    select: {
      id: true,
      name: true,
      packSize: true,
      packPrice: true,
      ingredientId: true,
    },
  })
  if (!item) throw new Error("Approved item not found")

  const description = item.packSize ? `${item.name} (${item.packSize})` : item.name

  // Find existing line by ingredient or by description
  const existing = await db.purchaseOrderLine.findFirst({
    where: {
      orderId,
      OR: [
        item.ingredientId ? { ingredientId: item.ingredientId } : { id: "__never__" },
        { description },
      ],
    },
  })

  if (quantity <= 0) {
    if (existing) {
      await db.purchaseOrderLine.delete({ where: { id: existing.id } })
    }
  } else {
    const packPrice = Number(item.packPrice)
    const lineTotal = packPrice * quantity
    if (existing) {
      await db.purchaseOrderLine.update({
        where: { id: existing.id },
        data: {
          quantity: new Decimal(quantity),
          unitPrice: new Decimal(packPrice),
          lineTotal: new Decimal(lineTotal),
          unit: "pack",
          description,
        },
      })
    } else {
      await db.purchaseOrderLine.create({
        data: {
          orderId,
          ingredientId: item.ingredientId,
          description,
          quantity: new Decimal(quantity),
          unit: "pack",
          unitPrice: new Decimal(packPrice),
          lineTotal: new Decimal(lineTotal),
        },
      })
    }
  }

  // Recompute order subtotal
  const lines = await db.purchaseOrderLine.findMany({
    where: { orderId },
    select: { lineTotal: true },
  })
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal), 0)
  await db.purchaseOrder.update({
    where: { id: orderId },
    data: { subtotal: new Decimal(subtotal) },
  })

  revalidatePath(`/order-checklists`)
  revalidatePath(`/order-checklists/${params.orderId}`)
}

// ---------- Re-export venue list helper for the landing ----------
export async function listLiveVenues(): Promise<Venue[]> {
  return [...SINGLE_VENUES] as Venue[]
}
