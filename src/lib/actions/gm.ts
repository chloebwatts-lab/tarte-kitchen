"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkGmPassword, isGmAuthed, setGmCookie, storeGmPassword } from "@/lib/gm-auth"
import { addDays, todayAest, ymd } from "@/lib/commitments/weeks"
import { gmWeekPos, gmWeekStart, gmWeekStartOf } from "@/lib/gm/week"
import { sendEmail } from "@/lib/gmail/send"
import { guardedCheck, LOCKED_MESSAGE } from "@/lib/login-guard"
import { pushPublicKey, sendGmPush } from "@/lib/gm/push"
import { getCurrentWeekSpend } from "@/lib/spend/current-week"
import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"
import { CROSS_VENUE_WEEKLY_TOTAL } from "@/lib/labour/recode"
import {
  GM_ITEMS,
  GM_MONTHLY_MANUAL,
  GM_TASK_SEEDS,
  type GmDays,
  type GmTheme,
} from "@/lib/gm/plan"
import {
  getOneOnOneQueue,
  getWeekNumbers,
  getWeekReviews,
  type ReviewLine,
  type StaffLine,
  type WeekNumbers,
} from "@/lib/gm/readings"
import { buildItems, composeReport, fmt, getGmDays, short, type BoardItem } from "@/lib/gm/board"

const DAYS_KEY = "gmDays"
const EMAIL_KEY = "gmEmail"
/** Desk went live Fri 18 Sep 2026: the Thursday before it is not "missed". */
const GM_DESK_LAUNCH_WEEK = "2026-09-16"
const GM_DESK_LAUNCH_POS = 2
const REPORT_TO = process.env.GM_REPORT_RECIPIENT || "chloe@tarte.com.au"

async function guard(): Promise<void> {
  if (!(await isGmAuthed())) throw new Error("Locked. Unlock the GM desk first.")
}
function bust() {
  revalidatePath("/kitchen/gm")
  revalidatePath("/kitchen/gm/month")
}

// ─── Gate ────────────────────────────────────────────────────────────

export async function unlockGm(password: string, next: string) {
  const result = await guardedCheck("gm", () => checkGmPassword(password))
  if (result === "locked") return { ok: false as const, error: LOCKED_MESSAGE }
  if (result === "wrong") {
    return { ok: false as const, error: "That's not it. Ask Chloe." }
  }
  await setGmCookie()
  // First real unlock = Oliver has been handed his desk. Reminders start from here.
  await db.appSetting.upsert({ where: { key: "gmFirstUnlockAt" }, create: { key: "gmFirstUnlockAt", value: new Date().toISOString() }, update: {} })
  redirect(next.startsWith("/kitchen/gm") ? next : "/kitchen/gm")
}

/** Office side only: needs a real admin login, never the GM cookie. */
export async function setGmPassword(password: string) {
  if (!(await getServerSession(authOptions))) throw new Error("Sign in first")
  const p = password.trim()
  if (p.length < 6) throw new Error("Six characters or more")
  await storeGmPassword(p)
  return { ok: true as const }
}

export async function setGmEmail(email: string) {
  if (!(await getServerSession(authOptions))) throw new Error("Sign in first")
  const e = email.trim()
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("That does not look like an email address")
  await db.appSetting.upsert({ where: { key: EMAIL_KEY }, create: { key: EMAIL_KEY, value: e }, update: { value: e } })
  return { ok: true as const }
}

// ─── Board ───────────────────────────────────────────────────────────

export interface BoardTask {
  slug: string
  title: string
  doneMeans: string
  dueOn: string
  dueLabel: string
  daysLeft: number
  done: boolean
  doneLabel: string | null
  note: string | null
}

export interface GmBoard {
  todayLabel: string
  weekStart: string
  weekLabel: string
  isoDay: number
  /** Where today sits in the Wed to Tue week (Wed = 0). */
  todayPos: number
  /** Position the desk went live at, in its launch week. 0 in every week after. */
  firstPosThisWeek: number
  gmDays: GmDays
  todayTheme: Exclude<GmTheme, "everyday"> | null
  items: BoardItem[]
  doneCount: number
  totalCount: number
  nextToPublish: string | null
  numbers: { wages: WeekNumbers; cogs: WeekNumbers }
  reviews: { lines: ReviewLine[]; fiveStarThisMonth: number }
  queue: StaffLine[]
  talksThisWeek: { id: string; name: string; when: string }[]
  sickThisMonth: { id: string; name: string; when: string; today: boolean }[]
  tasks: BoardTask[]
  report: { sent: boolean; sentLabel: string | null; fixed: string; need: string; preview: string }
  /** Null when push keys are not configured on the server. */
  pushKey: string | null
  pushDevices: number
}

