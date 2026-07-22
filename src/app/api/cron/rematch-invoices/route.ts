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
import { matchLineItem } from "@/lib/invoices/matcher"
import { evaluatePriceChange, effectiveUnitPrice } from "@/lib/invoices/units"
import { streamForCategory } from "@/lib/price-alerts/classifier"

export const dynamic = "force-dynamic"
export const maxDuration = 1500

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(req.url)
  const totalLimit = Math.max(
    1,
    Math.min(10000, Number(url.searchParams.get("limit") ?? "10000"))
  )
  const batchSize = 200

  let attempted = 0
  let newlyMatched = 0
  let newPriceChanges = 0
  const errors: string[] = []
  let processed = 0

  // Page through unmatched lines. Each batch fetches min(batchSize, remaining)
  // and we advance a cursor by lineItem.id (cuid is lexicographically
  // sortable so a simple `cursor` pagination keeps memory flat).
  let cursor: string | undefined
  while (processed < totalLimit) {
    const remaining = totalLimit - processed
    const take = Math.min(batchSize, remaining)
    const batch = await db.invoiceLineItem.findMany({
      where: {
        ingredientId: null,
        invoice: { status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] } },
      },
      include: { invoice: { select: { supplierId: true } } },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (batch.length === 0) break

    for (const line of batch) {
      processed++
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
        let unitChanged = false
        let currentPrice: number | null = null
        let suggestedConversionFactor: number | null = null
        let normalisedUnitPrice: number | null = null
        if (line.unitPrice != null) {
          const ing = await db.ingredient.findUnique({
            where: { id: match.ingredientId },
            select: { purchasePrice: true, purchaseQuantity: true, purchaseUnit: true, category: true },
          })
          let mappingConversion: number | null = null
          let mappingInvoiceUnit: string | null = null
          if (match.mappingId) {
            const mapping = await db.supplierItemMapping.findUnique({
              where: { id: match.mappingId },
              select: { conversionFactor: true, invoiceUnit: true, ignored: true },
            })
            if (mapping && !mapping.ignored) {
              mappingConversion = mapping.conversionFactor ? Number(mapping.conversionFactor) : null
              mappingInvoiceUnit = mapping.invoiceUnit ?? null
            }
          }
          if (ing) {
            const evaluation = evaluatePriceChange(
              {
                purchaseUnit: ing.purchaseUnit,
                purchaseQuantity: Number(ing.purchaseQuantity),
                purchasePrice: Number(ing.purchasePrice),
              },
              {
                unit: line.unit,
                unitPrice: effectiveUnitPrice(
                  Number(line.unitPrice),
                  line.quantity != null ? Number(line.quantity) : null,
                  line.lineTotal != null ? Number(line.lineTotal) : null
                ),
                description: line.description,
              },
              mappingConversion,
              mappingInvoiceUnit
            )
            priceChanged = evaluation.priceChanged
            unitChanged = evaluation.unitChanged
            currentPrice = evaluation.currentPrice
            suggestedConversionFactor = evaluation.suggestedConversionFactor
            normalisedUnitPrice = evaluation.normalisedUnitPrice
            // Produce never enters the unit-review queue (standing rule
            // 2026-07-15) — the processor suppresses this; the rematch
            // path must too or produce piles back in nightly.
            if (unitChanged && streamForCategory(ing.category) === "PRODUCE") {
              unitChanged = false
              suggestedConversionFactor = null
            }
            if (priceChanged) newPriceChanges++
          }
        }

        await db.invoiceLineItem.update({
          where: { id: line.id },
          data: {
            ingredientId: match.ingredientId,
            mappingId: match.mappingId,
            priceChanged,
            unitChanged,
            currentPrice,
            normalisedUnitPrice,
            suggestedConversionFactor,
          },
        })
      } catch (e) {
        errors.push(
          `${line.id}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }

    cursor = batch[batch.length - 1].id
    if (batch.length < take) break
  }

  return Response.json({
    ok: true,
    processed,
    attempted,
    newlyMatched,
    newPriceChanges,
    errors: errors.slice(0, 20),
  })
}
