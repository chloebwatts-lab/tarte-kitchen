/**
 * Readings for the GM desk: everything the app can see for itself about
 * Burleigh, so Oliver never hand-ticks something the system already knows
 * and never has to go looking for a number. Percentages only, no wage $.
 */

import { db } from "@/lib/db"
import { Venue, type ChecklistCadence } from "@/generated/prisma/client"
import { addDays, todayAest, ymd } from "@/lib/commitments/weeks"
import { startOfTarteWeekUtc } from "@/lib/dates"
import { bucketStatus, bucketTargets, type Bucket } from "@/lib/labour/buckets"
import { recodeLabourWeek } from "@/lib/labour/recode"
import { getConnection, listRosterBetween } from "@/lib/deputy/client"
import {
  COGS_TARGET_PCT,
  ONE_ON_ONE_TARGET,
  WASTAGE_WEEKLY_CAP,
  type GmAutoKey,
} from "./plan"

const VENUE = Venue.BURLEIGH
const AEST_MS = 10 * 60 * 60 * 1000

export interface AutoReading {
  /** true / false = the app's verdict right now. null = cannot tell. */
  met: boolean | null
  detail: string
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "Sat 19 Sep" from a UTC-midnight date. Hand-rolled: en-AU adds a comma and "Sept". */
export const dayLabel = (d: Date) => `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`

// ── Roster horizon (asks Deputy, cached 30 min) ───────────────

interface HorizonCache {
  at: number
  weeks: { start: string; published: number; total: number }[]
}
const HORIZON_KEY = "gmRosterHorizon"

async function loadHorizon(): Promise<HorizonCache | null> {
  const row = await db.appSetting.findUnique({ where: { key: HORIZON_KEY } })
  if (row?.value) {
    try {
      const cached = JSON.parse(row.value) as HorizonCache
      if (Date.now() - cached.at < 30 * 60 * 1000) return cached
    } catch {
      /* fall through and refetch */
    }
  }
  try {
    const connection = await getConnection()
    const burleighUnits = new Set<number>()
    for (const l of (connection.locations as { id: number; venue: Venue }[] | null) ?? []) {
      if (l.venue === VENUE) burleighUnits.add(l.id)
    }
    if (burleighUnits.size === 0) return null
    const thisWed = startOfTarteWeekUtc(new Date())
    const weeks: HorizonCache["weeks"] = []
    for (const n of [1, 2, 3]) {
      const start = addDays(thisWed, 7 * n)
      const since = Math.floor((start.getTime() - AEST_MS) / 1000)
      const rows = await listRosterBetween(since, since + 7 * 86400)
      const mine = rows.filter((r) => burleighUnits.has(r.OperationalUnit))
      const published = mine.filter((r) => (r as unknown as { Published?: boolean }).Published === true).length
      weeks.push({ start: ymd(start), published, total: mine.length })
    }
    const fresh: HorizonCache = { at: Date.now(), weeks }
    await db.appSetting.upsert({
      where: { key: HORIZON_KEY },
      create: { key: HORIZON_KEY, value: JSON.stringify(fresh) },
      update: { value: JSON.stringify(fresh) },
    })
    return fresh
  } catch {
    // Deputy down or not connected: fall back to a stale cache if any.
    if (row?.value) {
      try { return JSON.parse(row.value) as HorizonCache } catch { return null }
    }
    return null
  }
}

/** A week counts as live once it carries a real roster's worth of
 *  published shifts, not three placeholder rows. */
async function rosterHorizon(): Promise<AutoReading & { nextToPublish: string | null }> {
  const h = await loadHorizon()
  if (!h) return { met: null, detail: "Could not reach Deputy. Tick it yourself.", nextToPublish: null }
  const thisWed = startOfTarteWeekUtc(new Date())
  const baseline = await db.labourShift.count({
    where: {
      venue: VENUE,
      source: "ROSTER",
      shiftStart: { gte: new Date(thisWed.getTime() - AEST_MS), lt: new Date(thisWed.getTime() - AEST_MS + 7 * 86400000) },
    },
  })
  const need = Math.max(20, Math.round(baseline * 0.5))
  const live = h.weeks.map((w) => w.published >= need)
  const firstGap = h.weeks.find((_, i) => !live[i])
  const next = firstGap ? dayLabel(new Date(firstGap.start)) : null
  const met = live[0] && live[1]
  const parts = h.weeks.slice(0, 2).map((w, i) => `${dayLabel(new Date(w.start))}: ${live[i] ? "live" : w.total > 0 ? "draft, not published" : "empty"}`)
  return {
    met,
    detail: parts.join(". ") + (next ? `. Next to publish: week of ${next}.` : ". Third week is live too."),
    nextToPublish: next,
  }
}

// ── Open shifts, next 7 days ──────────────────────────────────

async function openShifts(): Promise<AutoReading> {
  const now = new Date()
  const rows = await db.labourShift.findMany({
    where: { venue: VENUE, source: "ROSTER", isOpen: true, shiftStart: { gte: now, lt: new Date(now.getTime() + 7 * 86400000) } },
    select: { shiftStart: true, area: true },
    orderBy: { shiftStart: "asc" },
  })
  if (rows.length === 0) return { met: true, detail: "None in the next 7 days." }
  const first = rows.slice(0, 3).map((r) => {
    const d = new Date(r.shiftStart.getTime() + AEST_MS)
    return `${dayLabel(d)} ${r.area ?? ""}`.trim()
  })
  return { met: false, detail: `${rows.length} open: ${first.join(", ")}${rows.length > 3 ? " and more" : ""}.` }
}

// ── Worked vs rostered hours, last full Wed to Tue week ───────

async function hoursVsRoster(): Promise<AutoReading> {
  const thisWed = startOfTarteWeekUtc(new Date())
  const start = new Date(addDays(thisWed, -7).getTime() - AEST_MS)
  const end = new Date(thisWed.getTime() - AEST_MS)
  const rows = await db.labourShift.groupBy({
    by: ["source"],
    where: { venue: VENUE, isOpen: false, shiftStart: { gte: start, lt: end } },
    _sum: { hours: true },
  })
  const worked = Number(rows.find((r) => r.source === "TIMESHEET")?._sum.hours ?? 0)
  const rostered = Number(rows.find((r) => r.source === "ROSTER")?._sum.hours ?? 0)
  if (rostered < 100 || worked < 100) return { met: null, detail: "Not enough data for last week. Check Deputy and tick it yourself." }
  const diff = ((worked - rostered) / rostered) * 100
  return {
    met: diff <= 3,
    detail: `Worked ${Math.round(worked)}h against ${Math.round(rostered)}h rostered (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%).`,
  }
}

// ── Checklists, this trading week (Wed to Tue), Burleigh ────────────────

async function checklists(weekStart: string): Promise<AutoReading> {
  const monday = new Date(weekStart)
  const today = todayAest()
  const templates = await db.checklistTemplate.findMany({
    where: { isActive: true, cadence: "DAILY" as ChecklistCadence, venue: { in: [VENUE, Venue.BOTH] } },
    select: { id: true, name: true },
  })
  const elapsed: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    if (d < today) elapsed.push(d)
  }
  if (templates.length === 0) return { met: null, detail: "No daily checklists set up for Burleigh." }
  if (elapsed.length === 0) return { met: null, detail: "Week has just started. Nothing to count yet." }
  const runs = await db.checklistRun.findMany({
    where: { status: "COMPLETED", venue: VENUE, runDate: { gte: monday, lte: addDays(monday, 6) }, templateId: { in: templates.map((t) => t.id) } },
    select: { templateId: true, runDate: true },
  })
  const done = new Set(runs.map((r) => `${r.templateId}|${ymd(r.runDate)}`))
  let got = 0
  const missedDays = new Set<string>()
  for (const t of templates) {
    for (const d of elapsed) {
      if (done.has(`${t.id}|${ymd(d)}`)) got++
      else missedDays.add(dayLabel(d))
    }
  }
  const expected = templates.length * elapsed.length
  const pct = Math.round((got / expected) * 100)
  return {
    met: pct >= 95,
    detail: `${got} of ${expected} done so far (${pct}%).${missedDays.size ? ` Gaps on ${[...missedDays].slice(0, 3).join(", ")}.` : ""}`,
  }
}

