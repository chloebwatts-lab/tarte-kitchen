import { db } from "@/lib/db"
import { DEED_VERSION } from "@/lib/confidentiality/deed"
import { listActiveStaff } from "@/lib/shifts-staff"

/**
 * Owner-only access alerts. Chloe, 20 Sep 2026: tell me, never them.
 *
 * A web page cannot see a screenshot being taken (no browser exposes it, on
 * iPad or anywhere), so this watches behaviour instead: who opened how much
 * of the sensitive material, when, and from where. Every page also carries
 * the viewer's name and the minute, so a leaked photo names its source.
 *
 * Recipients: ACCESS_ALERT_TO (comma list), default chloe@ only. Never the
 * shared inboxes.
 */

const DEFAULT_TO = ["chloe@tarte.com.au"]
export function accessAlertRecipients(): string[] {
  const raw = process.env.ACCESS_ALERT_TO?.trim()
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []
  return list.length ? list : DEFAULT_TO
}

/** Pages that would let a competitor copy Tarte. */
const SENSITIVE = [
  "/kitchen/portions", "/kitchen/prices", "/kitchen/prep", "/kitchen/serves", "/kitchen/order",
  "/kitchen/ordering", "/kitchen/restock", "/kitchen/gm", "/kitchen/managers", "/kitchen/lineup",
  "/kitchen/jobs", "/kitchen/commitments", "/kitchen/training", "/kitchen/meeting",
]
const isSensitive = (p: string | null) => !!p && SENSITIVE.some((s) => p === s || p.startsWith(`${s}/`) || p.startsWith(`${s}?`))

const WINDOW_MIN = 15
const BULK_VIEWS = 60
const BULK_SENSITIVE_PAGES = 10
const FAILED_LOGINS = 5
/** New-place alerts wait until there is a week of history to compare with. */
const LEARNING_DAYS = 7

const bris = (d: Date) => new Date(d.getTime() + 10 * 3_600_000)
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Brisbane" }).format(d)

export interface NewAlert { key: string; staffId: string | null; staffName: string | null; summary: string }

export async function findNewAlerts(now = new Date()): Promise<NewAlert[]> {
  const since = new Date(now.getTime() - WINDOW_MIN * 60_000)
  const events = await db.accessEvent.findMany({ where: { at: { gte: since } }, orderBy: { at: "asc" } })
  const out: NewAlert[] = []
  const hourKey = bris(now).toISOString().slice(0, 13)

  // 1. Capture attempts: every one, straight away.
  for (const e of events.filter((e) => e.kind === "CAPTURE_ATTEMPT")) {
    out.push({ key: `capture:${e.id}`, staffId: e.staffId, staffName: e.staffName, summary: `${e.staffName} tried to capture a page: ${e.path} at ${fmt(e.at)}.` })
  }

  // 2. Bulk opening, per person.
  const byStaff = new Map<string, typeof events>()
  for (const e of events) {
    if (e.kind !== "VIEW" || !e.staffId) continue
    byStaff.set(e.staffId, [...(byStaff.get(e.staffId) ?? []), e])
  }
  for (const [staffId, views] of byStaff) {
    const name = views[0].staffName
    const sensitivePages = new Set(views.filter((v) => isSensitive(v.path)).map((v) => v.path))
    if (views.length >= BULK_VIEWS || sensitivePages.size >= BULK_SENSITIVE_PAGES) {
      out.push({
        key: `bulk:${staffId}:${hourKey}`,
        staffId, staffName: name,
        summary: `${name} opened ${views.length} pages in ${WINDOW_MIN} minutes, ${sensitivePages.size} of them sensitive (${[...sensitivePages].slice(0, 6).join(", ")}${sensitivePages.size > 6 ? ", ..." : ""}).`,
      })
    }
    // 3. Middle of the night.
    const late = views.filter((v) => { const h = bris(v.at).getUTCHours(); return h >= 22 || h < 4 })
    if (late.length) {
      out.push({
        key: `late:${staffId}:${bris(now).toISOString().slice(0, 10)}`,
        staffId, staffName: name,
        summary: `${name} was in the app outside hours, first at ${fmt(late[0].at)}, ${late.length} page${late.length === 1 ? "" : "s"} (${[...new Set(late.map((l) => l.path))].slice(0, 5).join(", ")}).`,
      })
    }
  }

  // 4. PIN guessing.
  const failsByIp = new Map<string, typeof events>()
  for (const e of events.filter((e) => e.kind === "LOGIN_FAILED")) failsByIp.set(e.ip ?? "?", [...(failsByIp.get(e.ip ?? "?") ?? []), e])
  for (const [ip, fails] of failsByIp) {
    if (fails.length < FAILED_LOGINS) continue
    out.push({
      key: `guess:${ip}:${hourKey}`,
      staffId: null, staffName: null,
      summary: `${fails.length} failed sign ins from one address (${ip}) in ${WINDOW_MIN} minutes. Names tried: ${[...new Set(fails.map((f) => f.attemptedName || "blank"))].slice(0, 8).join(", ")}.`,
    })
  }

  // 5. Signed in from somewhere nobody at Tarte has signed in from before.
  const first = await db.accessEvent.findFirst({ where: { kind: "LOGIN" }, orderBy: { at: "asc" }, select: { at: true } })
  if (first && now.getTime() - first.at.getTime() > LEARNING_DAYS * 86_400_000) {
    for (const e of events.filter((e) => e.kind === "LOGIN" && e.ip)) {
      const seenBefore = await db.accessEvent.count({ where: { kind: "LOGIN", ip: e.ip, at: { lt: e.at } } })
      if (seenBefore === 0) {
        out.push({ key: `newplace:${e.staffId}:${e.ip}`, staffId: e.staffId, staffName: e.staffName, summary: `${e.staffName} signed in from an address never used before (${e.ip}) at ${fmt(e.at)}. Likely off site.` })
      }
    }
  }

  if (!out.length) return []
  const already = await db.accessAlert.findMany({ where: { key: { in: out.map((o) => o.key) } }, select: { key: true } })
  const sent = new Set(already.map((a) => a.key))
  return out.filter((o) => !sent.has(o.key))
}

