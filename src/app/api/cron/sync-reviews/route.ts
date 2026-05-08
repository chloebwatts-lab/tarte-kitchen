import { NextRequest } from "next/server"
import { ingestAllVenues } from "@/lib/google-reviews/fetch"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  try {
    const results = await ingestAllVenues()
    return Response.json({
      ok: true,
      runAt: new Date().toISOString(),
      results,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