// ── Wastage, this trading week (Wed to Tue) ─────────────────────────────

async function wastage(weekStart: string): Promise<AutoReading & { total: number }> {
  const monday = new Date(weekStart)
  const today = todayAest()
  const rows = await db.wasteEntry.findMany({
    where: { venue: VENUE, date: { gte: monday, lte: addDays(monday, 6) } },
    select: { date: true, estimatedCost: true },
  })
  const total = rows.reduce((s, r) => s + Number(r.estimatedCost), 0)
  const logged = new Set(rows.map((r) => ymd(r.date)))
  const blank: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    if (d < today && !logged.has(ymd(d))) blank.push(dayLabel(d))
  }
  const under = total <= WASTAGE_WEEKLY_CAP
  return {
    total,
    met: under && blank.length === 0,
    detail: `$${Math.round(total)} so far against $${WASTAGE_WEEKLY_CAP}.${blank.length ? ` Nothing logged ${blank.slice(0, 3).join(", ")}.` : ""}`,
  }
}

// ── One-on-ones and the Friday report ─────────────────────────

async function oneOnOnes(weekStart: string): Promise<AutoReading> {
  const monday = new Date(weekStart)
  const n = await db.gmOneOnOne.count({ where: { heldOn: { gte: monday, lte: addDays(monday, 6) } } })
  return { met: n >= ONE_ON_ONE_TARGET, detail: `${n} of ${ONE_ON_ONE_TARGET} this week.` }
}

