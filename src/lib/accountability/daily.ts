import { db } from "@/lib/db"
import { DEPT_LABEL } from "@/lib/departments"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/client"
import { BRAND, FONT_BODY, FONT_DISPLAY, callout, section as card, shell, tiles, toneColours, type Tone } from "@/lib/email/brand"
import { uberDay, uberDailyRows } from "@/lib/uber/live"
import { getUberConnection, uberStores } from "@/lib/uber/token"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate } from "@/lib/sales/compare"

/**
 * End-of-day accountability email. Chloe, 18 Sep 2026: "an email end of
 * every day summarising what is on the meeting agenda, needs to be fixed,
 * or needs to be ordered so I can create accountability."
 *
 * One email, per venue, four lists, each line with a name and how long it
 * has sat there. Nothing is invented: it reads the same tables the boards
 * read. Recipients from ACCOUNTABILITY_TO (comma list), default Chloe,
 * Shawna and the hello@ inbox.
 */

const DEFAULT_TO = ["chloe@tarte.com.au", "shawna@tarte.com.au", "hello@tarte.com.au"]
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const DAY_MS = 86_400_000

export function accountabilityRecipients(): string[] {
  const raw = process.env.ACCOUNTABILITY_TO?.trim()
  if (!raw) return DEFAULT_TO
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_TO
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://kitchen.tarte.com.au").replace(/\/$/, "")
}

function daysOpen(since: Date, now: Date): string {
  const d = Math.floor((now.getTime() - since.getTime()) / DAY_MS)
  if (d <= 0) return "today"
  if (d === 1) return "1 day"
  return `${d} days`
}