async function ensureTasks(): Promise<void> {
  const have = new Set((await db.gmTask.findMany({ select: { slug: true } })).map((t) => t.slug))
  for (const s of GM_TASK_SEEDS) {
    const data = { title: s.title, doneMeans: s.doneMeans, dueOn: new Date(s.dueOn), sortOrder: s.sortOrder }
    if (!have.has(s.slug)) await db.gmTask.create({ data: { slug: s.slug, ...data } })
    // The plan file is the source of truth for wording and dates until a task is done.
    else await db.gmTask.updateMany({ where: { slug: s.slug, doneOn: null }, data })
  }
}

export async function getGmBoard(): Promise<GmBoard> {
  await guard()
  await ensureTasks()
  const weekStart = gmWeekStart()
  const monday = new Date(weekStart)
  const today = todayAest()
  const isoDay = today.getUTCDay() === 0 ? 7 : today.getUTCDay()

  const [gmDays, built, numbers, reviews, queue, talks, tasks, report] = await Promise.all([
    getGmDays(),
    buildItems(weekStart),
    getWeekNumbers(),
    getWeekReviews(weekStart),
    getOneOnOneQueue(),
    db.gmOneOnOne.findMany({ where: { heldOn: { gte: monday, lte: addDays(monday, 6) } }, orderBy: { createdAt: "asc" } }),
    db.gmTask.findMany({ orderBy: [{ dueOn: "asc" }, { sortOrder: "asc" }] }),
    db.gmReport.findUnique({ where: { weekStart: monday } }),
  ])
  const pushDevices = await db.gmPushSub.count()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const sick = await db.gmSickCall.findMany({ where: { calledOn: { gte: monthStart } }, orderBy: { createdAt: "desc" } })

  const items = built.items
  const doneCount = items.filter((i) => i.state === "done" || i.state === "auto-ok").length
  const weekLabel = `${short(monday)} to ${short(addDays(monday, 6))}`
  const todayTheme = gmDays[String(isoDay) as keyof GmDays] ?? null

  return {
    todayLabel: fmt(today, { weekday: "long", day: "numeric", month: "long" }),
    weekStart,
    weekLabel,
    isoDay,
    todayPos: gmWeekPos(isoDay),
    firstPosThisWeek: weekStart === GM_DESK_LAUNCH_WEEK ? GM_DESK_LAUNCH_POS : 0,
    gmDays,
    todayTheme,
    items,
    doneCount,
    totalCount: items.length,
    nextToPublish: built.auto.nextToPublish,
    numbers,
    reviews,
    queue,
    talksThisWeek: talks.map((t) => ({ id: t.id, name: t.staffName, when: short(t.heldOn) })),
    sickThisMonth: sick.map((c) => ({ id: c.id, name: c.staffName, when: short(c.calledOn), today: ymd(c.calledOn) === ymd(today) })),
    tasks: tasks.map((t) => ({
      slug: t.slug,
      title: t.title,
      doneMeans: t.doneMeans,
      dueOn: ymd(t.dueOn),
      dueLabel: short(t.dueOn),
      daysLeft: Math.round((t.dueOn.getTime() - today.getTime()) / 86400000),
      done: Boolean(t.doneOn),
      doneLabel: t.doneOn ? short(t.doneOn) : null,
      note: t.note,
    })),
    pushKey: pushPublicKey(),
    pushDevices,
    report: {
      sent: Boolean(report),
      sentLabel: report ? short(new Date(report.sentAt.getTime() + 10 * 3600000)) : null,
      fixed: report?.fixed ?? "",
      need: report?.need ?? "",
      preview: report?.body ?? composeReport({ weekLabel, items, numbers, talks: talks.map((t) => t.staffName), fixed: "", need: "" }),
    },
  }
}

// ─── Ticks ───────────────────────────────────────────────────────────

