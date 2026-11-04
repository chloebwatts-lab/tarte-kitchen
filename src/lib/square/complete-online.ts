/**
 * Nightly completion of paid Bopple orders (Chloe, 4 Nov 2026: "Yes,
 * nightly job"; staff should not have to tap anything).
 *
 * Bopple orders land in Square already paid (tender OTHER / BOPPLE) but stay
 * OPEN until someone taps Picked up, and Amaka only sends COMPLETED orders to
 * Xero. Not one was tapped in October, so Beach House Xero missed every
 * Bopple sale ($53,432.97 inc GST, booked by a CBK journal dated 31 Oct
 * 2026). From 1 Nov this job completes them at 23:55 AEST, so Amaka books
 * each day's Bopple sales with that day's invoice.
 *
 * Hard floor: nothing created before 1 Nov 2026 is ever touched. October's
 * open orders are already in Xero through the journal; completing them now
 * would make Amaka book them a second time.
 */
import type { Venue } from "@/generated/prisma/client"
import { completeOrder, isBoppleOrder, isPaidOrder, searchOpenBoppleOrders, type SquareOrder } from "./client"
import { squareAccessFor } from "./token"

/** Never complete an order created before this instant (Brisbane midnight 1 Nov 2026). */
export const COMPLETE_FROM = "2026-11-01T00:00:00+10:00"

/** Venues whose Bopple orders the job completes. Only Beach House takes Bopple orders (checked 4 Nov 2026). */
export const COMPLETE_VENUES: Venue[] = ["BEACH_HOUSE"]

/** Leave anything placed in the last 20 minutes (or due for pickup within it) for the next run. */
export const MIN_AGE_MS = 20 * 60 * 1000

/** Safety cap per venue per run; a busy Sunday is about 140 Bopple orders. */
export const MAX_PER_RUN = 500

const DONE_FULFILMENT = new Set(["COMPLETED", "CANCELED", "FAILED"])
const COUNTER_FULFILMENT = new Set(["PICKUP", "IN_STORE"])

/**
 * Pure. Why an order must be left alone, or null when the job may complete
 * it: an OPEN Bopple order placed on or after 1 Nov 2026, at least 20
 * minutes old, fully paid by captured Bopple tenders, collected at the
 * counter, and not due for pickup in the next 20 minutes.
 */
export function completionBlocker(o: SquareOrder, nowMs: number): string | null {
  if (o.state !== "OPEN") return "not open"
  if (!isBoppleOrder(o)) return "not a Bopple order"
  const created = Date.parse(o.created_at ?? "")
  if (!Number.isFinite(created)) return "no created time"
  if (created < Date.parse(COMPLETE_FROM)) return "placed before 1 Nov 2026"
  if (nowMs - created < MIN_AGE_MS) return "placed in the last 20 minutes"
  if (!isPaidOrder(o) || (o.net_amount_due_money?.amount ?? 0) > 0) return "not fully paid"
  const tenders = o.tenders ?? []
  if (!tenders.length || tenders.some((t) => t.type !== "OTHER" || t.other_details?.status !== "CAPTURED")) {
    return "not paid by a captured Bopple tender"
  }
  const fulfilments = o.fulfillments ?? []
  for (const f of fulfilments) {
    if (f.type && !COUNTER_FULFILMENT.has(f.type)) return `fulfilment type ${f.type}`
    if (f.state && DONE_FULFILMENT.has(f.state) && f.state !== "COMPLETED") return `fulfilment ${f.state}`
    const due = Date.parse(f.pickup_details?.pickup_at ?? "")
    if (Number.isFinite(due) && due > nowMs - MIN_AGE_MS) return "pickup not due yet"
  }
  if (o.version === undefined) return "no order version"
  return null
}

export interface CompletionReport {
  venue: Venue
  dryRun: boolean
  open: number
  completed: Array<{ id: string; createdAt: string | undefined; totalIncGst: number }>
  completedIncGst: number
  skipped: Record<string, number>
  failed: Array<{ id: string; error: string }>
  capped: boolean
}

/** Complete every eligible open Bopple order at each COMPLETE_VENUES venue. */
export async function completeOnlineOrders(opts: { dryRun?: boolean; now?: Date } = {}): Promise<CompletionReport[]> {
  const dryRun = Boolean(opts.dryRun)
  const now = opts.now ?? new Date()
  const reports: CompletionReport[] = []
  for (const venue of COMPLETE_VENUES) {
    const access = await squareAccessFor(venue)
    if (!access) continue
    const startAt = new Date(COMPLETE_FROM).toISOString()
    const open = await searchOpenBoppleOrders(access.token, access.locationId, startAt, now.toISOString())
    const report: CompletionReport = { venue, dryRun, open: open.length, completed: [], completedIncGst: 0, skipped: {}, failed: [], capped: false }
    let cents = 0
    for (const o of open) {
      const blocker = o.location_id && o.location_id !== access.locationId ? "other location" : completionBlocker(o, now.getTime())
      if (blocker) {
        report.skipped[blocker] = (report.skipped[blocker] ?? 0) + 1
        continue
      }
      if (report.completed.length >= MAX_PER_RUN) {
        report.capped = true
        break
      }
      try {
        if (!dryRun) await completeOrder(access.token, o)
        report.completed.push({ id: o.id, createdAt: o.created_at, totalIncGst: (o.total_money?.amount ?? 0) / 100 })
        cents += o.total_money?.amount ?? 0
      } catch (err) {
        report.failed.push({ id: o.id, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) })
      }
    }
    report.completedIncGst = cents / 100
    reports.push(report)
  }
  return reports
}
