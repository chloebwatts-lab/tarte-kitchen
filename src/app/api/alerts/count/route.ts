export const dynamic = "force-dynamic"

import { db } from "@/lib/db"

// Banner count = OPEN v2 PriceAlerts (deduped per ingredient, unit-safe,
// produce-median filtered) — not the raw per-line v1 flags, which counted
// every unresolved invoice line since forever and peaked at 1,100+.
export async function GET() {
  const count = await db.priceAlert.count({
    where: { status: "OPEN" },
  })

  return Response.json({ count })
}
