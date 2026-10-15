"use server"

import { revalidatePath } from "next/cache"
import type { Venue } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { getPerson } from "@/lib/person-session"
import { DONE_KEEP_DAYS, cleanRequestText, type OrderRequestRow } from "@/lib/order-requests/shared"

function refresh() {
  revalidatePath("/kitchen/restock")
  revalidatePath("/kitchen/restock/orders")
}

function toRow(r: {
  id: string
  text: string
  createdBy: string | null
  createdAt: Date
  doneAt: Date | null
  doneBy: string | null
}): OrderRequestRow {
  return {
    id: r.id,
    text: r.text,
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
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

/** Open requests only, for the end-of-day email. */
export async function openOrderRequests(venue: Venue): Promise<OrderRequestRow[]> {
  const rows = await db.prepOrderRequest.findMany({
    where: { venue, doneAt: null },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRow)
}

export async function addOrderRequest(params: {
  venue: Venue
  text: string
  /// The name typed on the page; the signed-in person's name otherwise.
  createdBy?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const text = cleanRequestText(params.text)
  if (!text) return { ok: false, error: "Say what needs ordering" }
  const createdBy = params.createdBy?.trim() || (await getPerson())?.name || null
  const row = await db.prepOrderRequest.create({
    data: { venue: params.venue, text, createdBy },
  })
  refresh()
  return { ok: true, id: row.id }
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