export async function markGmItem(p: { slug: string; met: boolean; note?: string; num1?: number | null; num2?: number | null }) {
  await guard()
  const item = GM_ITEMS.find((i) => i.slug === p.slug)
  if (!item) throw new Error("Unknown item")
  const note = p.note?.trim() || null
  if (!p.met && !note) return { ok: false as const, error: "One line on what happened, so next week is different." }
  if (p.met && item.noteOnDone && !note) return { ok: false as const, error: item.noteOnDone }
  const weekStart = new Date(gmWeekStart())
  const data = { met: p.met, note, num1: p.num1 ?? null, num2: p.num2 ?? null }
  await db.gmMark.upsert({
    where: { itemSlug_weekStart: { itemSlug: p.slug, weekStart } },
    create: { itemSlug: p.slug, weekStart, ...data },
    update: data,
  })
  bust()
  return { ok: true as const }
}

/** Undo: puts the item back to open (or back to the app's own reading). */
export async function clearGmMark(slug: string) {
  await guard()
  const weekStart = new Date(gmWeekStart())
  const row = await db.gmMark.findUnique({ where: { itemSlug_weekStart: { itemSlug: slug, weekStart } } })
  if (row) await db.gmMark.delete({ where: { id: row.id } })
  bust()
  return { ok: true as const }
}

