/**
 * Branded HTML for the GM desk's emails. The plain-text twins live in
 * board.ts (composeReport) and the nudge route; these render the same facts
 * so Chloe and Oliver can take them in at a glance on a phone.
 */

import { APP_URL, button, callout, list, rows, section, shell, tiles, type ListItem, type Tile } from "@/lib/email/brand"
import type { BoardItem } from "./board"
import type { WeekNumbers } from "./readings"
import { THEME_LABEL, type GmTheme } from "./plan"

const DESK = `${APP_URL}/kitchen/gm`

export interface GmReportParams {
  weekLabel: string
  items: BoardItem[]
  numbers: { wages: WeekNumbers; cogs: WeekNumbers }
  talks: string[]
  sick?: string[]
  fixed: string
  need: string
  /** False when Chloe is being told the report never came. */
  sent?: boolean
}

function isDone(i: BoardItem) {
  return i.state === "done" || i.state === "auto-ok"
}

export function renderGmReportHtml(p: GmReportParams): string {
  const sent = p.sent !== false
  const done = p.items.filter(isDone)
  const notDone = p.items.filter((i) => !isDone(i) && i.slug !== "weekly-report")
  const doneCount = done.length + (sent ? 1 : 0)
  const total = p.items.length
  const get = (slug: string) => p.items.find((i) => i.slug === slug)

  const sections: string[] = []

  if (!sent) {
    sections.push(callout("Oliver has not sent his Monday report. This is what the app can see for the week.", "warn", { label: "Not sent" }))
  }

  // Headline: how much of the week got done, with the two money numbers.
  const doneTone = doneCount === total ? "done" : doneCount >= total - 2 ? "gold" : "warn"
  const headTiles: Tile[] = [
    { label: "Done this week", value: `${doneCount} of ${total}`, sub: notDone.length ? `${notDone.length} not done` : "Everything ticked", tone: doneTone },
  ]
  const venueWage = p.numbers.wages.tiles[0]
  if (venueWage) headTiles.push({ label: "Wages", value: venueWage.value, sub: [venueWage.label, p.numbers.wages.weekLabel ? `week ${p.numbers.wages.weekLabel}` : null].filter(Boolean).join(", ") })
  const cogs = p.numbers.cogs.tiles[0]
  if (cogs) headTiles.push({ label: "COGS", value: cogs.value, sub: p.numbers.cogs.weekLabel ? `week ${p.numbers.cogs.weekLabel}` : undefined })
  sections.push(tiles(headTiles))

  // What did not get done, with Oliver's reason or the app's reading.
  if (notDone.length) {
    const items: ListItem[] = notDone.map((i) => ({
      text: i.title,
      detail: i.note ?? i.auto_?.detail ?? undefined,
      tone: i.state === "couldnt" || i.state === "auto-bad" ? "warn" : "neutral",
    }))
    sections.push(section("Not done", list(items), { tone: "warn" }))
  }

  // From Oliver.
  sections.push(
    section(
      "From Oliver",
      [
        callout(p.fixed || (sent ? "(blank)" : "(not sent)"), "done", { label: "One thing fixed" }),
        `<div style="height:10px;"></div>`,
        callout(p.need || (sent ? "Nothing this week." : "(not sent)"), "gold", { label: "One thing I need from Chloe" }),
      ].join("")
    )
  )

  // Wages by department.
  const wageRows = p.numbers.wages.tiles.slice(1).map((t) => ({ label: t.label, value: t.value }))
  if (wageRows.length) {
    sections.push(section("Wages by department", rows(wageRows), { note: p.numbers.wages.weekLabel ? `Week ${p.numbers.wages.weekLabel}` : undefined }))
  }

  // Readings the app took itself.
  const readings: { label: string; value: string }[] = []
  const w = get("wastage")?.auto_?.detail
  if (w) readings.push({ label: "Wastage", value: w })
  const r = get("roster-2wk")?.auto_?.detail
  if (r) readings.push({ label: "Roster", value: r })
  const o = get("open-shifts")?.auto_?.detail
  if (o) readings.push({ label: "Open shifts", value: o })
  const lw = get("label-walk")
  if (lw?.manual && lw.state === "done") readings.push({ label: "Label walk", value: `${lw.num1 ?? 0} out of date, ${lw.num2 ?? 0} unlabelled` })
  readings.push({ label: "One-on-ones", value: p.talks.length ? `${p.talks.length}: ${p.talks.join(", ")}` : "None" })
  if (p.sick && p.sick.length) readings.push({ label: "Sick calls", value: p.sick.join("\n") })
  const q = get("quality-fix")
  if (q?.note) readings.push({ label: "Quality fix", value: q.note })
  sections.push(section("The week in numbers", rows(readings)))

  // Everything that did get done, compact, so the 18 of 20 is checkable.
  if (done.length) {
    sections.push(
      section(
        `Done (${done.length})`,
        list(done.map((i) => ({ text: i.title, detail: i.note ?? undefined, tone: "done" as const })))
      )
    )
  }

  sections.push(`<div style="padding:0 4px;">${button("Open the GM desk", DESK, { secondary: true })}</div>`)

  return shell({
    kicker: "GM weekly report",
    title: sent ? "Oliver's week" : "No report from Oliver",
    subtitle: p.weekLabel,
    preheader: `Done ${doneCount} of ${total}.${notDone.length ? ` Not done: ${notDone.map((i) => i.title).join(", ")}.` : ""}`,
    sections,
  })
}

