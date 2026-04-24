"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"

export interface CoolingLogRecord {
  id: string
  venue: Venue
  itemName: string
  batchSize: string | null
  startedAt: string
  startTempC: number | null
  twoHourTempC: number | null
  twoHourAt: string | null
  sixHourTempC: number | null
  sixHourAt: string | null
  fridgeTempC: number | null
  staffInitials: string
  notes: string | null
  status: "IN_PROGRESS" | "COMPLETE" | "OVERDUE"
}

const TWO_HOUR_MS = 2 * 60 * 60 * 1000
const SIX_HOUR_MS = 6 * 60 * 60 * 1000

function computeStatus(row: {
  startedAt: Date
  twoHourTempC: unknown
  sixHourTempC: unknown
}): CoolingLogRecord["status"] {
  if (row.sixHourTempC !== null) return "COMPLETE"
  const elapsed = Date.now() - row.startedAt.getTime()
  if (elapsed > SIX_HOUR_MS) return "OVERDUE"
  if (elapsed > TWO_HOUR_MS && row.twoHourTempC === null) return "OVERDUE"
  return "IN_PROGRESS"
}

function toRecord(row: {
  id: string
  venue: Venue
  itemName: string
  batchSize: string | null
  startedAt: Date
  startTempC: unknown
  twoHourTempC: unknown
  twoHourAt: Date | null
  sixHourTempC: unknown
  sixHourAt: Date | null
  fridgeTempC: unknown
  staffInitials: string
  notes: string | null
}): CoolingLogRecord {
  return {
    id: row.id,
    venue: row.venue,
    itemName: row.itemName,
    batchSize: row.batchSize,
    startedAt: row.startedAt.toISOString(),
    startTempC: row.startTempC === null ? null : Number(row.startTempC),
    twoHourTempC: row.twoHourTempC === null ? null : Number(row.twoHourTempC),
    twoHourAt: row.twoHourAt?.toISOString() ?? null,
    sixHourTempC: row.sixHourTempC === null ? null : Number(row.sixHourTempC),
    sixHourAt: row.sixHourAt?.toISOString() ?? null,
    fridgeTempC: row.fridgeTempC === null ? null : Number(row.fridgeTempC),
    staffInitials: row.staffInitials,
    notes: row.notes,
    status: computeStatus(row),
  }
}

/**
 * Create a cooling log entry. Used both for "starting cooling now" and for
 * back-dating a forgotten earlier batch — the difference is whether
 * `startedAt` is the default (now) or supplied by the form.
 */
export async function createCoolingLog(params: {
  venue: Venue
  itemName: string
  batchSize?: string | null
  staffInitials: string
  startedAt?: Date | null
  startTempC?: number | null
  twoHourTempC?: number | null
  twoHourAt?: Date | null
  sixHourTempC?: number | null
  sixHourAt?: Date | null
  fridgeTempC?: number | null
  notes?: string | null
}) {
  if (!params.itemName.trim()) throw new Error("Item name is required")
  if (!params.staffInitials.trim()) throw new Error("Name is required")
  const row = await db.coolingLog.create({
    data: {
      venue: params.venue,
      itemName: params.itemName.trim(),
      batchSize: params.batchSize?.trim() || null,
      staffInitials: params.staffInitials.trim(),
      startedAt: params.startedAt ?? new Date(),
      startTempC: params.startTempC ?? null,
      twoHourTempC: params.twoHourTempC ?? null,
      twoHourAt: params.twoHourAt ?? null,
      sixHourTempC: params.sixHourTempC ?? null,
      sixHourAt: params.sixHourAt ?? null,
      fridgeTempC: params.fridgeTempC ?? null,
      notes: params.notes?.trim() || null,
    },
  })
  revalidatePath("/kitchen/cooling")
  revalidatePath("/kitchen/inspection")
  return row.id
}

/**
 * Record one of the temperature checkpoints on an in-progress log.
 * `at` defaults to now but can be supplied for back-dating.
 */
export async function recordCoolingCheckpoint(params: {
  id: string
  checkpoint: "TWO_HOUR" | "SIX_HOUR"
  tempC: number
  at?: Date | null
  fridgeTempC?: number | null
  notes?: string | null
}) {
  const at = params.at ?? new Date()
  const data: Record<string, unknown> = {}
  if (params.checkpoint === "TWO_HOUR") {
    data.twoHourTempC = params.tempC
    data.twoHourAt = at
  } else {
    data.sixHourTempC = params.tempC
    data.sixHourAt = at
  }
  if (params.fridgeTempC !== undefined && params.fridgeTempC !== null) {
    data.fridgeTempC = params.fridgeTempC
  }
  if (params.notes !== undefined && params.notes !== null) {
    const trimmed = params.notes.trim()
    if (trimmed) data.notes = trimmed
  }
  await db.coolingLog.update({ where: { id: params.id }, data })
  revalidatePath("/kitchen/cooling")
  revalidatePath("/kitchen/inspection")
}

export async function deleteCoolingLog(id: string) {
  await db.coolingLog.delete({ where: { id } })
  revalidatePath("/kitchen/cooling")
  revalidatePath("/kitchen/inspection")
}

/**
 * In-progress + recently-completed logs for a venue. Returns last 24h of
 * activity, in-progress first.
 */
export async function listActiveCoolingLogs(venue: Venue): Promise<CoolingLogRecord[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const rows = await db.coolingLog.findMany({
    where: { venue, startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
  })
  return rows.map(toRecord)
}

/**
 * Inspection view: every log within the supplied window (defaults 30d back).
 */
export async function listCoolingLogsForInspection(params: {
  venue?: Venue | "ALL"
  fromDate?: Date
  toDate?: Date
}): Promise<CoolingLogRecord[]> {
  const from = params.fromDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = params.toDate ?? new Date()
  const where: Record<string, unknown> = { startedAt: { gte: from, lte: to } }
  if (params.venue && params.venue !== "ALL") where.venue = params.venue
  const rows = await db.coolingLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
  })
  return rows.map(toRecord)
}
