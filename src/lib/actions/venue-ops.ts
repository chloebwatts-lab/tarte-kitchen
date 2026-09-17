"use server"

import { db } from "@/lib/db"
import { assertManager } from "@/lib/manager-auth"
import { revalidatePath } from "next/cache"
import { sendIssueAlert } from "@/lib/maintenance/notify"
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

/** The board renders in four places; all of them go stale on every write. */
function bust() {
  revalidatePath("/venue-ops")
  revalidatePath("/kitchen/managers/board")
  revalidatePath("/kitchen/jobs")
}

/** Names compare loosely everywhere: "sav " and "Sav" are one person. */
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()

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
  /// Slug of the asset behind a broken-equipment row, for the staff fix page.
  assetSlug: string | null
  stockItemId: string | null
  createdAt: string
  assignedBy: string | null
  assignedAt: string | null
  handedBackBy: string | null
  handedBackAt: string | null
  estimateMinutes: number | null
  personal: boolean
}

export interface TeamMember {
  name: string
  role: "MANAGER" | "SUPERVISOR"
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
  /// Names that have owned a task at this venue lately, plus the schedule
  /// owners. Assigning is a tap on a name, not typing it again every morning.
  /// The venue's team comes first, in its own order.
  owners: string[]
  team: TeamMember[]
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
  maintenanceIssue?: { asset: { slug: string } | null } | null
  stockItemId: string | null
  createdAt: Date
  assignedBy: string | null
  assignedAt: Date | null
  handedBackBy: string | null
  handedBackAt: Date | null
  estimateMinutes: number | null
  personal: boolean
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
    assetSlug: t.maintenanceIssue?.asset?.slug ?? null,
    stockItemId: t.stockItemId,
    createdAt: t.createdAt.toISOString(),
    assignedBy: t.assignedBy,
    assignedAt: t.assignedAt ? t.assignedAt.toISOString() : null,
    handedBackBy: t.handedBackBy,
    handedBackAt: t.handedBackAt ? t.handedBackAt.toISOString() : null,
    estimateMinutes: t.estimateMinutes,
    personal: t.personal,
  }
}

/** The manager and supervisors at a venue, in the order they are listed. */
export async function getVenueTeam(venue: Venue): Promise<TeamMember[]> {
  await assertManager()
  const rows = await db.venueTeamMember.findMany({
    where: { venue, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, role: true },
  })
  return rows.map((r) => ({ name: r.name, role: r.role }))
}

/**
 * Every name that can be tapped to own a job at this venue: the team first
 * in its listed order, then anyone who has owned a job lately or holds a
 * schedule, alphabetically. Deduped loosely so "sav" and "Sav" are one chip.
 */
async function ownerNames(venue: Venue, team: TeamMember[]): Promise<string[]> {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
  const [recentOwners, schedules] = await Promise.all([
    db.venueTask.findMany({
      where: { venue, ownedBy: { not: null }, createdAt: { gte: since } },
      select: { ownedBy: true },
      distinct: ["ownedBy"],
    }),
    db.venueTaskSchedule.findMany({
      where: { venue, isActive: true, defaultOwner: { not: null } },
      select: { defaultOwner: true },
      distinct: ["defaultOwner"],
    }),
  ])
  const seen = new Set<string>()
  const owners: string[] = []
  const add = (raw: string | null) => {
    const name = (raw ?? "").trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return
    seen.add(key)
    owners.push(name)
  }
  for (const m of team) add(m.name)
  const teamCount = owners.length
  for (const raw of [
    ...recentOwners.map((r) => r.ownedBy),
    ...schedules.map((s) => s.defaultOwner),
  ]) {
    add(raw)
  }
  const learned = owners.splice(teamCount).sort((a, b) => a.localeCompare(b))
  return [...owners, ...learned]
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
  await assertManager()
  // Recurring compliance work raises itself first, so opening the board is
  // enough to see something that falls due next week.
  await raiseDueSchedules(venue)

  const rows = await db.venueTask.findMany({
    where: { venue, personal: false, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "asc" },
    include: { maintenanceIssue: { select: { asset: { select: { slug: true } } } } },
  })

  const team = await getVenueTeam(venue)
  const owners = await ownerNames(venue, team)

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const doneToday = await db.venueTask.count({
    where: { venue, personal: false, status: "DONE", doneAt: { gte: startOfDay } },
  })

  const tasks = rows.map(toBoardTask)
  const bySeverity = (a: BoardTask, b: BoardTask) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    b.ageDays - a.ageDays

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
    owners,
    team,
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

  bust()
  revalidatePath("/kitchen/report")
  return { id: task.id }
}

