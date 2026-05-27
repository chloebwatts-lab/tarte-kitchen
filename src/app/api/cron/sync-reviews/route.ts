import { NextRequest } from "next/server"
import { ingestAllVenues } from "@/lib/google-reviews/fetch"
import { ingestAllVenuesGbp } from "@/lib/gbp/fetch"
import { getActiveGbpConnection } from "@/lib/gbp/token"
import { draftAndNotifyNewReviews } from "@/lib/reviews/draft-replies"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // The Places API path stays unconditional: it owns the aggregate
  // rating snapshot (GBP doesn't expose it) and acts as a fallback if
  // GBP is disconnected or partially bound. When the GBP connection is
  // live, we run it too — it returns *all* reviews paginated, beating
  // the 5-cap Places window. Content-identity dedup in both fetchers
  // keeps overlap from creating duplicate rows.
  let gbp: Awaited<ReturnType<typeof ingestAllVenuesGbp>> | null = null
  let gbpError: string | null = null
  const gbpConnection = await getActiveGbpConnection()
  if (gbpConnection) {
    try {
      gbp = await ingestAllVenuesGbp()
    } catch (e) {
      gbpError = e instanceof Error ? e.message : String(e)
    }
  }

  try {
    const places = await ingestAllVenues()

    // After ingestion: draft replies for any new ≤3-star reviews that
    // don't have an owner reply yet. Non-fatal if this fails.
    let draftsSent = 0
    let draftError: string | null = null
    try {
      draftsSent = await draftAndNotifyNewReviews()
    } catch (e) {
      draftError = e instanceof Error ? e.message : String(e)
    }

    return Response.json({
      ok: true,
      runAt: new Date().toISOString(),
      gbp,
      gbpError,
      places,
      draftsSent,
      draftError,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e), gbpError, gbp },
      { status: 500 }
    )
  }
}
