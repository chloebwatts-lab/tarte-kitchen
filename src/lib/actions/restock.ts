"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  KitchenStation,
  RestockSheetStatus,
  Venue,
} from "@/generated/prisma"
import { stationsForVenue } from "@/lib/stations"

// ------------------------------------------------------------------
// The head chef's paper system, digitised:
//   1. Closing chef counts every prep item at their station and flags
//      what's needed (RestockSheet + RestockLine, status IN_PROGRESS →
//      SUBMITTED).
//   2. Next morning the prep chef opens ONE consolidated run across all
//      submitted stations, makes/delivers the items, logs supplied
//      quantities (→ RESTOCKED).
//   3. The daily prep stock report reads straight off the same rows —
//      counted vs requested vs supplied, with shortfalls highlighted.
// ------------------------------------------------------------------

export interface CountSheetLine {
  itemId: string
  name: string
  unit: string | null
  category: string
  parLevel: number | null
  itemNotes: string | null
  available: number | null
  requested: number | null
  priority: boolean
  /// 1 = make first. Assigned in tap order on the count sheet.
  priorityRank: number | null
  note: string | null
}

export interface CountSheet {
  sheetId: string
  venue: Venue
  station: KitchenStation
  sheetDate: string
  status: RestockSheetStatus
  countedBy: string | null
  submittedAt: string | null
  lines: CountSheetLine[]
}

export interface RunStationLine {
  lineId: string
  sheetId: string
  station: KitchenStation
  available: number | null
  requested: number
  supplied: number | null
  suppliedBy: string | null
  note: string | null
  countedBy: string | null
}

export interface RunItem {
  name: string
  unit: string | null
  category: string
  priority: boolean
  /// Lowest rank across stations; null if starred without a rank.
  priorityRank: number | null
  totalRequested: number
  totalSupplied: number
  stations: RunStationLine[]
}

export interface RestockRun {
  venue: Venue
  sheets: {
    sheetId: string
    station: KitchenStation
    sheetDate: string
    countedBy: string | null
    submittedAt: string | null
    /// False when the closing chef never tapped "Send" — the count is
    /// auto-included so a forgotten tap can't lose a night's work.
    sent: boolean
    lineCount: number
  }[]
  items: RunItem[]
}

export interface RestockHub {
  venue: Venue
  stations: {
    station: KitchenStation
    todaySheet: {
      sheetId: string
      status: RestockSheetStatus
      countedLines: number
      requestedLines: number
      countedBy: string | null
    } | null
  }[]
  pendingRunSheets: number
  lastRestock: { restockedBy: string | null; restockedAt: string } | null
}

function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

const num = (v: unknown): number | null =>
  v == null ? null : Number(v)

// ------------------------------------------------------------------
// Hub
// ------------------------------------------------------------------

export async function getRestockHub(venue: Venue): Promise<RestockHub> {
  const stations = stationsForVenue(venue)
  const today = todayAest()

  const staleCutoff = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
  const [sheets, pending, lastRestocked] = await Promise.all([
    db.restockSheet.findMany({
      where: { venue, sheetDate: today },
      include: { lines: { select: { available: true, requested: true } } },
    }),
    // Same rule as the run itself: sent counts, plus unsent ones with data
    db.restockSheet.count({
      where: {
        venue,
        sheetDate: { gte: staleCutoff },
        OR: [
          { status: "SUBMITTED" },
          {
            status: "IN_PROGRESS",
            lines: {
              some: {
                OR: [{ available: { not: null } }, { requested: { not: null } }],
              },
            },
          },
        ],
      },
    }),
    db.restockSheet.findFirst({
      where: { venue, status: "RESTOCKED" },
      orderBy: { restockedAt: "desc" },
      select: { restockedBy: true, restockedAt: true },
    }),
  ])

  return {
    venue,
    stations: stations.map((station) => {
      const sheet = sheets.find((s) => s.station === station)
      return {
        station,
        todaySheet: sheet
          ? {
              sheetId: sheet.id,
              status: sheet.status,
              countedLines: sheet.lines.filter((l) => l.available != null)
                .length,
              requestedLines: sheet.lines.filter(
                (l) => l.requested != null && Number(l.requested) > 0
              ).length,
              countedBy: sheet.countedBy,
            }
          : null,
      }
    }),
    pendingRunSheets: pending,
    lastRestock: lastRestocked?.restockedAt
      ? {
          restockedBy: lastRestocked.restockedBy,
          restockedAt: lastRestocked.restockedAt.toISOString(),
        }
      : null,
  }
}

