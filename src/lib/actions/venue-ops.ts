"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  Venue,
  VenueTaskCategory,
  VenueTaskPriority,
  VenueTaskStatus,
} from "@/generated/prisma/client"

// ------------------------------------------------------------------
// The venue ops board. Georgia is currently the only person who
// notices the shop's small problems, so the list of what to notice
// lives in her head and nothing gets seen when she is not there.
//
//   1. Anyone on shift reports something in a few seconds (reportTask).
//   2. Recurring compliance jobs raise themselves before they fall due
//      (raiseDueSchedules), already pointed at their real owner.
//   3. The morning check is READ, not remembered (getMorningBoard),
//      and its first job is to put an owner on anything unowned.
//
// The whole point is that work leaves the person reading the board.
// Anything here that quietly routes back to them is a bug.
// ------------------------------------------------------------------

/** Priority as it should be acted on: Georgia's override wins where set. */
function effectivePriority(t: {
  reportedPriority: VenueTaskPriority
  priorityOverride: VenueTaskPriority | null
}): VenueTaskPriority {
  return t.priorityOverride ?? t.reportedPriority
}

const PRIORITY_RANK: Record<VenueTaskPriority, number> = {
  URGENT: 0,
  NORMAL: 1,
  WHENEVER: 2,
}

export interface BoardTask {
  id: string
  category: VenueTaskCategory
  title: string
  detail: string | null
  priority: VenueTaskPriority
  /// True when Georgia has overridden what the reporter chose. Shown so a
  /// pattern of everything-is-urgent stays visible rather than being erased.
  priorityChanged: boolean
  status: VenueTaskStatus
  reportedBy: string | null
  ownedBy: string | null
  dueAt: string | null
  ageDays: number
  maintenanceIssueId: string | null
  stockItemId: string | null
  createdAt: string
}

export interface MorningBoard {
  venue: Venue
  /// Nothing has an owner yet. Triaging these IS the morning job.
  unassigned: BoardTask[]
  /// Assigned to somebody else and still open — chase, do not do.
  waitingOn: BoardTask[]
  /// Assigned to whoever is reading.
  mine: BoardTask[]
  /// Open more than a week. Surfaced separately so neglect shows itself
  /// instead of relying on somebody remembering.
  stale: BoardTask[]
  doneToday: number
}

