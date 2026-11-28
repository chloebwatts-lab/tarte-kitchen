import { NextRequest } from "next/server"
import { loadUpcomingFeed } from "@/lib/upcoming/load"
import { addDays, brisbaneToday, daySpan, validDay } from "@/lib/upcoming/merge"

export const dynamic = "force-dynamic"

/** Longest window one call may ask for. */
const MAX_DAYS = 60

/** Functions and cake pickups coming up, for Tarte Shifts' manager alerts,
 *  kiosk banner and "Got it" (Chloe, 28 Nov 2026: a paid function was missed
 *  because nobody put it on the hello@ calendar). Bearer = CRON_SECRET, the
 *  same as the other internal routes (Shifts sends its MAIL_RELAY_SECRET).
 *  ?from=YYYY-MM-DD&to=YYYY-MM-DD, Brisbane days, default today to +14,
 *  at most 60 days. Read only. Item shape and merge rules: src/lib/upcoming/merge.ts. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const sp = req.nextUrl.searchParams
  const today = brisbaneToday()
  const fromRaw = sp.get("from")
  const toRaw = sp.get("to")
  const from = fromRaw ? validDay(fromRaw) : today
  if (!from) return Response.json({ ok: false, error: "from must be YYYY-MM-DD" }, { status: 400 })
  const to = toRaw ? validDay(toRaw) : addDays(from, 14)
  if (!to) return Response.json({ ok: false, error: "to must be YYYY-MM-DD" }, { status: 400 })
  if (to < from) return Response.json({ ok: false, error: "to is before from" }, { status: 400 })
  if (daySpan(from, to) > MAX_DAYS) return Response.json({ ok: false, error: `at most ${MAX_DAYS} days per call` }, { status: 400 })
  try {
    const { items, warnings } = await loadUpcomingFeed({ from, to })
    return Response.json({ ok: true, generatedAt: new Date().toISOString(), from, to, items, ...(warnings.length ? { warnings } : {}) })
  } catch (err) {
    console.error("[upcoming-events]", err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: "could not read events" }, { status: 500 })
  }
}
