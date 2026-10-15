export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getValidXeroAccessToken, getPostedPayRuns, type ProcessedPayRun } from "@/lib/xero/client"
import { fetchShiftsPayRuns, mergePayRunsByWeek, payRunOrgs, shiftsPayRunsConfigured } from "@/lib/labour/payruns"

/**
 * Weekly labour cost (gross + super per posted pay run), both Xero orgs.
 * Since 16 Sep 2026 the pay runs come from Tarte Shifts' internal feed
 * (SHIFTS_PAYRUNS_URL + SHIFTS_SECRET), which holds the Xero connections
 * for every org; TK's own Xero app no longer needs a slot on Tarte
 * Currumbin. Since 9 Oct 2026 the feed is asked for every org in
 * SHIFTS_PAYRUNS_ORGS (default Tarte Bakery + Tarte Currumbin, i.e. Burleigh
 * and the Currumbin venues; Deputy's export was never read here) and runs
 * with the same period start are summed into one WeeklyLabourCost row. The
 * direct-Xero path stays as a fallback when those env vars are unset.
 */
async function payRunsFromShifts(fromDate: Date): Promise<ProcessedPayRun[]> {
  const all: ProcessedPayRun[] = []
  for (const org of payRunOrgs()) all.push(...(await fetchShiftsPayRuns(org, fromDate)))
  return mergePayRunsByWeek(all)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const results = {
    source: shiftsPayRunsConfigured() ? "tarte-shifts" : "xero",
    orgs: shiftsPayRunsConfigured() ? payRunOrgs() : [],
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
