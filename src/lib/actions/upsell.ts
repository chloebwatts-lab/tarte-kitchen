"use server"

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { assertManager } from "@/lib/manager-auth"
import { isSquareVenueOn, squareCutoverMap } from "@/lib/pos"
import { fetchLiveDay } from "@/lib/square/live"
import { loadGroups, persistUpsell } from "@/lib/square/upsell-store"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate, tarteWeekStart } from "@/lib/sales/compare"
import { leaderboard, type BoardRow, type Metric, type GroupDef, type UnassignedModifier } from "@/lib/sales/upsell"

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
    const { board, team } = leaderboard(rows, c.metric as Metric)
    const status: ChallengeView["status"] = c.endedAt || end < now.date ? "FINISHED" : start > now.date ? "UPCOMING" : "LIVE"
    const daysLeft = Math.max(0, Math.round((D(end).getTime() - D(now.date).getTime()) / 86400000) + 1)
    challenges.push({
      id: c.id, name: c.name, groupKey: c.groupKey, groupLabel: groups.find((g) => g.key === c.groupKey)?.label ?? c.groupKey,
      metric: c.metric as Metric, startDate: start, endDate: end, note: c.note, status, daysLeft, board, team,
    })
  }
  challenges.sort((a, b) => (a.status === b.status ? b.startDate.localeCompare(a.startDate) : a.status === "LIVE" ? -1 : b.status === "LIVE" ? 1 : a.status === "UPCOMING" ? -1 : 1))

  const fmt = (s: string) => D(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  return { venue, date: day, onSquare, groups, challenges, standing, unassigned, weekLabel: `${fmt(weekStart)} to ${fmt(day)}` }
}

export async function createChallenge(input: { venue: Venue; name: string; groupKey: string; metric: Metric; startDate: string; endDate: string; note?: string }) {
  await assertManager()
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false as const, error: "Give the challenge a name." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) return { ok: false as const, error: "Check the dates." }
  if (!["UNITS", "ATTACH", "SALES"].includes(input.metric)) return { ok: false as const, error: "Pick how it is scored." }
  const group = await db.upsellGroup.findUnique({ where: { key: input.groupKey } })
  if (!group) return { ok: false as const, error: "Pick what counts." }
  await db.salesChallenge.create({ data: { venue: input.venue, name, groupKey: input.groupKey, metric: input.metric, startDate: D(input.startDate), endDate: D(input.endDate), note: input.note?.trim().slice(0, 200) || null } })
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