export async function setGmDays(days: GmDays) {
  await guard()
  const clean: GmDays = {}
  for (const [k, v] of Object.entries(days)) {
    if (/^[1-7]$/.test(k) && (v === "rosters" || v === "kitchen" || v === "people")) clean[k as keyof GmDays] = v
  }
  await db.appSetting.upsert({
    where: { key: DAYS_KEY },
    create: { key: DAYS_KEY, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  })
  bust()
  return { ok: true as const }
}

// ─── Tasks ───────────────────────────────────────────────────────────

export async function setGmTaskDone(slug: string, done: boolean, note?: string) {
  await guard()
  await db.gmTask.update({
    where: { slug },
    data: { doneOn: done ? todayAest() : null, ...(note !== undefined ? { note: note.trim() || null } : {}) },
  })
  bust()
  return { ok: true as const }
}

// ─── One-on-ones ─────────────────────────────────────────────────────

export async function logOneOnOne(staffName: string, note?: string) {
  await guard()
  const name = staffName.trim()
  if (!name) throw new Error("Pick a name")
  await db.gmOneOnOne.create({ data: { staffName: name, heldOn: todayAest(), note: note?.trim() || null } })
  bust()
  return { ok: true as const }
}

/** Only this week's entries can be taken back (a mis-tap, not history). */
export async function undoOneOnOne(id: string) {
  await guard()
  const row = await db.gmOneOnOne.findUnique({ where: { id } })
  if (row && row.heldOn >= gmWeekStartOf(todayAest())) await db.gmOneOnOne.delete({ where: { id } })
  bust()
  return { ok: true as const }
}

// ─── Sick calls ──────────────────────────────────────────────────────

export async function logSickCall(staffName: string, daysAgo = 0) {
  await guard()
  const name = staffName.trim()
  if (!name) return { ok: false as const, error: "Pick a name" }
  const day = addDays(todayAest(), -Math.min(6, Math.max(0, Math.round(daysAgo))))
  await db.gmSickCall.create({ data: { staffName: name, calledOn: day } })
  bust()
  return { ok: true as const }
}

/** Only today's entries can be taken back (a mis-tap, not history). */
export async function undoSickCall(id: string) {
  await guard()
  const row = await db.gmSickCall.findUnique({ where: { id } })
  if (row && ymd(row.calledOn) === ymd(todayAest())) await db.gmSickCall.delete({ where: { id } })
  bust()
  return { ok: true as const }
}

// ─── Friday report ───────────────────────────────────────────────────

export async function sendFridayReport(p: { fixed: string; need: string }) {
  await guard()
  const fixed = p.fixed.trim()
  const need = p.need.trim()
  if (!fixed) return { ok: false as const, error: "Name one thing you fixed this week. One line is enough." }
  const weekStart = gmWeekStart()
  const monday = new Date(weekStart)
  const [built, numbers, talks, sick] = await Promise.all([
    buildItems(weekStart),
    getWeekNumbers(),
    db.gmOneOnOne.findMany({ where: { heldOn: { gte: monday, lte: addDays(monday, 6) } } }),
    db.gmSickCall.findMany({ where: { calledOn: { gte: monday, lte: addDays(monday, 6) } }, orderBy: { calledOn: "asc" } }),
  ])
  const weekLabel = `${short(monday)} to ${short(addDays(monday, 6))}`
  const body = composeReport({ weekLabel, items: built.items, numbers, talks: talks.map((t) => t.staffName), sick: sick.map((c) => `${c.staffName} (${short(c.calledOn)})`), fixed, need })
  try {
    await sendEmail({ to: REPORT_TO, subject: `Oliver's Monday report, ${weekLabel}`, body })
  } catch {
    return { ok: false as const, error: "The email did not send. Try again in a minute, or tell Chloe." }
  }
  await db.gmReport.upsert({
    where: { weekStart: monday },
    create: { weekStart: monday, fixed, need, body },
    update: { fixed, need, body, sentAt: new Date() },
  })
  bust()
  return { ok: true as const }
}

// ─── Month ───────────────────────────────────────────────────────────

export interface MonthRow { label: string; target: string; thisMonth: string; lastMonth: string }
export interface GmMonth {
  thisLabel: string
  lastLabel: string
  thisKey: string
  rows: MonthRow[]
  manual: { slug: string; label: string; target: string; thisMonth: string; lastMonth: string }[]
}

async function monthFigures(first: Date): Promise<Record<string, string>> {
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1))
  const inMonth = { gte: first, lt: next }
  const [cogs, waste, marks, talks, fives, labourWeeks, sick] = await Promise.all([
    db.weeklyCogs.findMany({ where: { venue: "BURLEIGH", weekStartWed: inMonth, cogsPct: { not: null } }, select: { cogsPct: true } }),
    db.wasteEntry.aggregate({ where: { venue: "BURLEIGH", date: inMonth }, _sum: { estimatedCost: true } }),
    db.gmMark.findMany({ where: { weekStart: inMonth } }),
    db.gmOneOnOne.count({ where: { heldOn: inMonth } }),
    db.googleReview.count({
      where: { venue: "BURLEIGH", rating: 5, publishTime: { gte: new Date(first.getTime() - 10 * 3600000), lt: new Date(next.getTime() - 10 * 3600000) } },
    }),
    db.labourWeekActual.findMany({
      where: { venue: "BURLEIGH", weekStartWed: inMonth, revenueExGst: { not: null } },
      select: { revenueExGst: true, grossWagesExAdmin: true, grossWages: true, wagesAdmin: true },
    }),
    db.gmSickCall.groupBy({ by: ["staffName"], where: { calledOn: inMonth }, _count: true }),
  ])
  const out: Record<string, string> = {}
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const c = avg(cogs.map((x) => Number(x.cogsPct)))
  out.cogs = c != null ? `${c.toFixed(1)}%` : ""
  const wagePcts = labourWeeks.map((w) => {
    const rev = Number(w.revenueExGst)
    const exAdmin = w.grossWagesExAdmin != null ? Number(w.grossWagesExAdmin) : Number(w.grossWages) - Number(w.wagesAdmin ?? 0)
    // Same standing cross-venue adjustment the desk tile and the digest apply.
    return rev > 0 ? ((exAdmin + CROSS_VENUE_WEEKLY_TOTAL) / rev) * 100 : null
  }).filter((x): x is number => x != null)
  const wg = avg(wagePcts)
  out.wage = wg != null ? `${wg.toFixed(1)}%` : ""
  out.prime = wg != null && c != null ? `${(wg + c).toFixed(1)}%` : ""
  const weeksInMonth = Math.max(1, Math.min(5, Math.round((Math.min(next.getTime(), todayAest().getTime() + 86400000) - first.getTime()) / (7 * 86400000)) || 1))
  const wasteTotal = Number(waste._sum.estimatedCost ?? 0)
  out.wastage = wasteTotal > 0 ? `$${Math.round(wasteTotal / weeksInMonth)}` : ""
  const tally = (slug: string) => {
    const rows = marks.filter((m) => m.itemSlug === slug)
    return rows.length ? `${rows.filter((m) => m.met).length} of ${rows.length} weeks` : ""
  }
  out.roster = tally("roster-2wk")
  out.openShifts = tally("open-shifts")
  out.hours = tally("hours-vs-roster")
  out.checklists = tally("checklists")
  const walks = marks.filter((m) => m.itemSlug === "label-walk" && m.met)
  out.outOfDate = walks.length ? String(walks.reduce((s, m) => s + (m.num1 ?? 0), 0)) : ""
  out.unlabelled = walks.length ? (walks.reduce((s, m) => s + (m.num2 ?? 0), 0) / walks.length).toFixed(1) : ""
  out.quality = String(marks.filter((m) => m.itemSlug === "quality-fix" && m.met).length || "")
  out.talks = talks ? String(talks) : ""
  out.fives = fives ? String(fives) : ""
  const sickTotal = sick.reduce((n, r) => n + r._count, 0)
  const repeat = sick.filter((r) => r._count >= 2).sort((a, b) => b._count - a._count).map((r) => `${r.staffName} ${r._count}`)
  out.sick = sickTotal ? `${sickTotal}${repeat.length ? ` (${repeat.join(", ")})` : ""}` : "0"
  return out
}

