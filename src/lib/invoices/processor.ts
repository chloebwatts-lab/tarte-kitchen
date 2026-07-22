import { db } from "@/lib/db"
import { matchLineItem } from "./matcher"
import type { ParsedInvoice } from "./parser"
import {
  venueFromText,
  defaultVenueForSupplier,
} from "./venue-from-address"
import type { InvoiceStatus } from "@/generated/prisma"
import { evaluatePriceChange, effectiveUnitPrice } from "./units"
import { streamForCategory } from "@/lib/price-alerts/classifier"

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

  // Venue resolution, most-reliable signal first:
  //   1. delivery (ship-to) address text
  //   2. bill-to / account block (who's charged — names the venue when
  //      there's no ship-to, e.g. Paramount/Pencilpay portal PDFs)
  //   3. per-supplier default, keyed off the CANONICAL matched supplier —
  //      NOT parsedData.supplierName, which is whatever Claude read off the
  //      PDF (often a payment processor like "Pencil.One" or a bill-to
  //      entity) and so never matched the supplier rules.
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { name: true },
  })
  // Guard the per-supplier default: only trust it when the PDF actually
  // corroborates this supplier (its name appears, or it's billed to Tarte).
  // Otherwise a mis-matched non-supplier invoice — e.g. a visa or software
  // subscription the Gmail matcher wrongly attached to "Paramount Liquor" —
  // would be force-routed into that supplier's venue and pollute its spend.
  const canonicalName = supplier?.name ?? null
  const pdfText = `${parsedData.supplierName ?? ""} ${parsedData.billTo ?? ""} ${
    parsedData.deliveryAddress ?? ""
  }`.toLowerCase()
  const canonicalToken = canonicalName?.toLowerCase().split(/\s+/)[0] ?? ""
  const pdfCorroboratesSupplier =
    pdfText.includes("tarte") ||
    (canonicalToken.length >= 3 && pdfText.includes(canonicalToken))
  const venue =
    venueFromText(parsedData.deliveryAddress) ??
    venueFromText(parsedData.billTo) ??
    (pdfCorroboratesSupplier ? defaultVenueForSupplier(canonicalName) : null)

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
    let unitChanged = false
    let currentPrice: number | null = null
    let suggestedConversionFactor: number | null = null
    let normalisedUnitPrice: number | null = null

    if (matchResult.matched) {
      matchedItems++
      ingredientId = matchResult.ingredientId
      mappingId = matchResult.mappingId

      const ing = await db.ingredient.findUnique({
        where: { id: ingredientId },
        select: { purchasePrice: true, purchaseQuantity: true, purchaseUnit: true, category: true },
      })
      // If the matcher reused a SupplierItemMapping it may already carry a
      // conversion factor (a one-tap confirm from a prior invoice).
      let mappingConversion: number | null = null
      let mappingInvoiceUnit: string | null = null
      if (mappingId) {
        const mapping = await db.supplierItemMapping.findUnique({
          where: { id: mappingId },
          select: { conversionFactor: true, invoiceUnit: true },
        })
        mappingConversion = mapping?.conversionFactor ? Number(mapping.conversionFactor) : null
        mappingInvoiceUnit = mapping?.invoiceUnit ?? null
      }
      if (ing) {
        const evaluation = evaluatePriceChange(
          {
            purchaseUnit: ing.purchaseUnit,
            purchaseQuantity: Number(ing.purchaseQuantity),
            purchasePrice: Number(ing.purchasePrice),
          },
          {
            unit: lineItem.unit,
            unitPrice: effectiveUnitPrice(
              lineItem.unitPrice,
              lineItem.quantity ?? null,
              lineItem.totalPrice ?? null
            ),
            description: lineItem.description,
          },
          mappingConversion,
          mappingInvoiceUnit
        )
        priceChanged = evaluation.priceChanged
        unitChanged = evaluation.unitChanged
        currentPrice = evaluation.currentPrice
        suggestedConversionFactor = evaluation.suggestedConversionFactor
        normalisedUnitPrice = evaluation.normalisedUnitPrice
        // Chloe 2026-07-15: fruit & veg with floating pack sizes (tray one
        // week, bunch the next) must NOT pile into the unit-review queue —
        // produce only alerts on like-for-like comparisons (same unit or a
        // confirmed conversion). Unresolvable produce units skip silently.
        if (unitChanged && streamForCategory(ing.category) === "PRODUCE") {
          unitChanged = false
          suggestedConversionFactor = null
        }
        if (priceChanged) priceChanges++
      }
    } else {
      unmatchedItems++
    }

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
        unitChanged,
        currentPrice,
        normalisedUnitPrice,
        suggestedConversionFactor,
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
      // Only lines whose price passed the units.ts gate — raw unitPrice on a
      // pack-priced line is NOT a purchase price.
      normalisedUnitPrice: { not: null },
    },
  })

  if (changedItems.length === 0) return 0

  // Import dynamically to avoid circular deps
  const { bulkUpdatePrices } = await import("@/lib/actions/ingredients")

  // Ingredient.purchasePrice covers purchaseQuantity purchase-units, while
  // normalisedUnitPrice is per single purchase-unit — multiply back up.
  // (The old code wrote the RAW invoice unitPrice as the purchasePrice,
  // so approving a carton-priced alert corrupted a per-kg ingredient and
  // every invoice after that re-alerted against the corrupted price.)
  const ingredients = await db.ingredient.findMany({
    where: { id: { in: changedItems.map((i) => i.ingredientId!) } },
    select: { id: true, purchaseQuantity: true },
  })
  const qtyById = new Map(ingredients.map((i) => [i.id, Number(i.purchaseQuantity)]))

  const updates = changedItems
    .filter((item) => item.ingredientId !== null && qtyById.has(item.ingredientId))
    .map((item) => ({
      id: item.ingredientId!,
      purchasePrice:
        Number(item.normalisedUnitPrice) * qtyById.get(item.ingredientId!)!,
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
