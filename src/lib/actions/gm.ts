"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkGmPassword, isGmAuthed, setGmCookie, storeGmPassword } from "@/lib/gm-auth"
import { addDays, currentWeekStart, mondayOf, todayAest, ymd } from "@/lib/commitments/weeks"
import { sendEmail } from "@/lib/gmail/send"
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
/** Desk went live Fri 18 Sep 2026: that week's earlier GM days are not "missed". */
const GM_DESK_LAUNCH_WEEK = "2026-09-14"
const GM_DESK_LAUNCH_ISODAY = 5
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
  if (!(await checkGmPassword(password))) {
    return { ok: false as const, error: "That's not it. Ask Chloe." }
  }
  await setGmCookie()
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
  /** ISO weekday the desk went live, in its launch week. 1 in every week after. */
  firstDayThisWeek: number
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
  tasks: BoardTask[]
  report: { sent: boolean; sentLabel: string | null; fixed: string; need: string; preview: string }
}

async function ensureTasks(): Promise<void> {
  const have = new Set((await db.gmTask.findMany({ select: { slug: true } })).map((t) => t.slug))
  for (const s of GM_TASK_SEEDS) {
    if (have.has(s.slug)) continue
    await db.gmTask.create({
      data: { slug: s.slug, title: s.title, doneMeans: s.doneMeans, dueOn: new Date(s.dueOn), sortOrder: s.sortOrder },
    })
  }
}

export async function getGmBoard(): Promise<GmBoard> {
  await guard()
  await ensureTasks()
  const weekStart = currentWeekStart()
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

  const items = built.items
  const doneCount = items.filter((i) => i.state === "done" || i.state === "auto-ok").length
  const weekLabel = `${short(monday)} to ${short(addDays(monday, 6))}`
  const todayTheme = gmDays[String(isoDay) as keyof GmDays] ?? null

  return {
    todayLabel: fmt(today, { weekday: "long", day: "numeric", month: "long" }),
    weekStart,
    weekLabel,
    isoDay,
    firstDayThisWeek: weekStart === GM_DESK_LAUNCH_WEEK ? GM_DESK_LAUNCH_ISODAY : 1,
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
  const weekStart = new Date(currentWeekStart())
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
  const weekStart = new Date(currentWeekStart())
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
  if (row && row.heldOn >= mondayOf(todayAest())) await db.gmOneOnOne.delete({ where: { id } })
  bust()
  return { ok: true as const }
}

// ─── Friday report ───────────────────────────────────────────────────

export async function sendFridayReport(p: { fixed: string; need: string }) {
  await guard()
  const fixed = p.fixed.trim()
  const need = p.need.trim()
  if (!fixed) return { ok: false as const, error: "Name one thing you fixed this week. One line is enough." }
  const weekStart = currentWeekStart()
  const monday = new Date(weekStart)
  const [built, numbers, talks] = await Promise.all([
    buildItems(weekStart),
    getWeekNumbers(),
    db.gmOneOnOne.findMany({ where: { heldOn: { gte: monday, lte: addDays(monday, 6) } } }),
  ])
  const weekLabel = `${short(monday)} to ${short(addDays(monday, 6))}`
  const body = composeReport({ weekLabel, items: built.items, numbers, talks: talks.map((t) => t.staffName), fixed, need })
  try {
    await sendEmail({ to: REPORT_TO, subject: `Oliver's Friday report, ${weekLabel}`, body })
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
  const [cogs, waste, marks, talks, fives, labourWeeks] = await Promise.all([
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
  ])
  const out: Record<string, string> = {}
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const c = avg(cogs.map((x) => Number(x.cogsPct)))
  out.cogs = c != null ? `${c.toFixed(1)}%` : ""
  const wagePcts = labourWeeks.map((w) => {
    const rev = Number(w.revenueExGst)
    const exAdmin = w.grossWagesExAdmin != null ? Number(w.grossWagesExAdmin) : Number(w.grossWages) - Number(w.wagesAdmin ?? 0)
    return rev > 0 ? (exAdmin / rev) * 100 : null
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