// ─── Nudges to Oliver ──────────────────────────────────────────────

export interface NudgeItem {
  title: string
  detail?: string
}

export function renderMorningNudgeHtml(p: {
  theme: GmTheme
  todays: NudgeItem[]
  carried: NudgeItem[]
  next: { title: string; dueLabel: string; daysLeft: number } | null
}): string {
  const sections: string[] = []
  sections.push(
    section(
      "Today",
      p.todays.length ? list(p.todays.map((i) => ({ text: i.title, detail: i.detail, tone: "sage" as const }))) : callout("Nothing left for today.", "done")
    )
  )
  if (p.carried.length) {
    sections.push(section("Still open from earlier this week", list(p.carried.map((i) => ({ text: i.title, tone: "warn" as const })))))
  }
  if (p.next) {
    const late = p.next.daysLeft < 0
    sections.push(
      callout(`${p.next.title}. Due ${p.next.dueLabel}, ${late ? `${Math.abs(p.next.daysLeft)} days late` : `${p.next.daysLeft} days left`}.`, late ? "warn" : "gold", { label: "Next deadline" })
    )
  }
  sections.push(`<div style="padding:0 4px;">${button("Tick them off", DESK)}</div>`)
  return shell({
    kicker: "GM day",
    title: THEME_LABEL[p.theme],
    subtitle: `${p.todays.length} to do today`,
    sections,
  })
}

export function renderAfternoonNudgeHtml(p: { todays: NudgeItem[] }): string {
  return shell({
    kicker: "GM day",
    title: `${p.todays.length} still open today`,
    sections: [
      section(null, list(p.todays.map((i) => ({ text: i.title, tone: "warn" as const })))),
      `<div style="padding:0 4px;">${button("Tick them off", DESK)}</div>`,
    ],
  })
}

export function renderReportDueHtml(p: { stillOpen: number }): string {
  return shell({
    kicker: "Monday report",
    title: "Your Monday report is due at 3pm",
    subtitle: "Before your two days off.",
    sections: [
      callout("The numbers are already filled in. Add two lines and press send.", "gold"),
      section(null, rows([{ label: "Still open this week", value: String(p.stillOpen), tone: p.stillOpen ? "warn" : "done" }])),
      `<div style="padding:0 4px;">${button("Write the two lines", DESK)}</div>`,
    ],
  })
}