export async function getGmMonth(): Promise<GmMonth> {
  await guard()
  const today = todayAest()
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const [a, b, manualRows] = await Promise.all([
    monthFigures(first),
    monthFigures(prev),
    db.gmMonthly.findMany({ where: { month: { in: [first, prev] } } }),
  ])
  const row = (label: string, target: string, key: string): MonthRow => ({ label, target, thisMonth: a[key] ?? "", lastMonth: b[key] ?? "" })
  const mval = (m: Date, slug: string) => manualRows.find((r) => ymd(r.month) === ymd(m) && r.slug === slug)?.value ?? ""
  return {
    thisLabel: fmt(first, { month: "long" }),
    lastLabel: fmt(prev, { month: "long" }),
    thisKey: ymd(first),
    rows: [
      row("Venue wage %, ex admin", "38% or under", "wage"),
      row("COGS %", "26% or under", "cogs"),
      row("Prime cost (wages + COGS)", "64% or under", "prime"),
      row("Wastage, average per week", "$400 or under", "wastage"),
      row("Roster live two weeks ahead", "every week", "roster"),
      row("No open shifts 7 days out", "every week", "openShifts"),
      row("Worked hours within 3% of roster", "every week", "hours"),
      row("Daily checklists at 95% or better", "every week", "checklists"),
      row("Label walk: out-of-date items, total", "0", "outOfDate"),
      row("Label walk: unlabelled, average per walk", "3 or fewer", "unlabelled"),
      row("Quality problems found and fixed", "4 or more", "quality"),
      row("One-on-ones", "16 or more", "talks"),
      row("Five-star Google reviews", "20 or more", "fives"),
      row("Sick calls, all staff (repeat callers in brackets)", "4 or fewer", "sick"),
    ],
    manual: GM_MONTHLY_MANUAL.map((m) => ({ ...m, thisMonth: mval(first, m.slug), lastMonth: mval(prev, m.slug) })),
  }
}

export async function saveGmMonthly(slug: string, value: string) {
  await guard()
  if (!GM_MONTHLY_MANUAL.some((m) => m.slug === slug)) throw new Error("Unknown number")
  const today = todayAest()
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const v = value.trim().slice(0, 40)
  await db.gmMonthly.upsert({
    where: { month_slug: { month, slug } },
    create: { month, slug, value: v },
    update: { value: v },
  })
  bust()
  return { ok: true as const }
}


// ─── Phone alerts ────────────────────────────────────────────────────

export async function saveGmPush(sub: { endpoint: string; p256dh: string; auth: string; label?: string }) {
  await guard()
  if (!/^https:\/\//.test(sub.endpoint) || !sub.p256dh || !sub.auth) return { ok: false as const, error: "This phone did not give a usable alert address." }
  const data = { p256dh: sub.p256dh, auth: sub.auth, label: sub.label?.slice(0, 80) ?? null }
  await db.gmPushSub.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data })
  const r = await sendGmPush("Alerts are on", "This is where your GM day list and the Friday nudge will land.")
  bust()
  return r.sent > 0 ? { ok: true as const } : { ok: false as const, error: "Saved, but the test alert did not send. Tell Chloe." }
}