function toBoardTask(t: {
  id: string
  category: VenueTaskCategory
  title: string
  detail: string | null
  reportedPriority: VenueTaskPriority
  priorityOverride: VenueTaskPriority | null
  status: VenueTaskStatus
  reportedBy: string | null
  ownedBy: string | null
  dueAt: Date | null
  maintenanceIssueId: string | null
  stockItemId: string | null
  createdAt: Date
}): BoardTask {
  const ageDays = Math.floor(
    (Date.now() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  return {
    id: t.id,
    category: t.category,
    title: t.title,
    detail: t.detail,
    priority: effectivePriority(t),
    priorityChanged: t.priorityOverride !== null,
    status: t.status,
    reportedBy: t.reportedBy,
    ownedBy: t.ownedBy,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    ageDays,
    maintenanceIssueId: t.maintenanceIssueId,
    stockItemId: t.stockItemId,
    createdAt: t.createdAt.toISOString(),
  }
}

const STALE_AFTER_DAYS = 7

/**
 * The morning list. `viewer` decides what counts as "mine" versus "waiting
 * on someone" — the same board reads differently for Georgia and a supervisor.
 */
export async function getMorningBoard(
  venue: Venue,
  viewer: string
): Promise<MorningBoard> {
  // Recurring compliance work raises itself first, so opening the board is
  // enough to see something that falls due next week.
  await raiseDueSchedules(venue)

  const rows = await db.venueTask.findMany({
    where: { venue, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "asc" },
  })

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const doneToday = await db.venueTask.count({
    where: { venue, status: "DONE", doneAt: { gte: startOfDay } },
  })

  const tasks = rows.map(toBoardTask)
  const bySeverity = (a: BoardTask, b: BoardTask) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    b.ageDays - a.ageDays

  const norm = (s: string | null) => (s ?? "").trim().toLowerCase()
  const me = norm(viewer)

  const stale = tasks
    .filter((t) => t.ageDays >= STALE_AFTER_DAYS)
    .sort(bySeverity)
  const fresh = tasks.filter((t) => t.ageDays < STALE_AFTER_DAYS)

  return {
    venue,
    unassigned: fresh.filter((t) => !t.ownedBy).sort(bySeverity),
    mine: fresh.filter((t) => t.ownedBy && norm(t.ownedBy) === me).sort(bySeverity),
    waitingOn: fresh
      .filter((t) => t.ownedBy && norm(t.ownedBy) !== me)
      .sort(bySeverity),
    stale,
    doneToday,
  }
}

export interface ReportTaskInput {
  venue: Venue
  category: VenueTaskCategory
  title: string
  detail?: string
  priority?: VenueTaskPriority
  reportedBy?: string
  stockItemId?: string
  /// Broken equipment goes to the maintenance module, which already holds
  /// asset history and trade contacts. The board keeps a linked row so it
  /// still shows on the morning list with an owner on it.
  maintenanceIssueId?: string
}

export async function reportTask(input: ReportTaskInput) {
  const title = input.title.trim()
  if (!title) throw new Error("Say what the problem is")

  const task = await db.venueTask.create({
    data: {
      venue: input.venue,
      category: input.category,
      title,
      detail: input.detail?.trim() || null,
      reportedPriority: input.priority ?? "NORMAL",
      reportedBy: input.reportedBy?.trim() || null,
      stockItemId: input.stockItemId ?? null,
      maintenanceIssueId: input.maintenanceIssueId ?? null,
    },
  })

  revalidatePath("/venue-ops")
  revalidatePath("/kitchen/report")
  return { id: task.id }
}

/** Georgia disagrees with the reporter. Her call wins, theirs is kept. */
export async function overrideTaskPriority(
  taskId: string,
  priority: VenueTaskPriority
) {
  await db.venueTask.update({
    where: { id: taskId },
    data: { priorityOverride: priority },
  })
  revalidatePath("/venue-ops")
}

/**
 * Put an owner on it. This is the single most important action on the board:
 * a task with no owner is one somebody has to remember, which is the problem
 * this whole module exists to remove.
 */
export async function assignTask(taskId: string, ownedBy: string) {
  const owner = ownedBy.trim()
  await db.venueTask.update({
    where: { id: taskId },
    data: {
      ownedBy: owner || null,
      status: owner ? "IN_PROGRESS" : "OPEN",
    },
  })
  revalidatePath("/venue-ops")
}

export async function completeTask(
  taskId: string,
  doneBy: string,
  note?: string
) {
  const task = await db.venueTask.update({
    where: { id: taskId },
    data: {
      status: "DONE",
      doneBy: doneBy.trim() || null,
      doneAt: new Date(),
      doneNote: note?.trim() || null,
    },
    select: { maintenanceIssueId: true, scheduleId: true },
  })

  // Closing the board row closes the maintenance issue with it, so the two
  // never disagree about whether the oven is fixed.
  if (task.maintenanceIssueId) {
    await db.maintenanceIssue.update({
      where: { id: task.maintenanceIssueId },
      data: {
        status: "FIXED",
        fixedBy: doneBy.trim() || null,
        fixedAt: new Date(),
        fixSummary: note?.trim() || null,
      },
    })
    revalidatePath("/maintenance")
  }

  // A recurring job that got done moves its own next due date forward.
  if (task.scheduleId) {
    const schedule = await db.venueTaskSchedule.findUnique({
      where: { id: task.scheduleId },
    })
    if (schedule) {
      const next = new Date(schedule.nextDueAt)
      next.setMonth(next.getMonth() + schedule.everyMonths)
      await db.venueTaskSchedule.update({
        where: { id: schedule.id },
        data: { lastDoneAt: new Date(), nextDueAt: next },
      })
    }
  }

  revalidatePath("/venue-ops")
}

export async function dismissTask(taskId: string, note?: string) {
  await db.venueTask.update({
    where: { id: taskId },
    data: { status: "DISMISSED", doneAt: new Date(), doneNote: note?.trim() || null },
  })
  revalidatePath("/venue-ops")
}

/**
 * Raise a board row for every scheduled job now inside its lead time, if one
 * is not already open. Assigned to the schedule's owner, never to whoever
 * happens to be reading: these appear so they can be chased, not absorbed.
 *
 * Safe to call on every board load — it is a no-op once the row exists.
 */
export async function raiseDueSchedules(venue: Venue) {
  const schedules = await db.venueTaskSchedule.findMany({
    where: { venue, isActive: true },
  })
  if (!schedules.length) return 0

  const now = Date.now()
  let raised = 0

  for (const s of schedules) {
    const raiseFrom = s.nextDueAt.getTime() - s.leadDays * 24 * 60 * 60 * 1000
    if (now < raiseFrom) continue

    const existing = await db.venueTask.findFirst({
      where: {
        scheduleId: s.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: { id: true },
    })
    if (existing) continue

    await db.venueTask.create({
      data: {
        venue: s.venue,
        category: s.category,
        title: s.title,
        detail: s.detail,
        reportedPriority: "NORMAL",
        reportedBy: "Scheduled",
        ownedBy: s.defaultOwner,
        status: s.defaultOwner ? "IN_PROGRESS" : "OPEN",
        scheduleId: s.id,
        dueAt: s.nextDueAt,
      },
    })
    raised++
  }

  if (raised) revalidatePath("/venue-ops")
  return raised
}
