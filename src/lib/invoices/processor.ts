import { db } from "@/lib/db"
import { matchLineItem, detectPriceChange } from "./matcher"
import type { ParsedInvoice } from "./parser"
import { venueFromDeliveryAddress } from "./venue-from-address"
import type { InvoiceStatus } from "@/generated/prisma"

export interface ProcessingResult {
  invoiceId: string
  status: InvoiceStatus
  totalItems: number
  matchedItems: number
  unmatchedItems: number
  priceChanges: number
}

export async function processInvoice(
  invoiceId: string,
  supplierId: string,
  parsedData: ParsedInvoice
): Promise<ProcessingResult> {
  let matchedItems = 0
  let unmatchedItems = 0
  let priceChanges = 0

  const venue = venueFromDeliveryAddress(parsedData.deliveryAddress)

  // Update invoice metadata from parsed data
  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      invoiceNumber: parsedData.invoiceNumber,
      invoiceDate: parsedData.invoiceDate ? new Date(parsedData.invoiceDate) : null,
      subtotal: parsedData.subtotal,
      gst: parsedData.gst,
      total: parsedData.total,
      venue,
      extractedData: JSON.parse(JSON.stringify(parsedData)),
    },
  })

  for (const lineItem of parsedData.lineItems) {
    // Try to match this line item to a TK ingredient
    const matchResult = await matchLineItem(lineItem.description, supplierId)

    let ingredientId: string | null = null
    let mappingId: string | null = null
    let priceChanged = false
    let currentPrice: number | null = null

    if (matchResult.matched) {
      matchedItems++
      ingredientId = matchResult.ingredientId
      mappingId = matchResult.mappingId

      // Check for price changes
      const priceResult = await detectPriceChange(ingredientId, lineItem.unitPrice)

      if (priceResult.changed) {
        priceChanges++
        priceChanged = true
        currentPrice = priceResult.previousPrice
      }
    } else {
      unmatchedItems++
    }

    // Create the line item record
    await db.invoiceLineItem.create({
      data: {
        invoiceId,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unit: lineItem.unit,
        unitPrice: lineItem.unitPrice,
        lineTotal: lineItem.totalPrice,
        ingredientId,
        mappingId,
        priceChanged,
        currentPrice,
      },
    })
  }

  // Set invoice status. Schema's InvoiceStatus enum does not have
  // PROCESSED / NEEDS_REVIEW — use the closest equivalents.
  const status: InvoiceStatus = unmatchedItems > 0 ? "EXTRACTED" : "MATCHED"

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status,
      processedAt: new Date(),
    },
  })

  return {
    invoiceId,
    status,
    totalItems: parsedData.lineItems.length,
    matchedItems,
    unmatchedItems,
    priceChanges,
  }
}

/**
 * Apply detected price changes from an invoice to TK ingredient prices.
 * This triggers recalculateCascade to propagate through preparations and dishes.
 */
export async function applyPriceChanges(invoiceId: string): Promise<number> {
  const changedItems = await db.invoiceLineItem.findMany({
    where: {
      invoiceId,
      priceChanged: true,
      priceApproved: null,
      ingredientId: { not: null },
    },
  })

  if (changedItems.length === 0) return 0

  // Import dynamically to avoid circular deps
  const { bulkUpdatePrices } = await import("@/lib/actions/ingredients")

  const updates = changedItems
    .filter((item) => item.ingredientId !== null)
    .map((item) => ({
      id: item.ingredientId!,
      purchasePrice: Number(item.unitPrice),
    }))

  await bulkUpdatePrices(updates)

  // Mark items as approved
  await db.invoiceLineItem.updateMany({
    where: {
      id: { in: changedItems.map((i) => i.id) },
    },
    data: { priceApproved: true },
  })

  return changedItems.length
}
