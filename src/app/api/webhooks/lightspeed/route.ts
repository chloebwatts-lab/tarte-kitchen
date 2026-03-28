export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Lightspeed K-Series webhook for account CLOSED events
  // This provides near-real-time sales updates, but delivery is not guaranteed.
  // The daily 2AM cron sync is the source of truth.
  try {
    const payload = await request.json()
    console.log("Lightspeed webhook received:", payload?.event_type)

    // TODO: Process webhook payload when Lightspeed partner access is granted
    // For now, just acknowledge receipt
    return Response.json({ received: true })
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 })
  }
}