/** Georgia disagrees with the reporter. Her call wins, theirs is kept. */
export async function overrideTaskPriority(
  taskId: string,
  priority: VenueTaskPriority
) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: { priorityOverride: priority },
  })
  bust()
}

/**
 * Put an owner on it. This is the single most important action on the board:
 * a task with no owner is one somebody has to remember, which is the problem
 * this whole module exists to remove.
 */
export async function assignTask(taskId: string, ownedBy: string, assignedBy?: string) {
  await assertManager()
  const owner = ownedBy.trim()
  await db.venueTask.update({
    where: { id: taskId },
    data: {
      ownedBy: owner || null,
      status: owner ? "IN_PROGRESS" : "OPEN",
      assignedBy: owner ? assignedBy?.trim() || null : null,
      assignedAt: owner ? new Date() : null,
      handedBackBy: null,
      handedBackAt: null,
    },
  })
  bust()
}

/**
 * The owner cannot do it. It goes back to the board unowned, marked with who
 * sent it back, so the manager's next morning shows the bounce instead of a
 * job that quietly reappeared.
 */
export async function handBackTask(taskId: string, by: string) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: {
      ownedBy: null,
      status: "OPEN",
      handedBackBy: by.trim() || null,
      handedBackAt: new Date(),
    },
  })
  bust()
}

/** Rough size in minutes, or null to clear it. */
export async function setTaskEstimate(taskId: string, minutes: number | null) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: { estimateMinutes: minutes && minutes > 0 ? Math.round(minutes) : null },
  })
  bust()
}

export async function completeTask(
  taskId: string,
  doneBy: string,
  note?: string
) {
  await assertManager()
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
    await sendIssueAlert(
      task.maintenanceIssueId,
      "fixed",
      `${doneBy.trim() || "Someone"} closed it from the morning board.${note?.trim() ? ` ${note.trim()}` : ""}`
    )
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

  bust()
}

export async function dismissTask(taskId: string, note?: string) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: { status: "DISMISSED", doneAt: new Date(), doneNote: note?.trim() || null },
  })
  bust()
}

/**
 * Raise a board row for every scheduled job now inside its lead time, if one
 * is not already open. Assigned to the schedule's owner, never to whoever
 * happens to be reading: these appear so they can be chased, not absorbed.
 *
 * Safe to call on every board load — it is a no-op once the row exists.
 */
export async function raiseDueSchedules(venue: Venue) {
  await assertManager()
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

  if (raised) bust()
  return raised
}


// ------------------------------------------------------------------
// The Jobs board: the other side of the morning board. Georgia puts a
// name on a job; the person with that name needs somewhere to see it
// without the managers password. One column per person, Done on the
// row, and a way to hand a job back rather than let it sit.
// ------------------------------------------------------------------

export interface JobsColumn {
  owner: string
  /// Listed on the venue team, so the column shows even when empty.
  onTeam: boolean
  tasks: BoardTask[]
}

export interface DoneLine {
  id: string
  title: string
  doneBy: string | null
  doneAt: string
}

export interface JobsBoard {
  venue: Venue
  columns: JobsColumn[]
  doneToday: DoneLine[]
  /// Still with the manager to allocate. Shown as a count only: the Jobs
  /// board is for what has been handed out, not for the triage.
  unassignedCount: number
  owners: string[]
  team: TeamMember[]
}

