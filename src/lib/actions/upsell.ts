"use server"

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { assertManager } from "@/lib/manager-auth"
import { isSquareVenueOn, squareCutoverMap } from "@/lib/pos"
import { fetchLiveDay } from "@/lib/square/live"
import { loadGroups, persistUpsell } from "@/lib/square/upsell-store"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate, tarteWeekStart } from "@/lib/sales/compare"
import { leaderboard, matchHours, perHourBoard, MIN_HOURS_FOR_PER_HOUR, type BoardRow, type Metric, type GroupDef, type UnassignedModifier } from "@/lib/sales/upsell"
import { aestDayRange } from "@/lib/square/client"
import { buildSimpleBoard, weekMinHours, type SimpleBoard } from "@/lib/sales/challenge-simple"

export interface ChallengeView {
  id: string
  name: string
  groupKey: string
  groupLabel: string
  metric: Metric
  startDate: string
  endDate: string
  note: string | null
  status: "UPCOMING" | "LIVE" | "FINISHED"
  daysLeft: number
  board: BoardRow[]
  team: BoardRow
  daily: boolean
  /** One entry per day so far (newest first) when `daily`. */
  days: Array<{ date: string; isToday: boolean; top: BoardRow[] }>
  minHours: number
}
export interface StandingRow {
  groupKey: string
  label: string
  blurb: string | null
  today: BoardRow
  thisWeek: BoardRow
  lastWeek: BoardRow
  staffThisWeek: BoardRow[]
}
export interface UpsellBoardData {
  venue: Venue
  date: string
  onSquare: boolean
  groups: GroupDef[]
  challenges: ChallengeView[]
  standing: StandingRow[]
  unassigned: UnassignedModifier[]
  weekLabel: string
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const D = (s: string) => new Date(`${s}T00:00:00Z`)

async function rowsFor(venue: Venue, from: string, to: string, groupKey?: string) {
  const rows = await db.dailyStaffUpsell.findMany({ where: { venue, date: { gte: D(from), lte: D(to) }, ...(groupKey ? { groupKey } : {}) } })
  return rows.map((r) => ({ teamMemberId: r.teamMemberId, staffName: r.staffName, groupKey: r.groupKey, eligibleOrders: r.eligibleOrders, ordersWith: r.ordersWith, units: r.units, sales: Number(r.salesIncGst) }))
}

/** Timesheet hours per name at a venue between two Brisbane dates (shifts in progress count up to now). */
async function timesheetHours(venue: Venue, from: string, to: string): Promise<Map<string, number>> {
  const start = new Date(aestDayRange(from).startAt), end = new Date(aestDayRange(to).endAt)
  const shifts = await db.labourShift.findMany({ where: { venue, source: "TIMESHEET", isOpen: false, shiftStart: { gte: start, lt: end } }, select: { employeeName: true, shiftStart: true, shiftEnd: true, hours: true } })
  const now = Date.now()
  const out = new Map<string, number>()
  for (const s of shifts) {
    let h = Number(s.hours)
    const elapsed = Math.max(0, (Math.min(now, s.shiftEnd.getTime() > s.shiftStart.getTime() ? s.shiftEnd.getTime() : now) - s.shiftStart.getTime()) / 3600000)
    if (s.shiftEnd.getTime() > now || h <= 0) h = Math.min(h > 0 ? h : elapsed, elapsed)
    out.set(s.employeeName, (out.get(s.employeeName) ?? 0) + h)
  }
  return out
}

export async function getUpsellBoard(venue: Venue, date?: string): Promise<UpsellBoardData> {
  await assertManager()
  const now = brisbaneNow()
  const day = date ?? now.date
  const onSquare = isSquareVenueOn(venue, day)
  const groups = await loadGroups()

  // Bring today up to the minute (the 30-minute sync covers the rest).
  let unassigned: UnassignedModifier[] = []
  if (onSquare && day === now.date) {
    try {
      const live = await fetchLiveDay(venue, day)
      if (live) { await persistUpsell(venue, day, live.upsell.rows); unassigned = live.upsell.unassigned.slice(0, 12) }
    } catch (err) { console.error("[upsell] live refresh failed", err) }
  }

  const weekStart = tarteWeekStart(day)
  const lastStart = shiftDate(weekStart, -7), lastEnd = shiftDate(weekStart, -1)
  const [todayRows, weekRows, lastRows] = await Promise.all([rowsFor(venue, day, day), rowsFor(venue, weekStart, day), rowsFor(venue, lastStart, lastEnd)])
  const standing: StandingRow[] = groups.map((g) => {
    const pick = (rows: typeof todayRows) => rows.filter((r) => r.groupKey === g.key)
    const wk = leaderboard(pick(weekRows), "UNITS")
    return {
      groupKey: g.key, label: g.label, blurb: g.blurb ?? null,
      today: leaderboard(pick(todayRows), "UNITS").team,
      thisWeek: wk.team,
      lastWeek: leaderboard(pick(lastRows), "UNITS").team,
      staffThisWeek: wk.board.filter((r) => r.eligibleOrders > 0),
    }
  })

  const raw = await db.salesChallenge.findMany({ where: { venue, endDate: { gte: D(shiftDate(day, -14)) } }, orderBy: [{ startDate: "desc" }] })
  const challenges: ChallengeView[] = []
  for (const c of raw) {
    const start = ymd(c.startDate), end = ymd(c.endDate)
    const to = end < now.date ? end : now.date
    const rows = start <= to ? await rowsFor(venue, start, to, c.groupKey) : []
    const lb = leaderboard(rows, c.metric as Metric)
    const team = lb.team
    let board = lb.board
    if (rows.length) {
      const hours = matchHours(board.map((r) => r.staffName), await timesheetHours(venue, start, to))
      const withHours = perHourBoard(board, hours)
      board = c.metric === "PER_HOUR" ? withHours : board.map((r) => { const h = withHours.find((x) => x.teamMemberId === r.teamMemberId); return { ...r, hours: h?.hours ?? null, perHour: h?.perHour ?? null } })
    }
    const days: ChallengeView["days"] = []
    if (c.daily && start <= to) {
      const all = await db.dailyStaffUpsell.findMany({ where: { venue, groupKey: c.groupKey, date: { gte: D(start), lte: D(to) } } })
      for (let d = to; d >= start; d = shiftDate(d, -1)) {
        const dayRows = all.filter((r) => ymd(r.date) === d).map((r) => ({ teamMemberId: r.teamMemberId, staffName: r.staffName, eligibleOrders: r.eligibleOrders, ordersWith: r.ordersWith, units: r.units, sales: Number(r.salesIncGst) }))
        days.push({ date: d, isToday: d === now.date, top: leaderboard(dayRows, "UNITS").board.filter((r) => r.units > 0).slice(0, 3) })
      }
    }
    const status: ChallengeView["status"] = c.endedAt || end < now.date ? "FINISHED" : start > now.date ? "UPCOMING" : "LIVE"
    const daysLeft = Math.max(0, Math.round((D(end).getTime() - D(now.date).getTime()) / 86400000) + 1)
    challenges.push({
      id: c.id, name: c.name, groupKey: c.groupKey, groupLabel: groups.find((g) => g.key === c.groupKey)?.label ?? c.groupKey,
      metric: c.metric as Metric, startDate: start, endDate: end, note: c.note, status, daysLeft, board, team,
      daily: c.daily, days, minHours: MIN_HOURS_FOR_PER_HOUR,
    })
  }
  challenges.sort((a, b) => (a.status === b.status ? b.startDate.localeCompare(a.startDate) : a.status === "LIVE" ? -1 : b.status === "LIVE" ? 1 : a.status === "UPCOMING" ? -1 : 1))

  const fmt = (s: string) => D(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  return { venue, date: day, onSquare, groups, challenges, standing, unassigned, weekLabel: `${fmt(weekStart)} to ${fmt(day)}` }
}

export async function createChallenge(input: { venue: Venue; name: string; groupKey: string; metric: Metric; startDate: string; endDate: string; note?: string; daily?: boolean }) {
  await assertManager()
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false as const, error: "Give the challenge a name." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) return { ok: false as const, error: "Check the dates." }
  if (!["UNITS", "ATTACH", "SALES", "PER_HOUR"].includes(input.metric)) return { ok: false as const, error: "Pick how it is scored." }
  const group = await db.upsellGroup.findUnique({ where: { key: input.groupKey } })
  if (!group) return { ok: false as const, error: "Pick what counts." }
  await db.salesChallenge.create({ data: { venue: input.venue, name, groupKey: input.groupKey, metric: input.metric, daily: Boolean(input.daily), startDate: D(input.startDate), endDate: D(input.endDate), note: input.note?.trim().slice(0, 200) || null } })
  return { ok: true as const }
}

export async function endChallenge(id: string) {
  await assertManager()
  const now = brisbaneNow()
  const c = await db.salesChallenge.findUnique({ where: { id } })
  if (!c) return
  const end = ymd(c.endDate) > now.date ? D(now.date) : c.endDate
  await db.salesChallenge.update({ where: { id }, data: { endedAt: new Date(), endDate: end } })
}

export async function deleteChallenge(id: string) {
  await assertManager()
  await db.salesChallenge.delete({ where: { id } }).catch(() => {})
}

const cleanList = (text: string) => [...new Set(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 200)

/**
 * Edit what a group counts (or create a new one), then recount the last two
 * weeks of Square days so leaderboards reflect the new list straight away.
 */
export async function saveGroup(input: { venue: Venue; key?: string; label: string; items: string; modifiers: string }) {
  await assertManager()
  const label = input.label.trim().slice(0, 40)
  if (!label) return { ok: false as const, error: "Name the list." }
  const itemNames = cleanList(input.items), modifierNames = cleanList(input.modifiers)
  if (!itemNames.length && !modifierNames.length && !input.key) return { ok: false as const, error: "Add at least one item or add-on." }
  if (input.key) {
    await db.upsellGroup.update({ where: { key: input.key }, data: { label, itemNames, modifierNames } })
  } else {
    const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${Date.now().toString(36)}`
    await db.upsellGroup.create({ data: { key, label, blurb: "Custom list. Every order is eligible.", itemNames, modifierNames, itemCategories: [], baseCategories: [], sortOrder: 50 } })
  }
  const recounted = await recomputeUpsell(input.venue, 14)
  return { ok: true as const, recounted }
}

/** Recount the last `days` Square days for a venue from Square itself. */
export async function recomputeUpsell(venue: Venue, days = 14): Promise<number> {
  await assertManager()
  const now = brisbaneNow()
  const cutover = squareCutoverMap()[venue]
  if (!cutover) return 0
  let n = 0
  for (let i = 0; i < Math.min(21, days); i++) {
    const day = shiftDate(now.date, -i)
    if (day < cutover) break
    try {
      const live = await fetchLiveDay(venue, day, { force: true })
      if (live) { await persistUpsell(venue, day, live.upsell.rows); n++ }
    } catch (err) { console.error("[upsell] recount failed", venue, day, err) }
  }
  return n
}

// ─── The simple challenge page ──────────────────────────────────────────────

export type ChallengeTab = "today" | "yesterday" | "week"
export interface SimpleChallengeData {
  venue: Venue
  tab: ChallengeTab
  onSquare: boolean
  /** "Sides Week" when a challenge is running, else what is being counted. */
  title: string
  countLabel: string
  rangeLabel: string
  board: SimpleBoard
  managers: string[]
  /** Hours needed before a week's per-hour number is ranked. */
  minHours: number
  live: boolean
}

const MANAGERS_KEY = "challengeManagers"

async function challengeManagers(venue: Venue): Promise<string[]> {
  const row = await db.appSetting.findUnique({ where: { key: MANAGERS_KEY } })
  if (!row) return []
  try {
    const all = JSON.parse(row.value) as Record<string, string[]>
    return Array.isArray(all[venue]) ? all[venue] : []
  } catch {
    return []
  }
}

/** Salaried managers at a venue: they count nine hours for every day they sell on. */
export async function saveChallengeManagers(venue: Venue, names: string) {
  await assertManager()
  const row = await db.appSetting.findUnique({ where: { key: MANAGERS_KEY } })
  let all: Record<string, string[]> = {}
  try { all = row ? (JSON.parse(row.value) as Record<string, string[]>) : {} } catch { all = {} }
  all[venue] = cleanList(names).slice(0, 30)
  await db.appSetting.upsert({ where: { key: MANAGERS_KEY }, create: { key: MANAGERS_KEY, value: JSON.stringify(all) }, update: { value: JSON.stringify(all) } })
  return { ok: true as const, managers: all[venue] }
}

export async function getSimpleChallenge(venue: Venue, tab: ChallengeTab): Promise<SimpleChallengeData> {
  await assertManager()
  const now = brisbaneNow()
  const today = now.date
  const groups = await loadGroups()
  const managers = await challengeManagers(venue)

  // A running challenge sets what is counted and when the week starts.
  const running = await db.salesChallenge.findFirst({
    where: { venue, endedAt: null, startDate: { lte: D(today) }, endDate: { gte: D(today) } },
    orderBy: { startDate: "desc" },
  })
  const groupKey = running?.groupKey ?? "sides"
  const countLabel = groups.find((g) => g.key === groupKey)?.label ?? "Sides"

  const from = tab === "today" ? today : tab === "yesterday" ? shiftDate(today, -1) : running ? ymd(running.startDate) : tarteWeekStart(today)
  const to = tab === "yesterday" ? from : today
  const onSquare = isSquareVenueOn(venue, to)

  if (onSquare && tab !== "yesterday") {
    try {
      const live = await fetchLiveDay(venue, today)
      if (live) await persistUpsell(venue, today, live.upsell.rows)
    } catch (err) { console.error("[challenge] live refresh failed", err) }
  }

  const raw = await db.dailyStaffUpsell.findMany({ where: { venue, groupKey, date: { gte: D(from), lte: D(to) } } })
  const rows = raw.map((r) => ({
    date: ymd(r.date), teamMemberId: r.teamMemberId, staffName: r.staffName, units: r.units, eligibleOrders: r.eligibleOrders,
    breakdown: (r.breakdown as Record<string, number> | null) ?? null,
  }))
  const hours = await timesheetHours(venue, from, to)
  const daysSoFar = Math.round((D(to).getTime() - D(from).getTime()) / 86400000) + 1
  const minHours = weekMinHours(daysSoFar)
  const board = buildSimpleBoard(rows, hours, managers, tab === "week" ? "PER_HOUR" : "UNITS", minHours)

  const fmt = (s: string) => D(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  return {
    venue, tab, onSquare, title: running?.name ?? `${countLabel} challenge`, countLabel,
    rangeLabel: from === to ? fmt(from) : `${fmt(from)} to ${fmt(to)}`,
    board, managers, minHours, live: tab !== "yesterday",
  }
}
