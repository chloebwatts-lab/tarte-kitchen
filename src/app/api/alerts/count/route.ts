export const dynamic = "force-dynamic"

import { db } from "@/lib/db"

export async function GET() {
  const count = await db.invoiceLineItem.count({
    where: { priceChanged: true, priceApproved: null },
  })

  return Response.json({ count })
}
