export const dynamic = "force-dynamic"

import { db } from "@/lib/db"

export async function GET() {
  const count = await db.invoiceLineItem.count({
    where: { priceChanged: true, acknowledged: false },
  })

  return Response.json({ count })
}
