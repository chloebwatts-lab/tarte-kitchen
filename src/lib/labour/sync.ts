import { db } from "@/lib/db"
import { startOfTarteWeekUtc } from "@/lib/dates"
import { labourSource, type LabourSource } from "@/lib/labour/source"
import {
  fetchShiftsLabour,
  labourRowsFromFeed,
  ShiftsFeedError,
  type LabourRowInput,
} from "@/lib/shifts/labour"
import type { Venue } from "@/generated/prisma/client"

/**
 * One entry point for "refresh LabourShift from wherever labour lives now".
 * Called by the 15-minute cron (/api/cron/sync-deputy, kept under its old
 * name so the compose crontab needs no change, plus /api/cron/sync-shifts-
 * labour) and by the Refresh button on /labour.
 *
 * LABOUR_SOURCE=shifts  -> Tarte Shifts feed. If the feed is missing (404,
 *                          the endpoint is not built yet) or down, and a
 *                          Deputy connection still exists, Deputy is synced
 *                          instead and the result says so. With no Deputy
 *                          either, the last synced rows are left as they are.
 * anything else         -> Deputy, exactly as before.
 */

const AEST_MS = 10 * 3600_000
export const ROSTER_WEEKS_AHEAD = 3 // current week + 3 = the GM desk's horizon
export const LAST_SHIFTS_SYNC_KEY = "labourShiftsLastSyncedAt"

export interface LabourSyncResult {
  source: LabourSource
  /** Set when LABOUR_SOURCE=shifts but Deputy had to be used. */
  fellBackToDeputy?: boolean
  /** Why the Shifts feed could not be used (when it could not). */
  shiftsError?: string
  /** True when the Shifts endpoint does not exist yet. */
  needsShifts?: boolean
  roster: { upserted: number; skipped: number; total: number; windowStart: string; windowEnd: string }
  timesheets: { upserted: number; skipped: number; total: number; windowStart: string }
  forecastsWritten?: number
}

/** Roster window: Wed 00:00 AEST of this week to the same instant 4 weeks on. */
export function shiftsRosterWindow(now = new Date()): { start: Date; end: Date; weeks: Date[] } {
  const start = new Date(startOfTarteWeekUtc(now).getTime() - AEST_MS)
  const weeks: Date[] = []
  for (let i = 0; i <= ROSTER_WEEKS_AHEAD; i++) weeks.push(new Date(start.getTime() + i * 7 * 86400_000))
  const end = new Date(start.getTime() + (ROSTER_WEEKS_AHEAD + 1) * 7 * 86400_000)
  return { start, end, weeks }
}

/** Timesheet window: from Wed 00:00 AEST of LAST week (late approvals re-sync). */
export function shiftsTimesheetWindowStart(now = new Date()): Date {
  return new Date(startOfTarteWeekUtc(now).getTime() - AEST_MS - 7 * 86400_000)
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export async function syncLabourFromShifts(now = new Date()): Promise<LabourSyncResult> {
  const { start: rosterStart, end: rosterEnd, weeks } = shiftsRosterWindow(now)
  const tsStart = shiftsTimesheetWindowStart(now)

  // Fetch first; only touch the table once the feed answered properly.
  const feed = await fetchShiftsLabour(tsStart, rosterEnd)
  const mapped = labourRowsFromFeed(feed, weeks, now)

  // Same idempotency the Deputy sync used: the window is replaced wholesale
  // so edits, deletions and late approvals are picked up. Rows older than
  // the windows (history the digest recode reads) are never touched.
  const rosterRows = mapped.roster.filter((r) => r.shiftStart >= rosterStart && r.shiftStart < rosterEnd)
  const tsRows = mapped.timesheets.filter((r) => r.shiftStart >= tsStart)

  await db.$transaction(async (tx) => {
    await tx.labourShift.deleteMany({ where: { source: "ROSTER", shiftStart: { gte: rosterStart, lt: rosterEnd } } })
    if (rosterRows.length) await tx.labourShift.createMany({ data: rosterRows, skipDuplicates: true })
    await tx.labourShift.deleteMany({ where: { source: "TIMESHEET", shiftStart: { gte: tsStart } } })
    if (tsRows.length) await tx.labourShift.createMany({ data: tsRows, skipDuplicates: true })
  })

  // Manager forecasts (ex GST) feed the live week's labour % denominator.
  // A number typed into Kitchen (MANUAL) always wins.
  let forecastsWritten = 0
  for (const f of mapped.forecasts) {
    const existing = await db.managerSalesForecast.findUnique({
      where: { venue_weekStartWed: { venue: f.venue as Venue, weekStartWed: f.weekStartWed } },
    })
    if (existing?.source === "MANUAL") continue
    await db.managerSalesForecast.upsert({
      where: { venue_weekStartWed: { venue: f.venue as Venue, weekStartWed: f.weekStartWed } },
      create: { venue: f.venue as Venue, weekStartWed: f.weekStartWed, amount: f.amount, source: "SHIFTS" },
      update: { amount: f.amount, source: "SHIFTS" },
    })
    forecastsWritten++
  }

  await db.appSetting.upsert({
    where: { key: LAST_SHIFTS_SYNC_KEY },
    create: { key: LAST_SHIFTS_SYNC_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  })

  return {
    source: "shifts",
    roster: {
      upserted: rosterRows.length,
      skipped: mapped.skipped + (mapped.roster.length - rosterRows.length),
      total: feed.shifts.length,
      windowStart: day(rosterStart),
      windowEnd: day(rosterEnd),
    },
    timesheets: {
      upserted: tsRows.length,
      skipped: mapped.timesheets.length - tsRows.length,
      total: feed.timesheets.length,
      windowStart: day(tsStart),
    },
    forecastsWritten,
  }
}

async function syncLabourFromDeputy(): Promise<LabourSyncResult> {
  const { syncDeputyAll } = await import("@/lib/deputy/client")
  const r = await syncDeputyAll()
  return {
    source: "deputy",
    roster: r.roster,
    timesheets: r.timesheets,
    forecastsWritten: r.roster.forecastsWritten,
  }
}

export async function syncLabour(now = new Date()): Promise<LabourSyncResult> {
  if (labourSource() !== "shifts") return syncLabourFromDeputy()
  try {
    return await syncLabourFromShifts(now)
  } catch (e) {
    const err = e instanceof ShiftsFeedError ? e : new ShiftsFeedError((e as Error).message, 0)
    console.error("[labour-sync] Tarte Shifts feed failed:", err.message)
    const deputy = await db.deputyConnection.findFirst({ select: { id: true } })
    if (!deputy) throw err
    const r = await syncLabourFromDeputy()
    return { ...r, fellBackToDeputy: true, shiftsError: err.message, needsShifts: err.missingEndpoint }
  }
}

/** When LabourShift was last refreshed, whichever source did it. */
export async function labourLastSyncedAt(): Promise<string | null> {
  if (labourSource() === "shifts") {
    const row = await db.appSetting.findUnique({ where: { key: LAST_SHIFTS_SYNC_KEY } })
    if (row?.value) return row.value
  }
  const c = await db.deputyConnection.findFirst({ select: { lastSyncedAt: true } })
  return c?.lastSyncedAt?.toISOString() ?? null
}

export type { LabourRowInput }