function esc(s: string): string {
  // Stored names sometimes carry dashes ("Meiko dishwasher — Takeaway");
  // house style is a comma.
  return s.replace(/\s+[—–]\s+/g, ", ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

interface Line {
  text: string
  who: string | null
  age: string
  /// Sits for attention: no owner, overdue, safety, or old.
  flag: string | null
}

interface VenueBlock {
  venue: Venue
  agenda: Line[]
  fixes: Line[]
  jobs: Line[]
  orders: Line[]
}

/** Uber Eats for the day, per shop. Menu value inc GST before Uber's cut; never in a venue total. */
export interface UberEodRow { venue: Venue; name: string; sales: number; orders: number; lastWeek: number | null; live: boolean; error: string | null }

export interface DailyAccountability {
  date: string
  venues: VenueBlock[]
  /// Null when Uber Eats is not connected.
  uber: UberEodRow[] | null
  /// Agenda items raised without a venue.
  groupAgenda: Line[]
  totals: { agenda: number; fixes: number; jobs: number; orders: number; unowned: number }
}

export async function getDailyAccountability(now = new Date()): Promise<DailyAccountability> {
  const startOfDay = new Date(now.getTime() + 10 * 3_600_000)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const dayStartUtc = new Date(startOfDay.getTime() - 10 * 3_600_000)
  const oldCutoff = new Date(now.getTime() - 7 * DAY_MS)

  const [agenda, issues, tasks, orders, stock] = await Promise.all([
    db.meetingAgendaItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } }),
    db.maintenanceIssue.findMany({
      where: { status: "OPEN" },
      include: { asset: { select: { name: true } }, contact: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.venueTask.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, personal: false, maintenanceIssueId: null },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    db.deptOrderRequest.findMany({
      where: { status: "OPEN", lines: { some: {} } },
      include: { lines: { select: { id: true, enteredBy: true } } },
      orderBy: { requestDate: "asc" },
    }),
    db.venueStockItem.findMany({
      where: { isActive: true, signal: { in: ["LOW", "OUT"] } },
      include: { area: { select: { venue: true, name: true } } },
    }),
  ])

  const venues: VenueBlock[] = VENUES.map((venue) => {
    const a: Line[] = agenda.filter((i) => i.venue === venue).map(agendaLine(now))
    const f: Line[] = issues
      .filter((i) => i.venue === venue)
      .map((i) => ({
        text: (i.asset?.name ? `${i.asset.name}: ` : "") + i.title,
        who: i.bookedFor
          ? `${i.contact?.name ?? "trade"} booked ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" }).format(i.bookedFor)}`
          : i.reportedBy
            ? `reported by ${i.reportedBy}`
            : null,
        age: daysOpen(i.createdAt, now),
        flag: i.isSafety ? "SAFETY" : !i.bookedFor ? "nobody called yet" : null,
      }))
    const j: Line[] = tasks
      .filter((t) => t.venue === venue)
      .map((t) => {
        const overdue = t.dueAt && t.dueAt.getTime() < dayStartUtc.getTime()
        const pri = t.priorityOverride ?? t.reportedPriority
        return {
          text: t.title + (t.detail ? `: ${t.detail}` : ""),
          who: t.ownedBy,
          age: daysOpen(t.createdAt, now),
          flag: !t.ownedBy
            ? "no owner"
            : overdue
              ? "overdue"
              : pri === "URGENT"
                ? "urgent"
                : t.createdAt < oldCutoff
                  ? "over a week"
                  : null,
        }
      })
    const o: Line[] = [
      ...orders
        .filter((r) => r.venue === venue)
        .map((r) => {
          const names = Array.from(new Set(r.lines.map((l) => l.enteredBy).filter(Boolean) as string[]))
          return {
            text: `${DEPT_LABEL[r.dept]} order, ${r.lines.length} line${r.lines.length === 1 ? "" : "s"}, waiting for the department head to approve`,
            who: names.length ? `asked by ${names.join(", ")}` : null,
            age: daysOpen(r.createdAt, now),
            flag: r.createdAt < new Date(now.getTime() - DAY_MS) ? "not approved for a day" : null,
          }
        }),
      ...stock
        .filter((s) => s.area.venue === venue)
        .map((s) => ({
          text: `${s.name} (${s.area.name}) flagged ${s.signal === "OUT" ? "OUT" : "low"} on the stock walk`,
          who: s.signalBy ? `by ${s.signalBy}` : null,
          age: s.signalAt ? daysOpen(s.signalAt, now) : "",
          flag: s.signal === "OUT" ? "out" : null,
        })),
    ]
    return { venue, agenda: a, fixes: f, jobs: j, orders: o }
  })
  const groupAgenda = agenda.filter((i) => !i.venue).map(agendaLine(now))

  const totals = {
    agenda: agenda.length,
    fixes: issues.length,
    jobs: tasks.length,
    orders: orders.length + stock.length,
    unowned: tasks.filter((t) => !t.ownedBy).length + issues.filter((i) => !i.bookedFor).length,
  }

  const date = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane",
  }).format(now)

  return { date, venues, groupAgenda, totals, uber: await uberForDay(now) }
}

