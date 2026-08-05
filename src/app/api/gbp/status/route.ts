export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getGbpConnectionStatus } from "@/lib/gbp/token"

export async function GET() {
  return Response.json(await getGbpConnectionStatus())
}

export async function DELETE(req: NextRequest) {
  // Destructive: wipes the GBP connection + per-venue location bindings.
  // Allow either the cron bearer secret (droplet-internal callers) or an
  // authenticated dashboard session.
  const authHeader = req.headers.get("authorization")
  const hasCronAuth =
    Boolean(process.env.CRON_SECRET) &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!hasCronAuth) {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response("Unauthorized", { status: 401 })
    }
  }

  const { db } = await import("@/lib/db")
  await db.gbpConnection.deleteMany()
  // Also clear the per-venue location bindings so a fresh connection
  // can re-resolve them from a (possibly different) GBP account.
  await db.googleVenuePlace.updateMany({
    data: { gbpLocationName: null },
  })
  return Response.json({ ok: true })
}
