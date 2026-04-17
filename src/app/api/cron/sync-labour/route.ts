export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getValidXeroAccessToken, getPostedPayRuns } from "@/lib/xero/client"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const results = {
    synced: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    const { accessToken, tenantId } = await getValidXeroAccessToken()

    // Fetch pay runs from the last 26 weeks (6 months)
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 7 * 26)

    const payRuns = await getPostedPayRuns(accessToken, tenantId, fromDate)

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

    // Update lastSyncedAt
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