export async function removeGmPush(endpoint: string) {
  await guard()
  const row = await db.gmPushSub.findUnique({ where: { endpoint } })
  if (row) await db.gmPushSub.delete({ where: { id: row.id } })
  bust()
  return { ok: true as const }
}

// ─── Tracking: week by week ──────────────────────────────────────────

export interface TrackWeek {
  label: string
  current: boolean
  done: string
  wagePct: string
  cogsPct: string
  wastage: string
}

export async function getGmTracking(): Promise<TrackWeek[]> {
  await guard()
  const thisWed = gmWeekStartOf(todayAest())
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWed, -7 * i))
  const oldest = weeks[weeks.length - 1]
  const [marks, actuals, cogs, waste, live] = await Promise.all([
    db.gmMark.findMany({ where: { weekStart: { gte: oldest } }, select: { weekStart: true, met: true } }),
    db.labourWeekActual.findMany({ where: { venue: "BURLEIGH", weekStartWed: { gte: oldest }, revenueExGst: { not: null } } }),
    db.weeklyCogs.findMany({ where: { venue: "BURLEIGH", weekStartWed: { gte: oldest }, cogsPct: { not: null } } }),
    db.wasteEntry.findMany({ where: { venue: "BURLEIGH", date: { gte: oldest } }, select: { date: true, estimatedCost: true } }),
    buildItems(ymd(thisWed)),
  ])
  return weeks.map((thu, idx) => {
    // Same Wed to Tue week as payroll and COGS, so the columns line up exactly.
    const wed = ymd(thu)
    const a = actuals.find((x) => ymd(x.weekStartWed) === wed)
    const c = cogs.find((x) => ymd(x.weekStartWed) === wed)
    const rev = a?.revenueExGst != null ? Number(a.revenueExGst) : 0
    const exAdmin = a ? (a.grossWagesExAdmin != null ? Number(a.grossWagesExAdmin) : Number(a.grossWages) - Number(a.wagesAdmin ?? 0)) : 0
    const end = addDays(thu, 6)
    const w = waste.filter((x) => x.date >= thu && x.date <= end).reduce((sum, x) => sum + Number(x.estimatedCost), 0)
    const mine = marks.filter((m) => ymd(m.weekStart) === ymd(thu))
    const done = idx === 0
      ? `${live.items.filter((i) => i.state === "done" || i.state === "auto-ok").length} of ${GM_ITEMS.length}`
      : mine.length ? `${mine.filter((m) => m.met).length} of ${GM_ITEMS.length}` : ""
    return {
      label: `${short(thu)} to ${short(end)}`,
      current: idx === 0,
      done,
      wagePct: rev > 0 && exAdmin > 0 ? `${(((exAdmin + CROSS_VENUE_WEEKLY_TOTAL) / rev) * 100).toFixed(1)}%` : "",
      cogsPct: c?.cogsPct != null ? `${Number(c.cogsPct).toFixed(1)}%` : "",
      wastage: w > 0 ? `$${Math.round(w)}` : "",
    }
  })
}

// ─── Live trackers (Burleigh only) ───────────────────────────────────

export interface GmLive {
  weekLabel: string
  daysIn: number
  cogs: {
    spent: number
    revenue: number | null
    revenueDays: number
    actualPct: number | null
    targetPct: number
    budget: number | null
    daily: { day: string; amount: number }[]
    suppliers: { supplier: string; amount: number; usual: number | null }[]
  } | null
  /** Empty until Tarte Shifts is the source: Deputy's live numbers are not trusted for this. */
  wages: { label: string; pct: string; target: string; status: "ok" | "amber" | "red" | "none" }[]
}

