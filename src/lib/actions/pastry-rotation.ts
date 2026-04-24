"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue, PastryBakeTime } from "@/generated/prisma"

export const BAKE_ORDER: PastryBakeTime[] = ["SIX_AM", "NINE_AM", "TWELVE_PM"]

export const BAKE_LABEL: Record<PastryBakeTime, string> = {
  SIX_AM: "6 AM bake",
  NINE_AM: "9 AM bake",
  TWELVE_PM: "12 PM bake",
}

export interface PastryProductRecord {
  id: string
  name: string
  venue: Venue
  sortOrder: number
}

export interface PastryEntryRecord {
  productId: string
  bakeTime: PastryBakeTime
  prepared: number
  sold: number
  discarded: number
  staffName: string | null
  notes: string | null
}

export interface PastryRotationDay {
  date: string // yyyy-mm-dd (AEST day)
  venue: Venue
  products: PastryProductRecord[]
  entries: PastryEntryRecord[]
}

function aestDateString(d: Date): string {
  // Convert to AEST then format yyyy-mm-dd
  const aest = new Date(d.getTime() + 10 * 60 * 60 * 1000)
  return aest.toISOString().split("T")[0]
}

function parseAestDate(s: string): Date {
  // "yyyy-mm-dd" → the DATE column stores it as-is at UTC midnight; fine.
  return new Date(`${s}T00:00:00.000Z`)
}

/**
 * Products to show for a venue. Includes any set to venue=BOTH.
 */
export async function listPastryProducts(venue: Venue): Promise<PastryProductRecord[]> {
  const rows = await db.pastryProduct.findMany({
    where: {
      isActive: true,
      venue: { in: [venue, "BOTH"] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    venue: r.venue,
    sortOrder: r.sortOrder,
  }))
}

/**
 * Fetch every entry for one AEST day (defaults to today) + the product list.
 */
export async function getPastryRotationDay(params: {
  venue: Venue
  /** yyyy-mm-dd; defaults to today (AEST) */
  date?: string
}): Promise<PastryRotationDay> {
  const date = params.date ?? aestDateString(new Date())
  const [products, rows] = await Promise.all([
    listPastryProducts(params.venue),
    db.pastryRotationEntry.findMany({
      where: {
        venue: params.venue,
        entryDate: parseAestDate(date),
      },
    }),
  ])
  return {
    date,
    venue: params.venue,
    products,
    entries: rows.map((r) => ({
      productId: r.productId,
      bakeTime: r.bakeTime,
      prepared: r.prepared,
      sold: r.sold,
      discarded: r.discarded,
      staffName: r.staffName,
      notes: r.notes,
    })),
  }
}

/**
 * Upsert a single cell (product × bake). Zero counts allowed — we write a
 * row so the UI shows a "logged but zero" distinct from "not logged".
 */
export async function savePastryRotationEntry(params: {
  venue: Venue
  date: string // yyyy-mm-dd
  bakeTime: PastryBakeTime
  productId: string
  prepared: number
  sold: number
  discarded: number
  staffName?: string | null
  notes?: string | null
}) {
  const entryDate = parseAestDate(params.date)
  await db.pastryRotationEntry.upsert({
    where: {
      venue_entryDate_bakeTime_productId: {
        venue: params.venue,
        entryDate,
        bakeTime: params.bakeTime,
        productId: params.productId,
      },
    },
    create: {
      venue: params.venue,
      entryDate,
      bakeTime: params.bakeTime,
      productId: params.productId,
      prepared: Math.max(0, Math.floor(params.prepared)),
      sold: Math.max(0, Math.floor(params.sold)),
      discarded: Math.max(0, Math.floor(params.discarded)),
      staffName: params.staffName?.trim() || null,
      notes: params.notes?.trim() || null,
    },
    update: {
      prepared: Math.max(0, Math.floor(params.prepared)),
      sold: Math.max(0, Math.floor(params.sold)),
      discarded: Math.max(0, Math.floor(params.discarded)),
      staffName: params.staffName?.trim() || null,
      notes: params.notes?.trim() || null,
    },
  })
  revalidatePath("/kitchen/pastry")
  revalidatePath("/kitchen/inspection")
}

export async function deletePastryRotationEntry(params: {
  venue: Venue
  date: string
  bakeTime: PastryBakeTime
  productId: string
}) {
  const entryDate = parseAestDate(params.date)
  await db.pastryRotationEntry.deleteMany({
    where: {
      venue: params.venue,
      entryDate,
      bakeTime: params.bakeTime,
      productId: params.productId,
    },
  })
  revalidatePath("/kitchen/pastry")
  revalidatePath("/kitchen/inspection")
}

/**
 * Inspection readout: all entries in a window, grouped by date.
 */
export interface InspectionPastryRow {
  date: string // yyyy-mm-dd
  venue: Venue
  productName: string
  bakeTime: PastryBakeTime
  prepared: number
  sold: number
  discarded: number
  staffName: string | null
}

export async function listPastryRotationForInspection(params: {
  venue?: Venue | "ALL"
  fromDate?: Date
  toDate?: Date
}): Promise<InspectionPastryRow[]> {
  const from = params.fromDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = params.toDate ?? new Date()
  const where: Record<string, unknown> = {
    entryDate: { gte: from, lte: to },
  }
  if (params.venue && params.venue !== "ALL") where.venue = params.venue
  const rows = await db.pastryRotationEntry.findMany({
    where,
    include: { product: { select: { name: true } } },
    orderBy: [{ entryDate: "desc" }, { bakeTime: "asc" }],
  })
  return rows.map((r) => ({
    date: r.entryDate.toISOString().split("T")[0],
    venue: r.venue,
    productName: r.product.name,
    bakeTime: r.bakeTime,
    prepared: r.prepared,
    sold: r.sold,
    discarded: r.discarded,
    staffName: r.staffName,
  }))
}