export async function markAlertsSent(alerts: NewAlert[]): Promise<void> {
  for (const a of alerts) {
    await db.accessAlert.upsert({ where: { key: a.key }, create: a, update: {} })
  }
}

/** Once a day, owner only: who has signed, who has not, and the day's traffic. */
export async function dailyAccessSummary(now = new Date()): Promise<{ subject: string; body: string }> {
  const dayStart = new Date(bris(now).toISOString().slice(0, 10) + "T00:00:00Z")
  const dayStartUtc = new Date(dayStart.getTime() - 10 * 3_600_000)
  const [staff, deeds, logins, views, fails, alerts] = await Promise.all([
    listActiveStaff(),
    db.confidentialityDeed.findMany({ where: { version: DEED_VERSION }, select: { staffId: true, staffName: true, signedAt: true } }),
    db.accessEvent.findMany({ where: { kind: "LOGIN", at: { gte: dayStartUtc } }, select: { staffId: true, staffName: true } }),
    db.accessEvent.count({ where: { kind: "VIEW", at: { gte: dayStartUtc } } }),
    db.accessEvent.count({ where: { kind: "LOGIN_FAILED", at: { gte: dayStartUtc } } }),
    db.accessAlert.findMany({ where: { sentAt: { gte: dayStartUtc } }, orderBy: { sentAt: "asc" } }),
  ])
  const signedIds = new Set(deeds.map((d) => d.staffId))
  const signedToday = deeds.filter((d) => d.signedAt >= dayStartUtc)
  const people = new Set(logins.map((l) => l.staffId))
  const lines: string[] = []
  if (staff) {
    const unsigned = staff.filter((s) => !signedIds.has(s.id))
    lines.push(`CONFIDENTIALITY DEED: ${staff.length - unsigned.length} of ${staff.length} active staff have signed (${signedToday.length} today).`)
    if (signedToday.length) lines.push(`Signed today: ${signedToday.map((d) => d.staffName).join(", ")}.`)
    const venueLabel: Record<string, string> = { BURLEIGH: "Burleigh", BEACH_HOUSE: "Beach House", TEA_GARDEN: "Tea Garden" }
    for (const v of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]) {
      const u = unsigned.filter((s) => s.venue === v)
      if (u.length) lines.push(`Not signed, ${venueLabel[v]} (${u.length}): ${u.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}.`)
    }
  } else {
    lines.push(`CONFIDENTIALITY DEED: ${deeds.length} signed. (Could not reach Tarte Shifts for the staff list.)`)
  }
  lines.push("", `TODAY: ${people.size} people signed in, ${views} pages opened, ${fails} failed sign ins.`)
  lines.push("", alerts.length ? `ALERTS TODAY (${alerts.length}):` : "No alerts today.")
  for (const a of alerts) lines.push(`- ${a.summary}`)
  lines.push("", "Only you get this email. Nobody is told when an alert fires.")
  const date = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" }).format(now)
  return { subject: `Tarte Kitchen access, ${date}: ${alerts.length} alert${alerts.length === 1 ? "" : "s"}, ${signedIds.size} deeds signed`, body: lines.join("\n") }
}