export async function getJobsBoard(venue: Venue): Promise<JobsBoard> {
  await assertManager()
  await raiseDueSchedules(venue)
  const [rows, team] = await Promise.all([
    db.venueTask.findMany({
      where: { venue, personal: false, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      include: { maintenanceIssue: { select: { asset: { select: { slug: true } } } } },
    }),
    getVenueTeam(venue),
  ])
  const owners = await ownerNames(venue, team)
  const tasks = rows.map(toBoardTask)
  const bySeverity = (a: BoardTask, b: BoardTask) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.ageDays - a.ageDays

  // Supervisors get a column in team order whether or not anything is on
  // them. Everyone else who holds a job follows, alphabetically.
  const columns = new Map<string, JobsColumn>()
  for (const m of team) {
    if (m.role !== "SUPERVISOR") continue
    columns.set(norm(m.name), { owner: m.name, onTeam: true, tasks: [] })
  }
  for (const t of tasks) {
    if (!t.ownedBy) continue
    const key = norm(t.ownedBy)
    const col = columns.get(key) ?? { owner: t.ownedBy.trim(), onTeam: false, tasks: [] }
    col.tasks.push(t)
    columns.set(key, col)
  }
  const ordered = [...columns.values()]
  for (const c of ordered) c.tasks.sort(bySeverity)
  const teamRank = new Map(team.map((m, i) => [norm(m.name), i]))
  ordered.sort((a, b) => {
    const ra = teamRank.get(norm(a.owner)) ?? 999
    const rb = teamRank.get(norm(b.owner)) ?? 999
    return ra - rb || a.owner.localeCompare(b.owner)
  })

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const done = await db.venueTask.findMany({
    where: { venue, personal: false, status: "DONE", doneAt: { gte: startOfDay } },
    orderBy: { doneAt: "desc" },
    select: { id: true, title: true, doneBy: true, doneAt: true },
  })

  return {
    venue,
    columns: ordered,
    doneToday: done.map((d) => ({
      id: d.id,
      title: d.title,
      doneBy: d.doneBy,
      doneAt: (d.doneAt ?? new Date()).toISOString(),
    })),
    unassignedCount: tasks.filter((t) => !t.ownedBy).length,
    owners,
    team,
  }
}

// ------------------------------------------------------------------
// The plate: everything on one person, laid out for the other managers.
// Georgia's time gets questioned because the list only exists in her
// head. This is the list, with hours next to it.
// ------------------------------------------------------------------

export interface PlateSchedule {
  id: string
  title: string
  detail: string | null
  everyMonths: number
  nextDueAt: string
  /// An open board row already exists for the next occurrence.
  raised: boolean
}

export interface PlateArea {
  id: string
  name: string
  description: string | null
  backupName: string | null
}

export interface PlateDone {
  id: string
  title: string
  personal: boolean
  doneAt: string
  /// Days from being reported to being closed.
  turnaroundDays: number
  estimateMinutes: number | null
}

export interface ManagerPlate {
  venue: Venue
  who: string
  /// Open board jobs owned by this person, worst first.
  open: BoardTask[]
  /// This person's own list: theirs alone, never up for grabs.
  ownList: BoardTask[]
  /// Open and owned by somebody else. A manager is still on the hook for
  /// these being chased.
  chasing: BoardTask[]
  /// Nobody's yet. On the manager to allocate, which is also work.
  unallocated: number
  /// Recurring jobs this person owns, whether or not one is on the board yet.
  schedules: PlateSchedule[]
  areas: PlateArea[]
  closed30: PlateDone[]
  closed7: number
  /// Sum of estimates on open jobs, and how many carry no estimate.
  openMinutes: number
  openUnsized: number
  dueThisWeek: number
  /// Median days a job sat before this person closed it, over the last 90 days.
  medianTurnaroundDays: number | null
  /// Who else the plate can be shown for.
  people: string[]
  team: TeamMember[]
}

export async function getManagerPlate(venue: Venue, who: string): Promise<ManagerPlate> {
  await assertManager()
  await raiseDueSchedules(venue)
  const me = norm(who)
  const now = new Date()
  const d30 = new Date(now.getTime() - 30 * 86_400_000)
  const d7 = new Date(now.getTime() - 7 * 86_400_000)
  const d90 = new Date(now.getTime() - 90 * 86_400_000)
  const in90 = new Date(now.getTime() + 90 * 86_400_000)

  const [rows, team, schedules, areas, closed] = await Promise.all([
    db.venueTask.findMany({
      where: { venue, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      include: { maintenanceIssue: { select: { asset: { select: { slug: true } } } } },
    }),
    getVenueTeam(venue),
    db.venueTaskSchedule.findMany({
      where: { venue, isActive: true, nextDueAt: { lte: in90 } },
      orderBy: { nextDueAt: "asc" },
      include: {
        tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } },
      },
    }),
    db.responsibilityArea.findMany({
      where: { venue, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, description: true, ownerName: true, backupName: true },
    }),
    db.venueTask.findMany({
      where: { venue, status: "DONE", doneAt: { gte: d90 } },
      orderBy: { doneAt: "desc" },
      select: { id: true, title: true, doneBy: true, ownedBy: true, doneAt: true, createdAt: true, estimateMinutes: true, personal: true },
    }),
  ])
  const people = await ownerNames(venue, team)
  const tasks = rows.map(toBoardTask)
  const bySeverity = (a: BoardTask, b: BoardTask) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.ageDays - a.ageDays

  const open = tasks.filter((t) => !t.personal && norm(t.ownedBy) === me).sort(bySeverity)
  const ownList = tasks.filter((t) => t.personal && norm(t.ownedBy) === me)
  const chasing = tasks
    .filter((t) => !t.personal && t.ownedBy && norm(t.ownedBy) !== me)
    .sort(bySeverity)
  const unallocated = tasks.filter((t) => !t.personal && !t.ownedBy).length

  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekKey = weekEnd.toISOString().slice(0, 10)
  const dueThisWeek = open.filter(
    (t) => t.priority === "URGENT" || (t.dueAt && t.dueAt.slice(0, 10) <= weekKey)
  ).length

  // Closed by this person: doneBy where recorded, else the owner at the time.
  const mineClosed = closed.filter((c) => norm(c.doneBy || c.ownedBy) === me)
  const closed30 = mineClosed
    .filter((c) => c.doneAt && c.doneAt >= d30)
    .map((c) => ({
      id: c.id,
      title: c.title,
      personal: c.personal,
      doneAt: (c.doneAt ?? now).toISOString(),
      turnaroundDays: Math.max(
        0,
        Math.round(((c.doneAt ?? now).getTime() - c.createdAt.getTime()) / 86_400_000)
      ),
      estimateMinutes: c.estimateMinutes,
    }))
  const closed7 = mineClosed.filter((c) => c.doneAt && c.doneAt >= d7).length
  const turnarounds = mineClosed
    .filter((c) => !c.personal)
    .map((c) => ((c.doneAt ?? now).getTime() - c.createdAt.getTime()) / 86_400_000)
    .sort((a, b) => a - b)
  const medianTurnaroundDays = turnarounds.length
    ? Math.round(turnarounds[Math.floor(turnarounds.length / 2)] * 10) / 10
    : null

  return {
    venue,
    who: who.trim(),
    open,
    ownList,
    chasing,
    unallocated,
    schedules: schedules
      .filter((s) => norm(s.defaultOwner) === me)
      .map((s) => ({
        id: s.id,
        title: s.title,
        detail: s.detail,
        everyMonths: s.everyMonths,
        nextDueAt: s.nextDueAt.toISOString(),
        raised: s.tasks.length > 0,
      })),
    areas: areas
      .filter((a) => norm(a.ownerName) === me)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, backupName: a.backupName })),
    closed30,
    closed7,
    openMinutes: [...open, ...ownList].reduce((n, t) => n + (t.estimateMinutes ?? 0), 0),
    openUnsized: [...open, ...ownList].filter((t) => !t.estimateMinutes).length,
    dueThisWeek,
    medianTurnaroundDays,
    people,
    team,
  }
}


