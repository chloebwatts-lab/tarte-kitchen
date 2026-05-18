export const dynamic = "force-dynamic"

import { getGbpConnectionStatus } from "@/lib/gbp/token"

export async function GET() {
  return Response.json(await getGbpConnectionStatus())
}

export async function DELETE() {
  const { db } = await import("@/lib/db")
  await db.gbpConnection.deleteMany()
  // Also clear the per-venue location bindings so a fresh connection
  // can re-resolve them from a (possibly different) GBP account.
  await db.googleVenuePlace.updateMany({
    data: { gbpLocationName: null },
  })
  return Response.json({ ok: true })
}
