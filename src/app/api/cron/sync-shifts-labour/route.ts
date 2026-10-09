export const dynamic = "force-dynamic"
export const maxDuration = 300

import { syncLabour } from "@/lib/labour/sync"

/**
 * Refresh LabourShift from the configured labour source (LABOUR_SOURCE:
 * Tarte Shifts or Deputy). Same job as /api/cron/sync-deputy, under a name
 * that will still make sense after Deputy is cancelled.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  try {
    const result = await syncLabour()
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