async function weeklyReport(weekStart: string): Promise<AutoReading> {
  const r = await db.gmReport.findUnique({ where: { weekStart: new Date(weekStart) } })
  if (!r) return { met: false, detail: "Not sent yet." }
  const at = new Date(r.sentAt.getTime() + AEST_MS)
  return { met: true, detail: `Sent ${dayLabel(at)}.` }
}

export async function getAutoReadings(weekStart: string): Promise<{
  readings: Record<GmAutoKey, AutoReading>
  nextToPublish: string | null
  wastageTotal: number
}> {
  const [h, o, hr, c, w, one, rep] = await Promise.all([
    rosterHorizon(),
    openShifts(),
    hoursVsRoster(),
    checklists(weekStart),
    wastage(weekStart),
    oneOnOnes(weekStart),
    weeklyReport(weekStart),
  ])
  return {
    readings: {
      "roster-horizon": { met: h.met, detail: h.detail },
      "open-shifts": o,
      "hours-vs-roster": hr,
      checklists: c,
      wastage: { met: w.met, detail: w.detail },
      "one-on-ones": one,
      "weekly-report": rep,
    },
    nextToPublish: h.nextToPublish,
    wastageTotal: w.total,
  }
}

// ── The numbers strip: wage % by dept and COGS, latest weeks ──

export interface NumberTile {
  key: string
  label: string
  value: string
  target: string
  status: "ok" | "amber" | "red" | "none"
}

export interface WeekNumbers {
  weekLabel: string | null
  tiles: NumberTile[]
}

function weekLabel(wed: Date): string {
  return `${dayLabel(wed)} to ${dayLabel(addDays(wed, 6))}`
}

/** Dept wage % for one settled Wed-week, recoded to where people worked. */
async function wagePctForWeek(wed: Date): Promise<Record<Bucket, number> | null> {
  const actual = await db.labourWeekActual.findFirst({ where: { venue: VENUE, weekStartWed: wed } })
  const revenue = actual?.revenueExGst != null ? Number(actual.revenueExGst) : 0
  if (!actual || revenue <= 0) return null
  const recode = await recodeLabourWeek(wed).catch(() => null)
  const b = recode?.[VENUE]?.buckets
  const dollars: Record<Bucket, number> = b ?? {
    chefsKp: Number(actual.wagesChef ?? 0) + Number(actual.wagesKp ?? 0),
    fohBarista: Number(actual.wagesFoh ?? 0) + Number(actual.wagesBarista ?? 0),
    pastry: Number(actual.wagesPastry ?? 0),
    other: 0,
  }
  return {
    chefsKp: (dollars.chefsKp / revenue) * 100,
    fohBarista: (dollars.fohBarista / revenue) * 100,
    pastry: (dollars.pastry / revenue) * 100,
    other: 0,
  }
}

