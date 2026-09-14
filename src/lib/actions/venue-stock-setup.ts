"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue, VenueStockTracking } from "@/generated/prisma/client"

// Setting up the stock walk: the areas in the order you walk them, and the
// items in each. Georgia's screen. Nobody else needs it, and the walk itself
// (/kitchen/stock) never shows any of this, only the taps.

const paths = ["/kitchen/stock", "/kitchen/managers/stock-setup", "/kitchen/managers/board"]
const bust = () => paths.forEach((p) => revalidatePath(p))

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

export async function addArea(venue: Venue, name: string) {
  const n = name.trim()
  if (!n) throw new Error("Give the area a name")
  const last = await db.venueStockArea.findFirst({
    where: { venue },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  await db.venueStockArea.create({
    data: { venue, name: n, sortOrder: (last?.sortOrder ?? -1) + 1 },
  })
  bust()
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

export async function addItem(areaId: string, input: ItemInput) {
  const n = input.name.trim()
  if (!n) throw new Error("Give the item a name")
  if (input.tracking === "QUANTITY" && !(input.parLevel != null && input.parLevel >= 0)) {
    throw new Error("A counted item needs a par level")
  }
  const last = await db.venueStockItem.findFirst({
    where: { areaId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  await db.venueStockItem.create({
    data: {
      areaId,
      name: n,
      unit: input.unit?.trim() || null,
      tracking: input.tracking,
      parLevel: input.tracking === "QUANTITY" ? input.parLevel : null,
      // Never counted yet, so null: a made-up zero would put a brand new item
      // straight on the order list before anyone has looked at the shelf.
      onHand: null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
  bust()
}

export async function updateItem(id: string, input: ItemInput) {
  const n = input.name.trim()
  if (!n) throw new Error("Give the item a name")
  await db.venueStockItem.update({
    where: { id },
    data: {
      name: n,
      unit: input.unit?.trim() || null,
      tracking: input.tracking,
      parLevel: input.tracking === "QUANTITY" ? input.parLevel ?? null : null,
    },
  })
  bust()
}

export async function setItemActive(id: string, isActive: boolean) {
  await db.venueStockItem.update({ where: { id }, data: { isActive } })
  bust()
}

// ------------------------------------------------------------------
// Starter list. A venue with no stock list shows staff a dead end, and
// the first version of any list is mostly the same across cafes: the
// non-food consumables that run out quietly. Seeded once, in walk order,
// then trimmed and renamed here like anything else.
// ------------------------------------------------------------------

type StarterItem = [name: string, tracking?: VenueStockTracking, unit?: string, par?: number]

const STARTER_LIST: { area: string; items: StarterItem[] }[] = [
  {
    area: "Front counter",
    items: [
      ["Till rolls", "QUANTITY", "box", 1],
      ["Napkins"],
      ["Paper bags"],
      ["Takeaway cutlery"],
      ["Straws"],
    ],
  },
  {
    area: "Coffee & bar",
    items: [
      ["Takeaway cups", "QUANTITY", "sleeve", 4],
      ["Takeaway lids", "QUANTITY", "sleeve", 4],
      ["Sugar sachets"],
      ["Tea bags"],
      ["Glass cleaner"],
      ["Bar cloths"],
    ],
  },
  {
    area: "Kitchen",
    items: [
      ["Crockery"],
      ["Cutlery"],
      ["Glassware"],
      ["Jar lids"],
      ["Takeaway containers"],
      ["Cling wrap"],
      ["Baking paper"],
      ["Gloves"],
      ["Tea towels"],
    ],
  },
  {
    area: "Cleaning cupboard",
    items: [
      ["Bin liners", "QUANTITY", "roll", 2],
      ["Paper towel"],
      ["Hand soap"],
      ["Sanitiser"],
      ["Dishwasher detergent"],
      ["Toilet paper"],
    ],
  },
]

/**
 * Give a venue with nothing set up a sensible first list. Refuses to run
 * over an existing list (even a hidden one), so it can never duplicate or
 * reorder what a manager has already arranged.
 */
export async function seedStarterStockList(venue: Venue): Promise<{ areas: number; items: number }> {
  const existing = await db.venueStockArea.count({ where: { venue } })
  if (existing > 0) throw new Error("This venue already has a stock list")

  let items = 0
  await db.$transaction(async (tx) => {
    for (const [areaIdx, a] of STARTER_LIST.entries()) {
      await tx.venueStockArea.create({
        data: {
          venue,
          name: a.area,
          sortOrder: areaIdx,
          items: {
            create: a.items.map(([name, tracking = "SIGNAL", unit, par], i) => ({
              name,
              unit: unit ?? null,
              tracking,
              parLevel: tracking === "QUANTITY" ? par ?? 0 : null,
              // Null until somebody counts it. See addItem.
              onHand: null,
              sortOrder: i,
            })),
          },
        },
      })
      items += a.items.length
    }
  })
  bust()
  return { areas: STARTER_LIST.length, items }
}
