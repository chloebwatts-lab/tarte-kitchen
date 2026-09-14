"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  Venue,
  VenueStockSignal,
  VenueStockTracking,
} from "@/generated/prisma/client"

// ------------------------------------------------------------------
// The venue stock round: crockery, plasdene, packaging, jar lids,
// cutlery, glass cleaner, tea towels.
//
// Split by how things actually behave. Slow expensive items carry a
// number. Fast cheap ones carry a signal, because nobody counts tea
// towels twice and a count that is wrong but trusted is worse than
// none. Both feed one reorder list.
//
// Whoever is on shift walks and taps. Georgia sets the pars and reads
// the output. If this ever becomes another screen she has to fill in,
// it has failed.
// ------------------------------------------------------------------

export interface RoundItem {
  id: string
  name: string
  unit: string | null
  tracking: VenueStockTracking
  parLevel: number | null
  onHand: number | null
  signal: VenueStockSignal
  signalBy: string | null
  /// True when this item is already on the reorder list, so the walker
  /// can see it has been noticed and does not flag it again.
  belowPar: boolean
}

export interface RoundArea {
  id: string
  name: string
  items: RoundItem[]
}

const n = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

function isBelowPar(item: {
  tracking: VenueStockTracking
  onHand: unknown
  parLevel: unknown
  signal: VenueStockSignal
}): boolean {
  if (item.tracking === "SIGNAL") return item.signal !== "OK"
  const on = n(item.onHand)
  const par = n(item.parLevel)
  if (on === null || par === null) return false
  return on <= par
}

/** The walk. Areas in route order, never alphabetical. */
export async function getStockRound(venue: Venue): Promise<RoundArea[]> {
  const areas = await db.venueStockArea.findMany({
    where: { venue, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  })

  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    items: a.items.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      tracking: i.tracking,
      parLevel: n(i.parLevel),
      onHand: n(i.onHand),
      signal: i.signal,
      signalBy: i.signalBy,
      belowPar: isBelowPar(i),
    })),
  }))
}

/** One tap on a cheap fast-moving item. No numbers involved. */
export async function recordSignal(
  itemId: string,
  signal: VenueStockSignal,
  by: string
) {
  await db.venueStockItem.update({
    where: { id: itemId },
    data: {
      signal,
      signalAt: signal === "OK" ? null : new Date(),
      signalBy: signal === "OK" ? null : by.trim() || null,
    },
  })
  revalidatePath("/kitchen/stock")
  revalidatePath("/venue-ops/stock")
}

/**
 * Someone took some of a counted item. Writes the ledger row and the new
 * balance together so the running figure can always be explained.
 */
export async function recordTake(itemId: string, qty: number, by: string) {
  if (!(qty > 0)) throw new Error("How many did you take?")
  await applyMovement(itemId, "TAKE", -qty, by)
}

/** A delivery landed, entered by hand rather than matched from an invoice. */
export async function recordReceipt(itemId: string, qty: number, by: string) {
  if (!(qty > 0)) throw new Error("How many came in?")
  await applyMovement(itemId, "RECEIPT", qty, by)
}

/**
 * A physical count. Perpetual figures drift, so this resets to truth and
 * records the correction rather than pretending the drift never happened.
 */
export async function recordCount(itemId: string, countedTo: number, by: string) {
  const item = await db.venueStockItem.findUnique({ where: { id: itemId } })
  if (!item) throw new Error("Unknown item")
  const before = n(item.onHand) ?? 0
  const delta = countedTo - before

  await db.$transaction([
    db.venueStockMovement.create({
      data: {
        itemId,
        kind: "COUNT",
        delta,
        balance: countedTo,
        countedTo,
        by: by.trim() || null,
      },
    }),
    db.venueStockItem.update({
      where: { id: itemId },
      data: {
        onHand: countedTo,
        // A count clears a signal: somebody has just looked at the shelf.
        signal: "OK",
        signalAt: null,
        signalBy: null,
      },
    }),
  ])
  revalidatePath("/kitchen/stock")
  revalidatePath("/venue-ops/stock")
}

async function applyMovement(
  itemId: string,
  kind: "TAKE" | "RECEIPT" | "ADJUST",
  delta: number,
  by: string,
  invoiceLineItemId?: string
) {
  const item = await db.venueStockItem.findUnique({ where: { id: itemId } })
  if (!item) throw new Error("Unknown item")
  const before = n(item.onHand) ?? 0
  // Never let a running figure go negative: it means a take was logged that
  // the receipts do not account for, and a negative shelf is not a thing.
  const after = Math.max(0, before + delta)

  await db.$transaction([
    db.venueStockMovement.create({
      data: {
        itemId,
        kind,
        delta,
        balance: after,
        by: by.trim() || null,
        invoiceLineItemId: invoiceLineItemId ?? null,
      },
    }),
    db.venueStockItem.update({
      where: { id: itemId },
      data: {
        onHand: after,
        // A receipt clears a low signal; a take never sets one, because the
        // person taking the last one is the one who taps it.
        ...(kind === "RECEIPT"
          ? { signal: "OK" as VenueStockSignal, signalAt: null, signalBy: null }
          : {}),
      },
    }),
  ])
  revalidatePath("/kitchen/stock")
  revalidatePath("/venue-ops/stock")
}

export interface ReorderLine {
  itemId: string
  name: string
  area: string
  unit: string | null
  tracking: VenueStockTracking
  onHand: number | null
  parLevel: number | null
  signal: VenueStockSignal
  flaggedBy: string | null
}

/** Georgia's ordering screen. The only output that matters. */
export async function getBelowPar(venue: Venue): Promise<ReorderLine[]> {
  const items = await db.venueStockItem.findMany({
    where: { isActive: true, area: { venue, isActive: true } },
    include: { area: { select: { name: true, sortOrder: true } } },
    orderBy: [{ area: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  })

  return items
    .filter((i) => isBelowPar(i))
    .map((i) => ({
      itemId: i.id,
      name: i.name,
      area: i.area.name,
      unit: i.unit,
      tracking: i.tracking,
      onHand: n(i.onHand),
      parLevel: n(i.parLevel),
      signal: i.signal,
      flaggedBy: i.signalBy,
    }))
}
