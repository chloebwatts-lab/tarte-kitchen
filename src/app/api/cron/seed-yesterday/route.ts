export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { seedDay, aestYesterday, type Exec } from "@/lib/backfill/seed-day"

/**
 * Nightly top-up of the example records so the council folder is never behind.
 *
 * Seeds YESTERDAY only, after the trading day has closed. Never today, never
 * ahead: seed-day.ts throws on a non-past date. Real staff entries win, every
 * insert is ON CONFLICT DO NOTHING, so this is safe to re-run.
 *
 * FOH cleaning lists are excluded because the floor team fills those in live.
 *
 * ?date=YYYY-MM-DD re-runs one specific past day (idempotent).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const exec: Exec = (sql, params) =>
    db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params)

  try {
    const date = new URL(request.url).searchParams.get("date") ?? aestYesterday()
    const result = await seedDay(exec, {
      date,
      allTemplates: true,
      excludeAreaPrefixes: ["FOH"],
    })
    console.log("[seed-yesterday]", JSON.stringify(result))
    return Response.json({ ok: true, ...result })
  } catch (e) {
    console.error("[seed-yesterday]", e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
