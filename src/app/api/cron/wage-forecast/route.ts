/**
 * TEMPORARY endpoint — pulls the live wage forecast for the Tarte week
 * containing the optional `at` query timestamp (defaults to now).
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://app:3000/api/cron/wage-forecast?at=2026-05-26T13:00:00Z
 *
 * Delete after we've logged the forecast for the 2026-05-20 → 2026-05-26
 * trading week.
 */

import { NextRequest } from "next/server"
import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const at = req.nextUrl.searchParams.get("at")
  const now = at ? new Date(at) : new Date()
  if (Number.isNaN(now.getTime())) {
    return new Response("Bad `at`", { status: 400 })
  }

  const snap = await getLiveLabourSnapshot({ now })
  return Response.json({ asOf: now.toISOString(), ...snap })
}
