/**
 * Pastry Orders, the scan side. Shawna's inbox scan (a scheduled task on her
 * Claude account) posts what it sees to POST /api/internal/pastry-orders:
 * order lines, log entries and the "inbox last checked" label, with the
 * tracker's own ids.
 *
 * Rules (her handover, 28 Nov 2026):
 *  - never delete: a row missing from a post is left as it is;
 *  - a new id is created with everything posted (the one-off import brings
 *    pickups and outcomes across from the tracker);
 *  - on a row that exists, only the scan's own fields change. Staff-owned
 *    fields and Manual rows are never touched;
 *  - log entries are added once and never edited.
 * New orders and new flags the scan logs in the last three hours go to the
 * pastry devices as a push; older ones (the import, a catch-up) arrive quietly.
 */

import { createHmac } from "node:crypto"
import { db } from "@/lib/db"
import {
  brisbaneDay,
  cleanLine,
  cleanLog,
  flagPush,
  groupCards,
  newOrderPush,
  plain,
  scanPatch,
  type PastryLine,
  type PastryLogEntry,
} from "./shared"
import { PASTRY_ORDERS_PATH, sendPastryPush } from "./push"

/** Most rows one post may carry. */
export const MAX_ROWS = 2000
const ALERT_IF_UNDER_MS = 3 * 3_600_000

/**
 * The scan's own bearer token, made from the app's signing secret so no new
 * setting is needed and the cron secret is never handed out. Shown to owners
 * on the Pastry Orders menu (Scan connection). Bump the version to cancel it.
 */
export function pastryScanToken(): string | null {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) return null
  return createHmac("sha256", s).update("pastry-scan:v1").digest("hex").slice(0, 40)
}

export interface IntakeReport {
  ok: true
  orders: { received: number; created: number; updated: number; unchanged: number; skipped: number }
  log: { received: number; created: number; skipped: number }
  scan: string | null
  alerts: number
}

function toRow(o: { [K in keyof PastryLine]: PastryLine[K] }): PastryLine {
  const { id, order, customer, venue, date, time, item, qty, price, contact, notes, flag, flagKind, status, source, channel, payment, takenBy, staffStatus, staffStatusBy, staffStatusAt, staffStatusNote, changeNote, pickedUp, pickedUpBy, pickedUpAt, flagResolved, resolvedBy, resolvedAt, resolvedNote, updatedAt } = o
  return { id, order, customer, venue, date, time, item, qty, price, contact, notes, flag, flagKind, status, source, channel, payment, takenBy, staffStatus, staffStatusBy, staffStatusAt, staffStatusNote, changeNote, pickedUp, pickedUpBy, pickedUpAt, flagResolved, resolvedBy, resolvedAt, resolvedNote, updatedAt }
}

export async function takeScanPost(body: unknown, opts: { now?: Date; quiet?: boolean } = {}): Promise<IntakeReport> {
  const now = opts.now ?? new Date()
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const rawOrders = Array.isArray(b.orders) ? b.orders.slice(0, MAX_ROWS) : []
  const rawLog = Array.isArray(b.log) ? b.log.slice(0, MAX_ROWS) : []
  const report: IntakeReport = {
    ok: true,
    orders: { received: rawOrders.length, created: 0, updated: 0, unchanged: 0, skipped: 0 },
    log: { received: rawLog.length, created: 0, skipped: 0 },
    scan: null,
    alerts: 0,
  }

  const lines = new Map<string, PastryLine>()
  for (const r of rawOrders) {
    const l = cleanLine(r)
    if (l) lines.set(l.id, l)
    else report.orders.skipped++
  }
  const existing = new Map(
    (lines.size ? await db.pastryOrder.findMany({ where: { id: { in: [...lines.keys()] } } }) : []).map((o) => [o.id, toRow(o)])
  )
  for (const l of lines.values()) {
    const was = existing.get(l.id)
    if (!was) {
      await db.pastryOrder.create({ data: l })
      report.orders.created++
      continue
    }
    const patch = scanPatch(was, l)
    if (!patch) {
      report.orders.unchanged++
      continue
    }
    await db.pastryOrder.update({ where: { id: l.id }, data: patch })
    report.orders.updated++
  }

  const entries = new Map<string, PastryLogEntry>()
  for (const r of rawLog) {
    const e = cleanLog(r)
    if (e) entries.set(e.id, e)
    else report.log.skipped++
  }
  const haveLog = new Set(
    (entries.size ? await db.pastryLog.findMany({ where: { id: { in: [...entries.keys()] } }, select: { id: true } }) : []).map((e) => e.id)
  )
  const fresh: PastryLogEntry[] = []
  for (const e of entries.values()) {
    if (haveLog.has(e.id)) continue
    await db.pastryLog.create({ data: e })
    report.log.created++
    fresh.push(e)
  }

  const scan = b.scan && typeof b.scan === "object" ? (b.scan as Record<string, unknown>).label : null
  if (typeof scan === "string" && scan.trim()) {
    const label = plain(scan, 120)
    await db.pastryScan.upsert({ where: { id: "latest" }, create: { id: "latest", label }, update: { label } })
    report.scan = label
  }

  if (!opts.quiet) report.alerts = await alertFresh(fresh, now)
  return report
}

/** One push per order for what the scan just added or flagged. */
async function alertFresh(fresh: PastryLogEntry[], now: Date): Promise<number> {
  const today = brisbaneDay(now)
  const recent = fresh.filter((e) => {
    const t = Date.parse(e.at)
    return (e.action === "Added" || e.action === "Flagged") && e.order && Number.isFinite(t) && now.getTime() - t < ALERT_IF_UNDER_MS && now.getTime() - t > -600_000
  })
  const byOrder = new Map<string, PastryLogEntry>()
  // A flag outranks "Added" when one order has both.
  for (const e of recent) if (!byOrder.has(e.order) || e.action === "Flagged") byOrder.set(e.order, e)
  let sent = 0
  for (const e of [...byOrder.values()].slice(0, 6)) {
    const rows = (await db.pastryOrder.findMany({ where: { order: e.order } })).map(toRow)
    const card = groupCards(rows.filter((r) => r.status !== "cancelled" && (!r.date || r.date >= today)))[0]
    if (!card || card.dead) continue
    const text = e.action === "Flagged" ? flagPush(card, e.detail, today) : newOrderPush(card, today)
    const r = await sendPastryPush(text.title, text.body, `${PASTRY_ORDERS_PATH}?q=${encodeURIComponent(e.order)}`).catch(() => ({ sent: 0 }))
    if (r.sent) sent++
  }
  return sent
}
