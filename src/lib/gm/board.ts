/**
 * Shared GM desk read model. Plain server module (not "use server"), so
 * nothing here is reachable as a client-callable action: the actions file
 * guards with the GM cookie, the cron route guards with CRON_SECRET.
 */

import { db } from "@/lib/db"
import { addDays, todayAest } from "@/lib/commitments/weeks"
import { gmWeekStart } from "./week"
import { DEFAULT_GM_DAYS, GM_ITEMS, type GmDays, type GmItem } from "./plan"
import { dayLabel, getAutoReadings, getWeekNumbers, type AutoReading, type WeekNumbers } from "./readings"
import { renderGmReportHtml } from "./report-email"

const DAYS_KEY = "gmDays"
const EMAIL_KEY = "gmEmail"

export type ItemState = "done" | "couldnt" | "auto-ok" | "auto-bad" | "open"

export interface BoardItem extends GmItem {
  state: ItemState
  note: string | null
  num1: number | null
  num2: number | null
  auto_: AutoReading | null
  manual: boolean
}

export const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" })
export const short = dayLabel

export async function getGmDays(): Promise<GmDays> {
  const row = await db.appSetting.findUnique({ where: { key: DAYS_KEY } })
  if (!row?.value) return DEFAULT_GM_DAYS
  try { return JSON.parse(row.value) as GmDays } catch { return DEFAULT_GM_DAYS }
}

export async function getGmEmail(): Promise<string> {
  return (await db.appSetting.findUnique({ where: { key: EMAIL_KEY } }))?.value ?? ""
}

function stateOf(mark: { met: boolean } | undefined, auto: AutoReading | null): ItemState {
  if (mark) return mark.met ? "done" : "couldnt"
  if (auto?.met === true) return "auto-ok"
  if (auto?.met === false) return "auto-bad"
  return "open"
}

export async function buildItems(weekStart: string) {
  const [marks, auto] = await Promise.all([
    db.gmMark.findMany({ where: { weekStart: new Date(weekStart) } }),
    getAutoReadings(weekStart),
  ])
  const byslug = new Map(marks.map((m) => [m.itemSlug, m]))
  const items: BoardItem[] = GM_ITEMS.map((it) => {
    const m = byslug.get(it.slug)
    const a = it.auto ? auto.readings[it.auto] : null
    return {
      ...it,
      state: stateOf(m, a),
      note: m?.note ?? null,
      num1: m?.num1 ?? null,
      num2: m?.num2 ?? null,
      auto_: a,
      manual: Boolean(m),
    }
  })
  return { items, auto }
}

export function composeReport(p: {
  weekLabel: string
  items: BoardItem[]
  numbers: { wages: WeekNumbers; cogs: WeekNumbers }
  talks: string[]
  /** Names of this week's sick calls, with dates. */
  sick?: string[]
  fixed: string
  need: string
  /** False when Chloe is being told the report never came. */
  sent?: boolean
}): string {
  const done = p.items.filter((i) => i.state === "done" || i.state === "auto-ok")
  const notDone = p.items.filter((i) => !(i.state === "done" || i.state === "auto-ok") && i.slug !== "weekly-report")
  const lines: string[] = []
  lines.push(`Oliver's week, ${p.weekLabel}`)
  lines.push("")
  lines.push(`Done: ${done.length + (p.sent === false ? 0 : 1)} of ${p.items.length}.`)
  if (notDone.length) {
    lines.push("")
    lines.push("Not done:")
    for (const i of notDone) {
      const why = i.note ? ` (${i.note})` : i.auto_?.detail ? ` (${i.auto_.detail})` : ""
      lines.push(`- ${i.title}${why}`)
    }
  }
  lines.push("")
  if (p.numbers.wages.tiles.length) {
    lines.push(`Wages, week ${p.numbers.wages.weekLabel}: ` + p.numbers.wages.tiles.map((t) => `${t.label} ${t.value}`).join(", ") + ".")
  }
  if (p.numbers.cogs.tiles.length) {
    lines.push(`COGS, week ${p.numbers.cogs.weekLabel}: ${p.numbers.cogs.tiles[0].value}.`)
  }
  const get = (slug: string) => p.items.find((i) => i.slug === slug)
  const w = get("wastage")?.auto_?.detail
  if (w) lines.push(`Wastage: ${w}`)
  const r = get("roster-2wk")?.auto_?.detail
  if (r) lines.push(`Roster: ${r}`)
  const o = get("open-shifts")?.auto_?.detail
  if (o) lines.push(`Open shifts: ${o}`)
  const lw = get("label-walk")
  if (lw?.manual && lw.state === "done") lines.push(`Label walk: ${lw.num1 ?? 0} out of date, ${lw.num2 ?? 0} unlabelled.`)
  lines.push(`One-on-ones: ${p.talks.length}${p.talks.length ? ` (${p.talks.join(", ")})` : ""}.`)
  if (p.sick && p.sick.length) lines.push(`Sick calls this week: ${p.sick.join(", ")}.`)
  const q = get("quality-fix")
  if (q?.note) lines.push(`Quality fix: ${q.note}`)
  lines.push("")
  lines.push(`One thing fixed: ${p.fixed || "(blank)"}`)
  lines.push(`One thing I need from Chloe: ${p.need || "Nothing this week."}`)
  return lines.join("\n")
}

// ─── Nudge cron read model ───────────────────────────────────────────

export async function gmDigestForCron() {
  const weekStart = gmWeekStart()
  const monday = new Date(weekStart)
  const [built, numbers, talks, gmDays, report, email, tasks, sick] = await Promise.all([
    buildItems(weekStart),
    getWeekNumbers(),
    db.gmOneOnOne.findMany({ where: { heldOn: { gte: monday, lte: addDays(monday, 6) } } }),
    getGmDays(),
    db.gmReport.findUnique({ where: { weekStart: monday } }),
    getGmEmail(),
    db.gmTask.findMany({ where: { doneOn: null }, orderBy: { dueOn: "asc" } }),
    db.gmSickCall.findMany({ where: { calledOn: { gte: monday, lte: addDays(monday, 6) } }, orderBy: { calledOn: "asc" } }),
  ])
  const weekLabel = `${short(monday)} to ${short(addDays(monday, 6))}`
  return {
    weekStart,
    weekLabel,
    items: built.items,
    numbers,
    talks: talks.map((t) => t.staffName),
    gmDays,
    reportSent: Boolean(report),
    email,
    openTasks: tasks.map((t) => ({ title: t.title, dueLabel: short(t.dueOn), daysLeft: Math.round((t.dueOn.getTime() - todayAest().getTime()) / 86400000) })),
    compose: (fixed: string, need: string) => composeReport({ weekLabel, items: built.items, numbers, talks: talks.map((t) => t.staffName), sick: sick.map((c) => `${c.staffName} (${short(c.calledOn)})`), fixed, need, sent: false }),
    composeHtml: (fixed: string, need: string) => renderGmReportHtml({ weekLabel, items: built.items, numbers, talks: talks.map((t) => t.staffName), sick: sick.map((c) => `${c.staffName} (${short(c.calledOn)})`), fixed, need, sent: false }),
  }
}