export async function getGmLive(): Promise<GmLive> {
  await guard()
  const spend = await getCurrentWeekSpend()
  const b = spend.buckets.find((x) => x.bucket === "BURLEIGH")
  const revenue = b?.revenueToDateExGst ?? null
  // Only what has actually been invoiced against what has actually been sold.
  // No projections: early in the week they swing on delivery days and mislead.
  const actualPct = b && revenue && revenue > 0 ? Math.round((b.spentToDate / revenue) * 1000) / 10 : null
  let wages: GmLive["wages"] = []
  if (process.env.GM_LIVE_WAGES === "1") {
    const labour = await getLiveLabourSnapshot().catch(() => null)
    const v = labour?.venues.find((x) => x.venue === "BURLEIGH")
    wages = (v?.buckets ?? []).filter((x) => x.target).map((x) => ({
      label: x.label,
      pct: x.projectedPct != null ? `${x.projectedPct.toFixed(1)}%` : "",
      target: x.target ? `${x.target.min} to ${x.target.max}%` : "",
      status: x.status === "no-target" ? "none" : x.status,
    }))
  }
  return {
    weekLabel: `${short(new Date(spend.weekStartWed))} to ${short(new Date(spend.weekEndTue))}`,
    daysIn: spend.dayOfWeek,
    cogs: b
      ? {
          spent: Math.round(b.spentToDate),
          revenue: revenue != null ? Math.round(revenue) : null,
          revenueDays: b.revenueDaysReported,
          actualPct,
          targetPct: b.targetPct,
          budget: b.budget != null ? Math.round(b.budget) : null,
          daily: b.daily.map((d) => ({ day: d.dayName, amount: Math.round(d.amount) })),
          suppliers: [...b.suppliers].sort((x, y) => y.amount - x.amount).slice(0, 10).map((x) => ({ supplier: x.supplier, amount: Math.round(x.amount), usual: x.fourWeekAvg != null ? Math.round(x.fourWeekAvg) : null })),
        }
      : null,
    wages,
  }
}

// ─── Reviews, last 4 weeks ───────────────────────────────────────────

export interface GmReviewRow {
  id: string
  rating: number
  who: string
  when: string
  text: string
  themes: string[]
  staff: string[]
  replied: boolean
}

const THEME_WORDS: Record<string, string> = {
  FOOD_QUALITY: "Food", COFFEE: "Coffee", PASTRY: "Pastry", SERVICE: "Service", SPEED: "Speed", AMBIENCE: "Atmosphere",
  VALUE: "Value", CLEANLINESS: "Cleanliness", STAFF_PRAISE: "Staff praised", STAFF_COMPLAINT: "Staff complaint", WAIT_TIME: "Wait time",
  ALLERGEN: "Allergen", KIDS: "Kids", DIETARY: "Dietary", RESERVATION: "Bookings", OTHER: "Other",
}

export async function getGmReviews(): Promise<{ negative: GmReviewRow[]; positive: GmReviewRow[]; themes: { theme: string; positive: number; negative: number }[]; fiveStarThisMonth: number }> {
  await guard()
  const today = todayAest()
  const since = new Date(addDays(today, -28).getTime() - 10 * 3600000)
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) - 10 * 3600000)
  const [rows, fives] = await Promise.all([
    db.googleReview.findMany({
      where: { venue: "BURLEIGH", publishTime: { gte: since } },
      orderBy: { publishTime: "desc" },
      select: { id: true, rating: true, authorName: true, text: true, publishTime: true, themes: true, staffMentions: true, replyText: true },
    }),
    db.googleReview.count({ where: { venue: "BURLEIGH", rating: 5, publishTime: { gte: monthStart } } }),
  ])
  const toRow = (r: (typeof rows)[number]): GmReviewRow => ({
    id: r.id,
    rating: r.rating,
    who: (r.authorName ?? "Guest").split(" ")[0],
    when: short(new Date(r.publishTime.getTime() + 10 * 3600000)),
    text: r.text ?? "",
    themes: r.themes.map((t) => THEME_WORDS[t] ?? t),
    staff: r.staffMentions,
    replied: Boolean(r.replyText),
  })
  const tally = new Map<string, { positive: number; negative: number }>()
  for (const r of rows) {
    for (const t of r.themes) {
      const k = THEME_WORDS[t] ?? t
      const c = tally.get(k) ?? { positive: 0, negative: 0 }
      if (r.rating >= 4) c.positive++
      else c.negative++
      tally.set(k, c)
    }
  }
  return {
    negative: rows.filter((r) => r.rating <= 3).sort((a, b) => a.rating - b.rating).map(toRow),
    positive: rows.filter((r) => r.rating >= 4).map(toRow),
    themes: [...tally.entries()].map(([theme, c]) => ({ theme, ...c })).sort((a, b) => b.negative - a.negative || b.positive - a.positive),
    fiveStarThisMonth: fives,
  }
}
