"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Prisma, Venue, VenueStockTracking } from "@/generated/prisma/client"

// Setting up the stock walk: the areas in the order you walk them, and the
// items in each. Georgia's screen. Nobody else needs it, and the walk itself
// (/kitchen/stock) never shows any of this, only the taps.

const paths = ["/kitchen/stock", "/kitchen/managers/stock-setup", "/kitchen/managers/board", "/venue-ops"]
const bust = () => paths.forEach((p) => revalidatePath(p))

/**
 * Saves answer with ok/error rather than throwing: a thrown error reaches the
 * iPad with its message stripped in production, and "Shed" typed twice is a
 * unique-constraint hit that deserves a sentence, not an error page.
 */
export type SaveResult = { ok: true } | { ok: false; error: string }

const isDuplicate = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"

export interface SetupItem {
  id: string
  name: string
  unit: string | null
  tracking: VenueStockTracking
  parLevel: number | null
  isActive: boolean
}
export interface SetupArea {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  items: SetupItem[]
}

export async function getStockSetup(venue: Venue): Promise<SetupArea[]> {
  const areas = await db.venueStockArea.findMany({
    where: { venue },
    orderBy: { sortOrder: "asc" },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  })
  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    sortOrder: a.sortOrder,
    isActive: a.isActive,
    items: a.items.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      tracking: i.tracking,
      parLevel: i.parLevel === null ? null : Number(i.parLevel),
      isActive: i.isActive,
    })),
  }))
}

export async function addArea(venue: Venue, name: string): Promise<SaveResult> {
  const n = name.trim()
  if (!n) return { ok: false, error: "Give the area a name" }
  const last = await db.venueStockArea.findFirst({
    where: { venue },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  try {
    await db.venueStockArea.create({
      data: { venue, name: n, sortOrder: (last?.sortOrder ?? -1) + 1 },
    })
  } catch (err) {
    if (isDuplicate(err)) return { ok: false, error: `There is already an area called ${n} here` }
    throw err
  }
  bust()
  return { ok: true }
}

/** Swap with the neighbour above or below. Walk order is the whole point. */
export async function moveArea(id: string, direction: "up" | "down") {
  const a = await db.venueStockArea.findUnique({ where: { id } })
  if (!a) return
  const neighbour = await db.venueStockArea.findFirst({
    where: {
      venue: a.venue,
      sortOrder: direction === "up" ? { lt: a.sortOrder } : { gt: a.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  })
  if (!neighbour) return
  await db.$transaction([
    db.venueStockArea.update({ where: { id: a.id }, data: { sortOrder: neighbour.sortOrder } }),
    db.venueStockArea.update({ where: { id: neighbour.id }, data: { sortOrder: a.sortOrder } }),
  ])
  bust()
}

export async function setAreaActive(id: string, isActive: boolean) {
  await db.venueStockArea.update({ where: { id }, data: { isActive } })
  bust()
}

export interface ItemInput {
  name: string
  unit?: string
  tracking: VenueStockTracking
  parLevel?: number | null
}

function checkItem(input: ItemInput): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.name.trim()
  if (!name) return { ok: false, error: "Give the item a name" }
  if (input.tracking === "QUANTITY" && !(input.parLevel != null && input.parLevel >= 0)) {
    return { ok: false, error: "A counted item needs a par level" }
  }
  return { ok: true, name }
}

export async function addItem(areaId: string, input: ItemInput): Promise<SaveResult> {
  const checked = checkItem(input)
  if (!checked.ok) return checked
  const last = await db.venueStockItem.findFirst({
    where: { areaId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  try {
    await db.venueStockItem.create({
      data: {
        areaId,
        name: checked.name,
        unit: input.unit?.trim() || null,
        tracking: input.tracking,
        parLevel: input.tracking === "QUANTITY" ? input.parLevel : null,
        onHand: input.tracking === "QUANTITY" ? 0 : null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
  } catch (err) {
    if (isDuplicate(err)) return { ok: false, error: `${checked.name} is already in this area` }
    throw err
  }
  bust()
  return { ok: true }
}

export async function updateItem(id: string, input: ItemInput): Promise<SaveResult> {
  const checked = checkItem(input)
  if (!checked.ok) return checked
  try {
    await db.venueStockItem.update({
      where: { id },
      data: {
        name: checked.name,
        unit: input.unit?.trim() || null,
        tracking: input.tracking,
        parLevel: input.tracking === "QUANTITY" ? input.parLevel ?? null : null,
      },
    })
  } catch (err) {
    if (isDuplicate(err)) return { ok: false, error: `${checked.name} is already in this area` }
    throw err
  }
  bust()
  return { ok: true }
}

export async function setItemActive(id: string, isActive: boolean) {
  await db.venueStockItem.update({ where: { id }, data: { isActive } })
  bust()
}
