import { timingSafeEqual } from "node:crypto"
import { NextRequest } from "next/server"
import { pastryScanToken, takeScanPost } from "@/lib/pastry-orders/intake"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Pastry Orders intake (Shawna, 28 Nov 2026). Her inbox scan posts
 *   { orders: [ { id, order, customer, venue, date, time, item, qty, ... } ],
 *     log:    [ { id, at, order, customer, action, detail, by } ],
 *     scan:   { label: "Saturday 28 Nov 2026, 6:13pm" } }
 * with the tracker's own ids and field names. Bearer = the scan token shown
 * to owners on the Pastry Orders menu (not the cron secret). Write rules are
 * in src/lib/pastry-orders/intake.ts: nothing is deleted, staff-owned fields
 * and Manual rows are never overwritten, log entries are added once.
 * ?quiet=1 sends no phone alerts (the one-off import).
 */
function allowed(req: NextRequest): boolean {
  const token = pastryScanToken()
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token) return false
  const a = Buffer.from(got)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!allowed(req)) return new Response("Unauthorized", { status: 401 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "body must be JSON" }, { status: 400 })
  }
  try {
    const quiet = ["1", "true", "yes"].includes((req.nextUrl.searchParams.get("quiet") ?? "").toLowerCase())
    const report = await takeScanPost(body, { quiet })
    console.log(
      `[pastry-orders] scan post: orders ${report.orders.received} in, ${report.orders.created} new, ${report.orders.updated} changed; log ${report.log.created} new; alerts ${report.alerts}`
    )
    return Response.json(report)
  } catch (err) {
    console.error("[pastry-orders] scan post", err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: "could not save" }, { status: 500 })
  }
}

/** The scan can check its connection: counts only, no customer details. */
export async function GET(req: NextRequest) {
  if (!allowed(req)) return new Response("Unauthorized", { status: 401 })
  const { db } = await import("@/lib/db")
  const [orders, log, scan] = await Promise.all([db.pastryOrder.count(), db.pastryLog.count(), db.pastryScan.findUnique({ where: { id: "latest" } })])
  return Response.json({ ok: true, orders, log, scan: scan?.label ?? null })
}