// ------------------------------------------------------------------
// Closing chef: count sheet
// ------------------------------------------------------------------

export async function getCountSheet(params: {
  venue: Venue
  station: KitchenStation
}): Promise<CountSheet> {
  const { venue, station } = params
  const today = todayAest()

  let sheet = await db.restockSheet.findUnique({
    where: {
      venue_station_sheetDate: { venue, station, sheetDate: today },
    },
    include: { lines: true },
  })
  if (!sheet) {
    // Concurrent first-open from two devices can race the create; the
    // unique constraint makes the loser retry-read.
    try {
      sheet = await db.restockSheet.create({
        data: { venue, station, sheetDate: today },
        include: { lines: true },
      })
    } catch {
      sheet = await db.restockSheet.findUniqueOrThrow({
        where: {
          venue_station_sheetDate: { venue, station, sheetDate: today },
        },
        include: { lines: true },
      })
    }
  }

  const items = await db.prepStockItem.findMany({
    where: { venue, station, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  // "Station restock" leads (that's the paper sheet the chefs know);
  // other categories follow alphabetically.
  items.sort((a, b) => {
    const rank = (c: string) => (c === "Station restock" ? 0 : 1)
    return (
      rank(a.category) - rank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name)
    )
  })
  const lineByItem = new Map(sheet.lines.map((l) => [l.itemId, l]))

  return {
    sheetId: sheet.id,
    venue,
    station,
    sheetDate: ymd(sheet.sheetDate),
    status: sheet.status,
    countedBy: sheet.countedBy,
    submittedAt: sheet.submittedAt?.toISOString() ?? null,
    lines: items.map((item) => {
      const line = lineByItem.get(item.id)
      return {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        parLevel: num(item.parLevel),
        itemNotes: item.notes,
        available: num(line?.available),
        requested: num(line?.requested),
        priority: line?.priority ?? false,
        priorityRank: line?.priorityRank ?? null,
        note: line?.note ?? null,
      }
    }),
  }
}

export async function saveCountLine(params: {
  sheetId: string
  itemId: string
  available?: number | null
  requested?: number | null
  priority?: boolean
  priorityRank?: number | null
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const sheet = await db.restockSheet.findUnique({
    where: { id: params.sheetId },
    select: { status: true },
  })
  if (!sheet) return { ok: false, error: "Sheet not found" }
  if (sheet.status === "RESTOCKED")
    return { ok: false, error: "This sheet has already been restocked" }

  const patch: {
    available?: number | null
    requested?: number | null
    priority?: boolean
    priorityRank?: number | null
    note?: string | null
  } = {}
  if ("available" in params) patch.available = params.available
  if ("requested" in params) patch.requested = params.requested
  if (params.priority !== undefined) patch.priority = params.priority
  if ("priorityRank" in params) {
    patch.priorityRank = params.priorityRank
    // Rank is the source of truth — keep the flag in sync so older
    // consumers (report chips etc.) stay correct.
    patch.priority = params.priorityRank != null
  }
  if ("note" in params) patch.note = params.note

  await db.restockLine.upsert({
    where: {
      sheetId_itemId: { sheetId: params.sheetId, itemId: params.itemId },
    },
    create: {
      sheetId: params.sheetId,
      itemId: params.itemId,
      available: params.available ?? null,
      requested: params.requested ?? null,
      priority: params.priorityRank != null || (params.priority ?? false),
      priorityRank: params.priorityRank ?? null,
      note: params.note ?? null,
    },
    update: patch,
  })
  return { ok: true }
}

export async function submitCountSheet(params: {
  sheetId: string
  countedBy: string
  notes?: string
}): Promise<{ ok: boolean; error?: string }> {
  const countedBy = params.countedBy.trim()
  if (!countedBy) return { ok: false, error: "Add your name before sending" }

  const sheet = await db.restockSheet.findUnique({
    where: { id: params.sheetId },
    select: { status: true },
  })
  if (!sheet) return { ok: false, error: "Sheet not found" }
  if (sheet.status === "RESTOCKED")
    return { ok: false, error: "This sheet has already been restocked" }

  await db.restockSheet.update({
    where: { id: params.sheetId },
    data: {
      status: "SUBMITTED",
      countedBy,
      submittedAt: new Date(),
      notes: params.notes?.trim() || null,
    },
  })
  revalidatePath("/kitchen/restock")
  return { ok: true }
}

export async function reopenCountSheet(
  sheetId: string
): Promise<{ ok: boolean; error?: string }> {
  const sheet = await db.restockSheet.findUnique({
    where: { id: sheetId },
    select: { status: true },
  })
  if (!sheet) return { ok: false, error: "Sheet not found" }
  if (sheet.status === "RESTOCKED")
    return { ok: false, error: "Already restocked — start tonight's count instead" }

  await db.restockSheet.update({
    where: { id: sheetId },
    data: { status: "IN_PROGRESS" },
  })
  revalidatePath("/kitchen/restock")
  return { ok: true }
}

/**
 * Kiosk equivalent of the blank rows at the bottom of the paper sheet —
 * a chef can add a missing item without waiting for a manager.
 */
export async function addCatalogItem(params: {
  venue: Venue
  station: KitchenStation
  name: string
  category?: string
}): Promise<{ ok: boolean; itemId?: string; error?: string }> {
  const name = params.name.trim()
  if (!name) return { ok: false, error: "Item needs a name" }

  const existing = await db.prepStockItem.findUnique({
    where: {
      venue_station_name: {
        venue: params.venue,
        station: params.station,
        name,
      },
    },
  })
  if (existing) {
    if (!existing.isActive) {
      await db.prepStockItem.update({
        where: { id: existing.id },
        data: { isActive: true },
      })
    }
    return { ok: true, itemId: existing.id }
  }

  const maxSort = await db.prepStockItem.aggregate({
    where: { venue: params.venue, station: params.station },
    _max: { sortOrder: true },
  })
  const item = await db.prepStockItem.create({
    data: {
      venue: params.venue,
      station: params.station,
      name,
      category: params.category ?? "Station restock",
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  })
  revalidatePath("/kitchen/restock")
  return { ok: true, itemId: item.id }
}

// ------------------------------------------------------------------
// Prep chef: consolidated morning run
// ------------------------------------------------------------------

/**
 * Every count waiting for the venue, consolidated by item name so the prep
 * chef makes each thing ONCE and splits it across stations. Includes both
 * SUBMITTED sheets and unsent IN_PROGRESS sheets that contain real entries
 * — a closing chef forgetting to tap "Send" must never lose the count.
 * Sheets older than 3 days are ignored as stale.
 */
export async function getRestockRun(venue: Venue): Promise<RestockRun> {
  const staleCutoff = new Date(todayAest().getTime() - 3 * 24 * 60 * 60 * 1000)
  const hasData = {
    lines: {
      some: {
        OR: [{ available: { not: null } }, { requested: { not: null } }],
      },
    },
  }
  const sheets = await db.restockSheet.findMany({
    where: {
      venue,
      sheetDate: { gte: staleCutoff },
      OR: [
        { status: "SUBMITTED" },
        { status: "IN_PROGRESS", ...hasData },
      ],
    },
    include: { lines: { include: { item: true } } },
    orderBy: { station: "asc" },
  })

  const itemsByKey = new Map<string, RunItem>()
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      const requested = num(line.requested)
      if (!requested || requested <= 0) continue
      const key = line.item.name.toLowerCase().trim()
      const entry = itemsByKey.get(key) ?? {
        name: line.item.name,
        unit: line.item.unit,
        category: line.item.category,
        priority: false,
        priorityRank: null,
        totalRequested: 0,
        totalSupplied: 0,
        stations: [],
      }
      entry.priority = entry.priority || line.priority
      if (line.priorityRank != null) {
        entry.priorityRank =
          entry.priorityRank == null
            ? line.priorityRank
            : Math.min(entry.priorityRank, line.priorityRank)
      }
      entry.totalRequested += requested
      entry.totalSupplied += num(line.supplied) ?? 0
      entry.stations.push({
        lineId: line.id,
        sheetId: sheet.id,
        station: sheet.station,
        available: num(line.available),
        requested,
        supplied: num(line.supplied),
        suppliedBy: line.suppliedBy,
        note: line.note,
        countedBy: sheet.countedBy,
      })
      itemsByKey.set(key, entry)
    }
  }

  const catRank = (c: string) => (c === "Station restock" ? 0 : 1)
  const items = Array.from(itemsByKey.values()).sort(
    (a, b) =>
      Number(b.priority) - Number(a.priority) ||
      // Within priority items: Jose's rank order, unranked stars last
      (a.priorityRank ?? 99) - (b.priorityRank ?? 99) ||
      catRank(a.category) - catRank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name)
  )

  return {
    venue,
    sheets: sheets.map((s) => ({
      sheetId: s.id,
      station: s.station,
      sheetDate: ymd(s.sheetDate),
      countedBy: s.countedBy,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      sent: s.status === "SUBMITTED",
      lineCount: s.lines.filter((l) => (num(l.requested) ?? 0) > 0).length,
    })),
    items,
  }
}

export async function supplyRunLine(params: {
  lineId: string
  supplied: number | null
  suppliedBy: string
}): Promise<{ ok: boolean; error?: string }> {
  const suppliedBy = params.suppliedBy.trim()
  await db.restockLine.update({
    where: { id: params.lineId },
    data: {
      supplied: params.supplied,
      suppliedBy: params.supplied == null ? null : suppliedBy || null,
      suppliedAt: params.supplied == null ? null : new Date(),
    },
  })
  return { ok: true }
}

/**
 * Close out the morning run: every sheet that was part of it flips to
 * RESTOCKED — including unsent IN_PROGRESS counts that carried entries,
 * mirroring what getRestockRun showed. Requested lines left without a
 * supplied quantity stay null — they surface as shortfalls on the daily
 * report rather than being silently marked as done.
 */
export async function completeRestockRun(params: {
  venue: Venue
  restockedBy: string
}): Promise<{ ok: boolean; error?: string }> {
  const restockedBy = params.restockedBy.trim()
  if (!restockedBy) return { ok: false, error: "Add your name to finish" }

  const staleCutoff = new Date(todayAest().getTime() - 3 * 24 * 60 * 60 * 1000)
  const updated = await db.restockSheet.updateMany({
    where: {
      venue: params.venue,
      sheetDate: { gte: staleCutoff },
      OR: [
        { status: "SUBMITTED" },
        {
          status: "IN_PROGRESS",
          lines: {
            some: {
              OR: [{ available: { not: null } }, { requested: { not: null } }],
            },
          },
        },
      ],
    },
    data: {
      status: "RESTOCKED",
      restockedBy,
      restockedAt: new Date(),
    },
  })
  if (updated.count === 0)
    return { ok: false, error: "Nothing to complete — no counts waiting" }
  revalidatePath("/kitchen/restock")
  return { ok: true }
}

// ------------------------------------------------------------------
// Daily prep stock report
// ------------------------------------------------------------------

export interface ReportSheet {
  sheetId: string
  station: KitchenStation
  status: RestockSheetStatus
  countedBy: string | null
  submittedAt: string | null
  restockedBy: string | null
  restockedAt: string | null
  notes: string | null
  lines: {
    name: string
    unit: string | null
    category: string
    available: number | null
    requested: number | null
    supplied: number | null
    priority: boolean
    priorityRank: number | null
    note: string | null
  }[]
}

export interface RestockReport {
  venue: Venue
  date: string
  sheets: ReportSheet[]
  missingStations: KitchenStation[]
  totals: {
    itemsCounted: number
    itemsRequested: number
    itemsSupplied: number
    shortfalls: { name: string; station: KitchenStation; requested: number; supplied: number | null }[]
  }
}

export async function getRestockReport(params: {
  venue: Venue
  date?: string // ISO yyyy-mm-dd, defaults to today AEST
}): Promise<RestockReport> {
  const date = params.date ?? ymd(todayAest())
  const dateObj = new Date(date)

  const sheets = await db.restockSheet.findMany({
    where: { venue: params.venue, sheetDate: dateObj },
    include: {
      lines: {
        include: { item: true },
        orderBy: { item: { sortOrder: "asc" } },
      },
    },
    orderBy: { station: "asc" },
  })

  const reportSheets: ReportSheet[] = sheets.map((s) => ({
    sheetId: s.id,
    station: s.station,
    status: s.status,
    countedBy: s.countedBy,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    restockedBy: s.restockedBy,
    restockedAt: s.restockedAt?.toISOString() ?? null,
    notes: s.notes,
    lines: s.lines
      .filter((l) => l.available != null || (num(l.requested) ?? 0) > 0)
      .map((l) => ({
        name: l.item.name,
        unit: l.item.unit,
        category: l.item.category,
        available: num(l.available),
        requested: num(l.requested),
        supplied: num(l.supplied),
        priority: l.priority,
        priorityRank: l.priorityRank,
        note: l.note,
      })),
  }))

  const shortfalls: RestockReport["totals"]["shortfalls"] = []
  let itemsCounted = 0
  let itemsRequested = 0
  let itemsSupplied = 0
  for (const s of reportSheets) {
    for (const l of s.lines) {
      if (l.available != null) itemsCounted++
      if ((l.requested ?? 0) > 0) {
        itemsRequested++
        if (l.supplied != null && l.supplied >= l.requested!) {
          itemsSupplied++
        } else if (s.status === "RESTOCKED") {
          shortfalls.push({
            name: l.name,
            station: s.station,
            requested: l.requested!,
            supplied: l.supplied,
          })
        }
      }
    }
  }

  const present = new Set(sheets.map((s) => s.station))
  const missingStations = stationsForVenue(params.venue).filter(
    (st) => !present.has(st)
  )

  return {
    venue: params.venue,
    date,
    sheets: reportSheets,
    missingStations,
    totals: { itemsCounted, itemsRequested, itemsSupplied, shortfalls },
  }
}

// ------------------------------------------------------------------
// Admin: catalogue management
// ------------------------------------------------------------------

export interface CatalogItem {
  id: string
  venue: Venue
  station: KitchenStation
  name: string
  unit: string | null
  category: string
  parLevel: number | null
  sortOrder: number
  notes: string | null
  isActive: boolean
  preparationId: string | null
  preparationName: string | null
}

export async function listPrepStockItems(venue: Venue): Promise<CatalogItem[]> {
  const items = await db.prepStockItem.findMany({
    where: { venue },
    include: { preparation: { select: { name: true } } },
    orderBy: [
      { station: "asc" },
      { category: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  })
  return items.map((i) => ({
    id: i.id,
    venue: i.venue,
    station: i.station,
    name: i.name,
    unit: i.unit,
    category: i.category,
    parLevel: num(i.parLevel),
    sortOrder: i.sortOrder,
    notes: i.notes,
    isActive: i.isActive,
    preparationId: i.preparationId,
    preparationName: i.preparation?.name ?? null,
  }))
}

export async function upsertPrepStockItem(params: {
  id?: string
  venue: Venue
  station: KitchenStation
  name: string
  unit?: string | null
  category?: string
  parLevel?: number | null
  notes?: string | null
  preparationId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const name = params.name.trim()
  if (!name) return { ok: false, error: "Name is required" }

  const data = {
    venue: params.venue,
    station: params.station,
    name,
    unit: params.unit?.trim() || null,
    category: params.category?.trim() || "Station restock",
    parLevel: params.parLevel ?? null,
    notes: params.notes?.trim() || null,
    preparationId: params.preparationId || null,
  }
  try {
    if (params.id) {
      await db.prepStockItem.update({ where: { id: params.id }, data })
    } else {
      const maxSort = await db.prepStockItem.aggregate({
        where: { venue: params.venue, station: params.station },
        _max: { sortOrder: true },
      })
      await db.prepStockItem.create({
        data: { ...data, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Unique constraint"))
      return { ok: false, error: `"${name}" already exists at that station` }
    throw e
  }
  revalidatePath("/restock")
  revalidatePath("/kitchen/restock")
  return { ok: true }
}

export async function setPrepStockItemActive(params: {
  id: string
  isActive: boolean
}): Promise<{ ok: boolean }> {
  await db.prepStockItem.update({
    where: { id: params.id },
    data: { isActive: params.isActive },
  })
  revalidatePath("/restock")
  revalidatePath("/kitchen/restock")
  return { ok: true }
}
