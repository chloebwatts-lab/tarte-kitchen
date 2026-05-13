/**
 * One-off: re-run the matcher against every InvoiceLineItem that
 * didn't get an ingredient match the first time round. Catches the
 * cross-supplier matches the original supplier-restricted matcher
 * missed.
 *
 * For each successful match we also detect price changes against the
 * current Ingredient.purchasePrice and update the line item flags.
 */

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { matchLineItem, detectPriceChange } from "@/lib/invoices/matcher"

export const dynamic = "force-dynamic"
export const maxDuration = 1500

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(req.url)
  const limit = Math.max(
    1,
    Math.min(5000, Number(url.searchParams.get("limit") ?? "5000"))
  )

  const unmatched = await db.invoiceLineItem.findMany({
    where: { ingredientId: null },
    include: {
      invoice: { select: { supplierId: true } },
    },
    take: limit,
  })

  let attempted = 0
  let newlyMatched = 0
  let newPriceChanges = 0
  const errors: string[] = []

  for (const line of unmatched) {
    if (!line.invoice?.supplierId) continue
    attempted++
    try {
      const match = await matchLineItem(
        line.description,
        line.invoice.supplierId
      )
      if (!match.matched) continue
      newlyMatched++

      let priceChanged = false
      let currentPrice: number | null = null
      if (line.unitPrice != null) {
        const priceResult = await detectPriceChange(
          match.ingredientId,
          Number(line.unitPrice)
        )
        if (priceResult.changed) {
          priceChanged = true
          currentPrice = priceResult.previousPrice
          newPriceChanges++
        }
      }

      await db.invoiceLineItem.update({
        where: { id: line.id },
        data: {
          ingredientId: match.ingredientId,
          mappingId: match.mappingId,
          priceChanged,
          currentPrice,
        },
      })
    } catch (e) {
      errors.push(
        `${line.id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return Response.json({
    ok: true,
    candidates: unmatched.length,
    attempted,
    newlyMatched,
    newPriceChanges,
    errors: errors.slice(0, 20),
  })
}