// ------------------------------------------------------------------
// Somebody's own list. Georgia's, at Burleigh: the things she used to
// keep in Apple Notes. Add, tick, untick, remove. Items are hers alone;
// the only way one reaches another person is "Put it on the board",
// which makes it an ordinary unowned job for the morning triage.
// ------------------------------------------------------------------

export interface OwnList {
  venue: Venue
  who: string
  open: BoardTask[]
  /// Ticked today, kept visible so a wrong tick can be undone.
  doneToday: BoardTask[]
}

export async function getOwnList(venue: Venue, who: string): Promise<OwnList> {
  await assertManager()
  const me = who.trim()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const rows = await db.venueTask.findMany({
    where: {
      venue,
      personal: true,
      ownedBy: { equals: me, mode: "insensitive" },
      OR: [{ status: { in: ["OPEN", "IN_PROGRESS"] } }, { status: "DONE", doneAt: { gte: startOfDay } }],
    },
    orderBy: { createdAt: "asc" },
    include: { maintenanceIssue: { select: { asset: { select: { slug: true } } } } },
  })
  const tasks = rows.map(toBoardTask)
  return {
    venue,
    who: me,
    open: tasks.filter((t) => t.status !== "DONE"),
    doneToday: tasks.filter((t) => t.status === "DONE"),
  }
}

export async function addOwnItem(venue: Venue, who: string, title: string, priority: VenueTaskPriority = "NORMAL") {
  await assertManager()
  const me = who.trim()
  const text = title.trim()
  if (!me) throw new Error("Whose list is this?")
  if (!text) throw new Error("Say what it is")
  const row = await db.venueTask.create({
    data: {
      venue,
      category: "MISC",
      title: text,
      reportedPriority: priority,
      reportedBy: me,
      ownedBy: me,
      status: "IN_PROGRESS",
      personal: true,
      assignedBy: me,
      assignedAt: new Date(),
    },
    select: { id: true },
  })
  return { id: row.id }
}

/** Untick. Only meaningful on the day it was ticked; older done items are gone from view. */
export async function reopenTask(taskId: string) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", doneBy: null, doneAt: null, doneNote: null },
  })
  bust()
}

/** A personal item that turns out to be somebody's job: onto the board, unowned. */
export async function releaseToBoard(taskId: string, by: string) {
  await assertManager()
  await db.venueTask.update({
    where: { id: taskId },
    data: {
      personal: false,
      ownedBy: null,
      status: "OPEN",
      reportedBy: by.trim() || null,
      assignedBy: null,
      assignedAt: null,
    },
  })
  bust()
}

/** Delete a personal item outright. Board jobs are dismissed, never deleted. */
export async function removeOwnItem(taskId: string) {
  await assertManager()
  await db.venueTask.deleteMany({ where: { id: taskId, personal: true } })
}
