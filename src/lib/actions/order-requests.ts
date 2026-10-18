"use server"

import { revalidatePath } from "next/cache"
import type { OrderDept, Venue } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { deptForItem } from "@/lib/departments"
import { getPerson } from "@/lib/person-session"
import { DONE_KEEP_DAYS, MAX_QTY, cleanRequestText, splitLeadingQty, type CatalogueChoice, type OrderRequestRow } from "@/lib/order-requests/shared"

function refresh() {
  revalidatePath("/kitchen/restock")
  revalidatePath("/kitchen/restock/orders")
  revalidatePath("/kitchen/pastry")
}

const withItem = {
  approvedItem: { select: { id: true, name: true, packSize: true, supplier: { select: { name: true } } } },
} as const

function toRow(r: {
  id: string
  dept: OrderDept
  qty: unknown
  text: string
  note: string | null
  approvedItemId: string | null
  approvedItem: { id: string; name: string; packSize: string | null; supplier: { name: string } } | null
  createdBy: string | null
  createdAt: Date
  doneAt: Date | null
  doneBy: string | null
}): OrderRequestRow {
  return {
    id: r.id,
    dept: r.dept,
    qty: r.qty == null ? null : Number(r.qty),
    // The catalogue name wins if the item was renamed since.
    text: r.approvedItem?.name ?? r.text,
    approvedItemId: r.approvedItem?.id ?? null,
    supplier: r.approvedItem?.supplier.name ?? null,
    packSize: r.approvedItem?.packSize ?? null,
    note: r.note,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    done: r.doneAt != null,
    doneBy: r.doneBy,
    doneAt: r.doneAt?.toISOString() ?? null,
  }
}

/** Open requests, newest first, then the ones ticked in the last few days. */
export async function listOrderRequests(venue: Venue, dept: OrderDept = "KITCHEN"): Promise<OrderRequestRow[]> {
  const rows = await db.prepOrderRequest.findMany({
    where: {
      venue,
      dept,
      OR: [{ doneAt: null }, { doneAt: { gte: new Date(Date.now() - DONE_KEEP_DAYS * 86_400_000) } }],
    },
    include: withItem,
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

/**
 * Every active product on the approved order list, for the picker. One
 * flat list across suppliers; the picker searches it as the chef types.
 */
export async function listRequestCatalogue(): Promise<CatalogueChoice[]> {
  const items = await db.approvedSupplierItem.findMany({
    where: { active: true },
    select: { id: true, name: true, packSize: true, category: true, dept: true, supplier: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  })
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    supplier: i.supplier.name,
    packSize: i.packSize,
    category: i.category,
    dept: deptForItem(i),
  }))
}

/** How many requests nobody has ticked yet, for a tile. */
export async function countOpenOrderRequests(venue: Venue, dept: OrderDept = "KITCHEN"): Promise<number> {
  return db.prepOrderRequest.count({ where: { venue, dept, doneAt: null } })
}

/** Open requests only, for the end-of-day email. */
export async function openOrderRequests(venue: Venue, dept: OrderDept = "KITCHEN"): Promise<OrderRequestRow[]> {
  const rows = await db.prepOrderRequest.findMany({
    where: { venue, dept, doneAt: null },
    include: withItem,
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

export async function addOrderRequest(params: {
  venue: Venue
  dept?: OrderDept
  /// A product picked from the order list, or null for something typed.
  approvedItemId?: string | null
  /// What was typed, when nothing was picked.
  text?: string | null
  /// Packs wanted, already parsed (parseQty); null = some.
  qty?: number | null
  note?: string | null
  /// The name typed on the page; the signed-in person's name otherwise.
  createdBy?: string | null
}): Promise<{ ok: boolean; row?: OrderRequestRow; error?: string }> {
  const note = cleanRequestText(params.note ?? "") || null
  const createdBy = params.createdBy?.trim() || (await getPerson())?.name || null

  let text: string
  let approvedItemId: string | null = null
  // "4 cream" typed in one go: the 4 is the quantity unless the box says otherwise.
  let typedQty: number | null = null
  if (params.approvedItemId) {
    const item = await db.approvedSupplierItem.findUnique({
      where: { id: params.approvedItemId },
      select: { id: true, name: true, active: true },
    })
    if (!item || !item.active) return { ok: false, error: "That product is not on the order list any more. Type it instead." }
    text = item.name
    approvedItemId = item.id
  } else {
    const split = splitLeadingQty(params.text ?? "")
    text = split.text
    typedQty = split.qty
    if (!text) return { ok: false, error: "Say what needs ordering" }
    // Typed the exact name of one product on the order list? Link it, so the
    // head chef still sees the supplier and pack without anyone searching.
    const exact = await db.approvedSupplierItem.findMany({
      where: { active: true, name: { equals: text, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 2,
    })
    if (exact.length === 1) {
      approvedItemId = exact[0].id
      text = exact[0].name
    }
  }

  const boxQty = params.qty != null && Number.isFinite(params.qty) && params.qty > 0 ? Math.round(params.qty * 100) / 100 : null
  if (boxQty != null && boxQty >= MAX_QTY) return { ok: false, error: "That number is too big to be a quantity" }
  const qty = boxQty ?? typedQty
  const row = await db.prepOrderRequest.create({
    data: { venue: params.venue, dept: params.dept ?? "KITCHEN", text, approvedItemId, qty, note, createdBy },
    include: withItem,
  })
  refresh()
  return { ok: true, row: toRow(row) }
}

export async function setOrderRequestDone(params: {
  id: string
  done: boolean
  doneBy?: string | null
}): Promise<{ ok: boolean }> {
  if (!params.id) return { ok: false }
  const by = params.doneBy?.trim() || (await getPerson())?.name || null
  await db.prepOrderRequest.updateMany({
    where: { id: params.id },
    data: params.done ? { doneAt: new Date(), doneBy: by } : { doneAt: null, doneBy: null },
  })
  refresh()
  return { ok: true }
}
