export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getValidXeroAccessToken, getPostedPayRuns, type ProcessedPayRun } from "@/lib/xero/client"

/**
 * Weekly labour cost (gross + super per posted pay run) for the org that
 * pays Currumbin. Since 16 Sep 2026 the pay runs come from Tarte Shifts'
 * internal feed (SHIFTS_PAYRUNS_URL + SHIFTS_SECRET), which holds the Xero
 * connections for every org; TK's own Xero app no longer needs a slot on
 * Tarte Currumbin. The direct-Xero path stays as a fallback when those
 * env vars are unset.
 */
async function payRunsFromShifts(fromDate: Date): Promise<ProcessedPayRun[]> {
  const url = new URL(process.env.SHIFTS_PAYRUNS_URL!)
  url.searchParams.set("org", process.env.SHIFTS_PAYRUNS_ORG ?? "Tarte Currumbin")
  url.searchParams.set("from", fromDate.toISOString().slice(0, 10))
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SHIFTS_SECRET}` },
    cache: "no-store",
  })
  const body = (await res.json()) as {
    ok?: boolean
    error?: string
    payRuns?: Array<Omit<ProcessedPayRun, "weekStart" | "weekEnd" | "paymentDate"> & { weekStart: string; weekEnd: string; paymentDate: string }>
  }
  if (!res.ok || !body.ok) throw new Error(`Tarte Shifts pay-runs feed: ${body.error ?? res.status}`)
  return (body.payRuns ?? []).map((r) => ({
    ...r,
    weekStart: new Date(r.weekStart),
    weekEnd: new Date(r.weekEnd),
    paymentDate: new Date(r.paymentDate),
  }))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const results = {
    source: process.env.SHIFTS_PAYRUNS_URL && process.env.SHIFTS_SECRET ? "tarte-shifts" : "xero",
    synced: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // Fetch pay runs from the last 26 weeks (6 months)
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 7 * 26)

    let payRuns: ProcessedPayRun[]
    if (results.source === "tarte-shifts") {
      payRuns = await payRunsFromShifts(fromDate)
    } else {
      const { accessToken, tenantId } = await getValidXeroAccessToken()
      payRuns = await getPostedPayRuns(accessToken, tenantId, fromDate)
    }

    for (const run of payRuns) {
      try {
        await (db as any).weeklyLabourCost.upsert({
          where: { weekStart: run.weekStart },
          update: {
            grossWages: run.grossWages,
            superAmount: run.superAmount,
            totalCost: run.totalCost,
            headcount: run.headcount,
          },
          create: {
            weekStart: run.weekStart,
            grossWages: run.grossWages,
            superAmount: run.superAmount,
            totalCost: run.totalCost,
            headcount: run.headcount,
          },
        })
        results.synced++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.errors.push(`PayRun ${run.payRunId}: ${msg}`)
      }
    }

    // Update lastSyncedAt (the row doubles as the "labour data is fresh"
    // signal on /reports even when the feed is Tarte Shifts).
    const conn = await (db as any).xeroConnection.findFirst()
    if (conn) {
      await (db as any).xeroConnection.update({
        where: { id: conn.id },
        data: { lastSyncedAt: new Date() },
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.errors.push(msg)
    console.error("[sync-labour]", msg)
  }

  console.log("[sync-labour]", JSON.stringify(results))
  return Response.json(results)
}
