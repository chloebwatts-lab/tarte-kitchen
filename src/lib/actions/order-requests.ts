"use server"

import { revalidatePath } from "next/cache"
import type { Venue } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { getPerson } from "@/lib/person-session"
import { DONE_KEEP_DAYS, cleanRequestText, type CatalogueChoice, type OrderRequestRow } from "@/lib/order-requests/shared"

function refresh() {
  revalidatePath("/kitchen/restock")
  revalidatePath("/kitchen/restock/orders")
}

const withItem = {
  approvedItem: { select: { id: true, name: true, packSize: true, supplier: { select: { name: true } } } },
} as const

function toRow(r: {
  id: string
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
export async function listOrderRequests(venue: Venue): Promise<OrderRequestRow[]> {
  const rows = await db.prepOrderRequest.findMany({
    where: {
      venue,
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
    select: { id: true, name: true, packSize: true, category: true, supplier: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  })
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    supplier: i.supplier.name,
    packSize: i.packSize,
    category: i.category,
  }))
}

/** Open requests only, for the end-of-day email. */
export async function openOrderRequests(venue: Venue): Promise<OrderRequestRow[]> {
  const rows = await db.prepOrderRequest.findMany({
    where: { venue, doneAt: null },
    include: withItem,
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

export async function addOrderRequest(params: {
  venue: Venue
  /// A product picked from the order list, or null for something typed.
  approvedItemId?: string | null
  /// What was typed, when nothing was picked.
  text?: string | null
  note?: string | null
  /// The name typed on the page; the signed-in person's name otherwise.
  createdBy?: string | null
}): Promise<{ ok: boolean; row?: OrderRequestRow; error?: string }> {
  const note = cleanRequestText(params.note ?? "") || null
  const createdBy = params.createdBy?.trim() || (await getPerson())?.name || null

  let text: string
  let approvedItemId: string | null = null
  if (params.approvedItemId) {
    const item = await db.approvedSupplierItem.findUnique({
      where: { id: params.approvedItemId },
      select: { id: true, name: true, active: true },
    })
    if (!item) return { ok: false, error: "That product is not on the order list any more. Type it instead." }
    text = item.name
    approvedItemId = item.id
  } else {
    text = cleanRequestText(params.text ?? "")
    if (!text) return { ok: false, error: "Say what needs ordering" }
  }

  const row = await db.prepOrderRequest.create({
    data: { venue: params.venue, text, approvedItemId, note, createdBy },
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