/** Chloe, 7 Oct 2026: "add uber to the daily eod email too". Live figure at send time, plus the same weekday last week. */
async function uberForDay(now: Date): Promise<UberEodRow[] | null> {
  const conn = await getUberConnection()
  if (!conn) return null
  const today = brisbaneNow(now).date
  const lastWeekDate = shiftDate(today, -7)
  const rows: UberEodRow[] = []
  for (const store of uberStores(conn)) {
    if (!store.venue || !VENUES.includes(store.venue as Venue)) continue
    const venue = store.venue as Venue
    try {
      const [day, lw] = await Promise.all([uberDay(venue, today, true), uberDailyRows(venue, lastWeekDate, lastWeekDate)])
      rows.push({ venue, name: store.name, sales: day.sales, orders: day.orders, lastWeek: lw[0]?.sales ?? null, live: day.status === "LIVE", error: day.status === "NONE" && day.error ? day.error : null })
    } catch (err) {
      rows.push({ venue, name: store.name, sales: 0, orders: 0, lastWeek: null, live: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return rows
}

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`

/** One line per shop for the email: "Tarte Takeaway (Beach House): $638, 20 orders (last Tue $0)". Pure, tested. */
export function uberEodLine(r: UberEodRow, weekday: string): string {
  if (r.error && !r.live && r.sales === 0 && r.orders === 0) return `${r.name} (${VENUE_SHORT_LABEL[r.venue]}): no figure, ${r.error}`
  const base = `${r.name} (${VENUE_SHORT_LABEL[r.venue]}): ${money0(r.sales)}, ${r.orders} order${r.orders === 1 ? "" : "s"}`
  return r.lastWeek === null ? base : `${base} (last ${weekday} ${money0(r.lastWeek)})`
}

function agendaLine(now: Date) {
  return (i: { topic: string; detail: string | null; raisedBy: string | null; createdAt: Date }): Line => ({
    text: i.topic + (i.detail ? `: ${i.detail}` : ""),
    who: i.raisedBy ? `raised by ${i.raisedBy}` : null,
    age: daysOpen(i.createdAt, now),
    flag: null,
  })
}

export function renderDailyAccountability(d: DailyAccountability): { subject: string; html: string; text: string } {
  const t = d.totals
  const open = t.fixes + t.jobs + t.orders + t.agenda
  const subject = `End of day ${d.date}: ${open} open, ${t.unowned} with nobody on them`
  const url = baseUrl()

  // Red = needs a name or a phone call; rust = it has sat too long.
  const flagTone = (flag: string): Tone =>
    flag === "SAFETY" || flag === "no owner" || flag === "nobody called yet" || flag === "urgent" || flag === "overdue" ? "red" : "warn"

  const flagPill = (flag: string) => {
    const c = toneColours(flagTone(flag))
    return `<span style="display:inline-block;background:${c.bg};color:${c.ink};font-family:${FONT_BODY};font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:999px;white-space:nowrap">${esc(flag)}</span>`
  }

  const row = (l: Line) => `<tr>
<td style="padding:8px 0;border-top:1px solid ${BRAND.line};vertical-align:top;width:120px">${l.flag ? flagPill(l.flag) : `<span style="color:${BRAND.inkMute};font-size:12px">&nbsp;</span>`}</td>
<td style="padding:8px 8px;border-top:1px solid ${BRAND.line};vertical-align:top"><div style="font-family:${FONT_BODY};font-size:15px;line-height:1.4;font-weight:700;color:${BRAND.ink}">${esc(l.text)}</div>${l.who ? `<div style="font-family:${FONT_BODY};font-size:13px;line-height:1.4;color:${BRAND.inkSoft};margin-top:2px">${esc(l.who)}</div>` : ""}</td>
<td style="padding:8px 0 8px 8px;border-top:1px solid ${BRAND.line};vertical-align:top;text-align:right;white-space:nowrap;font-family:${FONT_BODY};font-size:13px;color:${BRAND.inkSoft};width:70px">${esc(l.age)}</td>
</tr>`

  const group = (title: string, lines: Line[], href: string) => {
    if (!lines.length) return ""
    return `<tr><td colspan="3" style="padding:12px 0 4px"><a href="${url}${href}" style="font-family:${FONT_BODY};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${BRAND.sageDeep};text-decoration:none">${esc(title)} &middot; ${lines.length}</a></td></tr>${lines.map(row).join("")}`
  }

  const venueCard = (label: string, inner: string, count: number) =>
    card(
      label,
      count ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${inner}</table>` : "",
      { note: count === 0 ? "nothing open" : `${count} open` }
    )

  const blocks = d.venues.map((v) => {
    const count = v.fixes.length + v.jobs.length + v.orders.length + v.agenda.length
    const inner =
      group("Needs fixing", v.fixes, `/kitchen/fix?venue=${v.venue}`) +
      group("Board jobs", v.jobs, `/kitchen/managers/board?venue=${v.venue}`) +
      group("Needs ordering", v.orders, `/kitchen/order?venue=${v.venue}`) +
      group("Meeting agenda", v.agenda, "/kitchen/managers/agenda")
    return venueCard(VENUE_SHORT_LABEL[v.venue], inner, count)
  })
  const groupBlock = d.groupAgenda.length
    ? venueCard("All venues", group("Meeting agenda", d.groupAgenda, "/kitchen/managers/agenda"), d.groupAgenda.length)
    : ""

  const weekday = d.date.split(/[ ,]/)[0] || d.date
  const uberCard = (dd: DailyAccountability) => {
    const rows = (dd.uber ?? []).map((r) => `<tr>
<td style="padding:8px 8px 8px 0;border-top:1px solid ${BRAND.line};vertical-align:top"><div style="font-family:${FONT_BODY};font-size:15px;line-height:1.4;font-weight:700;color:${BRAND.ink}">${esc(r.name)} <span style="font-weight:400;color:${BRAND.inkSoft}">${esc(VENUE_SHORT_LABEL[r.venue])}</span></div>${r.error && !r.live ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${toneColours("red").ink}">${esc(r.error)}</div>` : ""}</td>
<td style="padding:8px 0;border-top:1px solid ${BRAND.line};vertical-align:top;text-align:right;white-space:nowrap;font-family:${FONT_BODY};font-size:15px;color:${BRAND.ink}"><strong>${esc(money0(r.sales))}</strong> <span style="color:${BRAND.inkSoft};font-size:13px">${r.orders} order${r.orders === 1 ? "" : "s"}${r.lastWeek !== null ? ` &middot; last ${esc(weekday)} ${esc(money0(r.lastWeek))}` : ""}</span></td>
</tr>`).join("")
    return card("Uber Eats today", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows}</table>`, { note: "Menu value inc GST before Uber's cut. On top of the venue totals, not in them." })
  }

  const html = shell({
    kicker: "End of day",
    title: d.date,
    preheader: `${open} open, ${t.unowned} with nobody on them`,
    sections: [
      tiles([
        { label: "To fix", value: String(t.fixes) },
        { label: "Board jobs", value: String(t.jobs) },
        { label: "To order", value: String(t.orders) },
        { label: "Agenda", value: String(t.agenda) },
      ]),
      callout(t.unowned ? `${t.unowned} of these have nobody on them.` : "Everything open has a name on it.", t.unowned ? "red" : "done"),
      ...(d.uber && d.uber.length ? [uberCard(d)] : []),
      ...(open === 0
        ? [card(null, `<div style="font-family:${FONT_DISPLAY};font-size:20px;line-height:1.2;color:${BRAND.charcoal};font-weight:600">Nothing open anywhere. Good day.</div>`)]
        : [...blocks, groupBlock].filter(Boolean)),
    ],
    footer: "Open items only. Red tags need a name or a phone call. Ages are since it was reported. Sent 5pm daily by Tarte Kitchen.",
  })

  const textLines: string[] = [
    `Tarte end of day, ${d.date}`,
    `${t.fixes} to fix, ${t.jobs} board jobs, ${t.orders} to order, ${t.agenda} on the agenda. ${t.unowned} with nobody on them.`,
    "",
  ]
  const addText = (title: string, lines: Line[]) => {
    if (!lines.length) return
    textLines.push(`  ${title} (${lines.length})`)
    for (const l of lines) textLines.push(`   - ${l.flag ? `[${l.flag.toUpperCase()}] ` : ""}${l.text}${l.who ? ` (${l.who})` : ""}, ${l.age}`)
  }
  for (const v of d.venues) {
    const count = v.fixes.length + v.jobs.length + v.orders.length + v.agenda.length
    textLines.push(`${VENUE_SHORT_LABEL[v.venue].toUpperCase()}: ${count ? `${count} open` : "nothing open"}`)
    addText("Needs fixing", v.fixes)
    addText("Board jobs", v.jobs)
    addText("Needs ordering", v.orders)
    addText("Meeting agenda", v.agenda)
    textLines.push("")
  }
  if (d.groupAgenda.length) { textLines.push("ALL VENUES"); addText("Meeting agenda", d.groupAgenda) }
  if (d.uber && d.uber.length) {
    textLines.push("", "UBER EATS TODAY (not in the venue totals)")
    for (const r of d.uber) textLines.push(`   - ${uberEodLine(r, weekday)}`)
  }
  return { subject, html, text: textLines.join("\n") }
}