export async function getWeekNumbers(): Promise<{ wages: WeekNumbers; cogs: WeekNumbers }> {
  const latestActual = await db.labourWeekActual.findFirst({
    where: { venue: VENUE, revenueExGst: { not: null } },
    orderBy: { weekStartWed: "desc" },
    select: { weekStartWed: true },
  })
  const wages: WeekNumbers = { weekLabel: null, tiles: [] }
  if (latestActual) {
    const pct = await wagePctForWeek(latestActual.weekStartWed)
    if (pct) {
      wages.weekLabel = weekLabel(latestActual.weekStartWed)
      let total = 0
      for (const t of bucketTargets(VENUE)) {
        const v = pct[t.key]
        total += v
        const s = bucketStatus(v, t)
        wages.tiles.push({
          key: t.key,
          label: t.label,
          value: `${v.toFixed(1)}%`,
          target: `${t.min} to ${t.max}%`,
          status: s === "no-target" ? "none" : s,
        })
      }
      wages.tiles.unshift({
        key: "venue",
        label: "Venue, ex admin",
        value: `${total.toFixed(1)}%`,
        target: "38% or under",
        status: total <= 38 ? "ok" : total <= 39 ? "amber" : "red",
      })
    }
  }

  const c = await db.weeklyCogs.findFirst({
    where: { venue: VENUE, cogsPct: { not: null } },
    orderBy: { weekStartWed: "desc" },
  })
  const cogs: WeekNumbers = { weekLabel: null, tiles: [] }
  if (c?.cogsPct != null) {
    const v = Number(c.cogsPct)
    cogs.weekLabel = weekLabel(c.weekStartWed)
    cogs.tiles.push({
      key: "cogs",
      label: "COGS",
      value: `${v.toFixed(1)}%`,
      target: `${COGS_TARGET_PCT}% or under`,
      status: v <= COGS_TARGET_PCT ? "ok" : v <= COGS_TARGET_PCT + 1 ? "amber" : "red",
    })
  }
  return { wages, cogs }
}

// ── Reviews this week ─────────────────────────────────────────

export interface ReviewLine {
  rating: number
  who: string
  text: string
  when: string
}

export async function getWeekReviews(weekStart: string): Promise<{ lines: ReviewLine[]; fiveStarThisMonth: number }> {
  const monday = new Date(new Date(weekStart).getTime() - AEST_MS)
  const today = todayAest()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) - AEST_MS)
  const [rows, fives] = await Promise.all([
    db.googleReview.findMany({
      where: { venue: VENUE, publishTime: { gte: monday } },
      orderBy: [{ rating: "asc" }, { publishTime: "desc" }],
      select: { rating: true, authorName: true, text: true, publishTime: true },
      take: 12,
    }),
    db.googleReview.count({ where: { venue: VENUE, rating: 5, publishTime: { gte: monthStart } } }),
  ])
  return {
    fiveStarThisMonth: fives,
    lines: rows.map((r) => ({
      rating: r.rating,
      who: (r.authorName ?? "Guest").split(" ")[0],
      text: (r.text ?? "").slice(0, 260),
      when: dayLabel(new Date(r.publishTime.getTime() + AEST_MS)),
    })),
  }
}

// ── Who to sit down with ──────────────────────────────────────

export interface StaffLine {
  name: string
  lastSeen: string | null
  daysSince: number | null
}

export async function getOneOnOneQueue(): Promise<StaffLine[]> {
  const since = new Date(Date.now() - 28 * 86400000)
  const [shifts, talks] = await Promise.all([
    db.labourShift.findMany({
      where: { venue: VENUE, isOpen: false, shiftStart: { gte: since } },
      distinct: ["employeeName"],
      select: { employeeName: true },
    }),
    db.gmOneOnOne.groupBy({ by: ["staffName"], _max: { heldOn: true } }),
  ])
  const last = new Map(talks.map((t) => [t.staffName, t._max.heldOn]))
  const today = todayAest()
  const out: StaffLine[] = []
  for (const s of shifts) {
    const name = s.employeeName.trim()
    // Deputy cost placeholders and Oliver himself are not people to meet.
    if (!name || /^salary\b/i.test(name) || /^open\b/i.test(name) || /^oliver warren/i.test(name)) continue
    const held = last.get(name) ?? null
    out.push({
      name,
      lastSeen: held ? dayLabel(held) : null,
      daysSince: held ? Math.round((today.getTime() - held.getTime()) / 86400000) : null,
    })
  }
  // Never seen first, then longest ago.
  out.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999) || a.name.localeCompare(b.name))
  return out
}
