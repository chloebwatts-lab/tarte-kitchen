"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Invoice, InvoiceLineItem, Ingredient, Supplier } from "@/generated/prisma/client"
import {
  compareUnits,
  evaluatePriceChange,
  effectiveUnitPrice,
  newPurchasePriceFromComparison,
} from "@/lib/invoices/units"
import { streamForCategory } from "@/lib/price-alerts/classifier"

type InvoiceWithItems = Invoice & {
  lineItems: (InvoiceLineItem & { ingredient: (Ingredient & { supplier: Supplier | null }) | null })[]
  supplier: Supplier | null
}

export async function getInvoices() {
  const invoices = await db.invoice.findMany({
    include: {
      _count: { select: { lineItems: true } },
      lineItems: {
        where: { priceChanged: true },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return invoices.map((inv) => ({
    id: inv.id,
    supplierId: inv.supplierId ?? null,
    supplierName: inv.supplierName,
    invoiceNumber: inv.invoiceNumber ?? null,
    invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString().split("T")[0] : null,
    totalAmount: inv.total ? Number(inv.total) : null,
    status: inv.status,
    errorMessage: inv.errorMessage ?? null,
    lineItemCount: inv._count.lineItems,
    priceChanges: inv.lineItems.length,
    createdAt: inv.createdAt.toISOString(),
  }))
}

export async function getInvoice(id: string) {
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      lineItems: {
        include: { ingredient: { include: { supplier: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  }) as InvoiceWithItems | null

  if (!inv) return null

  return {
    ...inv,
    subtotal: inv.subtotal ? Number(inv.subtotal) : null,
    gst: inv.gst ? Number(inv.gst) : null,
    total: inv.total ? Number(inv.total) : null,
    lineItems: inv.lineItems.map((li) => ({
      ...li,
      quantity: li.quantity ? Number(li.quantity) : null,
      unitPrice: li.unitPrice ? Number(li.unitPrice) : null,
      lineTotal: li.lineTotal ? Number(li.lineTotal) : null,
      currentPrice: li.currentPrice ? Number(li.currentPrice) : null,
      normalisedUnitPrice: li.normalisedUnitPrice ? Number(li.normalisedUnitPrice) : null,
      suggestedConversionFactor: li.suggestedConversionFactor ? Number(li.suggestedConversionFactor) : null,
    })),
  }
}

export async function matchLineItem(lineItemId: string, ingredientId: string) {
  const lineItem = await db.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    include: { invoice: true },
  })
  if (!lineItem) throw new Error("Line item not found")

  const ingredient = await db.ingredient.findUnique({
    where: { id: ingredientId },
    select: { id: true, name: true, purchasePrice: true, purchaseQuantity: true, purchaseUnit: true, category: true },
  })
  if (!ingredient) throw new Error("Ingredient not found")

  // Look up an existing supplier-item conversion factor if one was confirmed
  // for an earlier line. Keyed by (supplier, description).
  let mappingConversion: number | null = null
  let mappingInvoiceUnit: string | null = null
  if (lineItem.invoice.supplierId) {
    const existing = await db.supplierItemMapping.findUnique({
      where: {
        supplierId_invoiceDescription: {
          supplierId: lineItem.invoice.supplierId,
          invoiceDescription: lineItem.description,
        },
      },
      select: { conversionFactor: true, invoiceUnit: true, ignored: true, ingredientId: true },
    })
    // An ignored mapping's factor is knowledge about a REJECTED pairing —
    // never apply it. And a factor learned for a different ingredient is in
    // that ingredient's unit basis — also unusable here.
    if (existing && !existing.ignored && existing.ingredientId === ingredientId) {
      mappingConversion = existing.conversionFactor ? Number(existing.conversionFactor) : null
      mappingInvoiceUnit = existing.invoiceUnit ?? null
    }
  }

  const evaluation = evaluatePriceChange(
    {
      purchaseUnit: ingredient.purchaseUnit,
      purchaseQuantity: Number(ingredient.purchaseQuantity),
      purchasePrice: Number(ingredient.purchasePrice),
    },
    {
      unit: lineItem.unit,
      unitPrice: effectiveUnitPrice(
        lineItem.unitPrice ? Number(lineItem.unitPrice) : null,
        lineItem.quantity ? Number(lineItem.quantity) : null,
        lineItem.lineTotal ? Number(lineItem.lineTotal) : null
      ),
      description: lineItem.description,
    },
    mappingConversion,
    mappingInvoiceUnit
  )

  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: {
      ingredientId,
      matchConfidence: "manual",
      matchedName: ingredient.name,
      currentPrice: evaluation.currentPrice,
      priceChanged: evaluation.priceChanged,
      // Produce never enters the unit-review queue (standing rule
      // 2026-07-15) — floating tray/bunch pack sizes skip silently.
      unitChanged:
        streamForCategory(ingredient.category) === "PRODUCE" ? false : evaluation.unitChanged,
      normalisedUnitPrice: evaluation.normalisedUnitPrice,
      suggestedConversionFactor:
        streamForCategory(ingredient.category) === "PRODUCE" ? null : evaluation.suggestedConversionFactor,
    },
  })

  // Create supplier-item mapping for future auto-matching. On a RE-map the
  // old ingredient's conversion factor is meaningless for the new one (it's
  // in the old ingredient's unit basis) — clear it so the pipeline falls
  // back to description parsing / unit review rather than silently applying
  // a factor from a different product. A manual re-map also un-ignores.
  if (lineItem.invoice.supplierId) {
    const prior = await db.supplierItemMapping.findUnique({
      where: {
        supplierId_invoiceDescription: {
          supplierId: lineItem.invoice.supplierId,
          invoiceDescription: lineItem.description,
        },
      },
      select: { ingredientId: true },
    })
    const isRemap = prior !== null && prior.ingredientId !== ingredientId
    await db.supplierItemMapping.upsert({
      where: {
        supplierId_invoiceDescription: {
          supplierId: lineItem.invoice.supplierId,
          invoiceDescription: lineItem.description,
        },
      },
      update: {
        ingredientId,
        lastUsed: new Date(),
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ...(isRemap ? { conversionFactor: null, invoiceUnit: lineItem.unit } : {}),
      },
      create: {
        supplierId: lineItem.invoice.supplierId,
        invoiceDescription: lineItem.description,
        ingredientId,
        invoiceUnit: lineItem.unit,
      },
    })
  }

  // Check if all items are now matched
  const unmatched = await db.invoiceLineItem.count({
    where: { invoiceId: lineItem.invoiceId, ingredientId: null },
  })
  if (unmatched === 0) {
    await db.invoice.update({
      where: { id: lineItem.invoiceId },
      data: { status: "MATCHED" },
    })
  }

  revalidatePath("/invoices")
  return true
}

export async function getPendingPriceChanges() {
  const lineItems = await db.invoiceLineItem.findMany({
    where: {
      priceChanged: true,
      priceApproved: null,
      ingredientId: { not: null },
    },
    include: {
      invoice: { include: { supplier: true } },
      ingredient: {
        include: {
          supplier: true,
          preparationItems: {
            include: { preparation: { include: { dishComponents: { include: { dish: true } } } } },
          },
          dishComponents: { include: { dish: true } },
        },
      },
    },
    orderBy: { invoice: { createdAt: "desc" } },
  })

  return lineItems.map((li) => {
    // Calculate cascade impact
    const affectedPreps = li.ingredient?.preparationItems?.map((pi) => pi.preparation.name) || []
    const affectedDishesFromPreps = li.ingredient?.preparationItems?.flatMap(
      (pi) => pi.preparation.dishComponents?.map((dc) => dc.dish.name) || []
    ) || []
    const affectedDishesDirectly = li.ingredient?.dishComponents?.map((dc) => dc.dish.name) || []
    const allAffectedDishes = [...new Set([...affectedDishesFromPreps, ...affectedDishesDirectly])]

    return {
      id: li.id,
      invoiceId: li.invoiceId,
      description: li.description,
      supplierName: li.invoice.supplierName,
      invoiceNumber: li.invoice.invoiceNumber,
      invoiceDate: li.invoice.invoiceDate,
      ingredientName: li.ingredient?.name || null,
      ingredientId: li.ingredientId,
      currentPrice: li.currentPrice ? Number(li.currentPrice) : null,
      newUnitPrice: li.unitPrice ? Number(li.unitPrice) : null,
      quantity: li.quantity ? Number(li.quantity) : null,
      unit: li.unit,
      lineTotal: li.lineTotal ? Number(li.lineTotal) : null,
      affectedPreparations: [...new Set(affectedPreps)],
      affectedDishes: allAffectedDishes,
    }
  })
}

export async function approvePriceChange(lineItemId: string) {
  const li = await db.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    include: { invoice: true },
  })
  if (!li || !li.ingredientId || !li.unitPrice) throw new Error("Invalid line item")

  const ingredient = await db.ingredient.findUnique({ where: { id: li.ingredientId } })
  if (!ingredient) throw new Error("Ingredient not found")

  // Re-run the unit comparison at apply-time so an in-flight unit change
  // (or a mapping that's since been ignored) can't slip through and clobber
  // the stored price. Refuses to apply unless the line is like-for-like or
  // a conversion exists.
  let mappingConversion: number | null = null
  let mappingInvoiceUnit: string | null = null
  if (li.invoice.supplierId) {
    const mapping = await db.supplierItemMapping.findUnique({
      where: {
        supplierId_invoiceDescription: {
          supplierId: li.invoice.supplierId,
          invoiceDescription: li.description,
        },
      },
      select: { conversionFactor: true, invoiceUnit: true, ignored: true },
    })
    if (mapping && !mapping.ignored) {
      mappingConversion = mapping.conversionFactor ? Number(mapping.conversionFactor) : null
      mappingInvoiceUnit = mapping.invoiceUnit ?? null
    }
  }

  const result = compareUnits(
    {
      purchaseUnit: ingredient.purchaseUnit,
      purchaseQuantity: Number(ingredient.purchaseQuantity),
      purchasePrice: Number(ingredient.purchasePrice),
    },
    {
      unit: li.unit,
      unitPrice: effectiveUnitPrice(
        Number(li.unitPrice),
        li.quantity ? Number(li.quantity) : null,
        li.lineTotal ? Number(li.lineTotal) : null
      ),
      description: li.description,
    },
    mappingConversion,
    mappingInvoiceUnit
  )

  if (result.kind === "skip" || result.kind === "unit_changed") {
    throw new Error(
      result.kind === "unit_changed"
        ? `Pack/unit changed (invoice "${result.invoiceUnit}" vs stored "${result.storedUnit}") — confirm a conversion factor before applying.`
        : `Cannot apply: ${result.reason}`
    )
  }

  const newPurchasePrice = newPurchasePriceFromComparison(
    result,
    Number(ingredient.purchaseQuantity)
  )

  // Record price history
  await db.priceHistory.create({
    data: {
      ingredientId: li.ingredientId,
      oldPrice: Number(ingredient.purchasePrice),
      newPrice: newPurchasePrice,
      oldUnit: ingredient.purchaseUnit,
      oldQuantity: Number(ingredient.purchaseQuantity),
    },
  })

  // Update ingredient price
  await db.ingredient.update({
    where: { id: li.ingredientId },
    data: { purchasePrice: newPurchasePrice },
  })

  // Mark as approved
  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: { priceApproved: true },
  })

  // Keep the v2 alert surface (/price-alerts) in sync: applying the price
  // here resolves the open PriceAlert for this ingredient too — otherwise
  // the other page keeps showing an alert the chef already actioned.
  await db.priceAlert.updateMany({
    where: { ingredientId: li.ingredientId, status: "OPEN" },
    data: { status: "ACCEPTED", resolvedAt: new Date() },
  })

  // Cascade recalculation (reuse existing logic)
  const { recalculateAll } = await import("./ingredients")
  await recalculateAll()

  // Check if all price changes for this invoice are resolved
  const pending = await db.invoiceLineItem.count({
    where: {
      invoiceId: li.invoiceId,
      priceChanged: true,
      priceApproved: null,
    },
  })
  if (pending === 0) {
    await db.invoice.update({
      where: { id: li.invoiceId },
      data: { status: "APPROVED", approvedAt: new Date() },
    })
  }

  revalidatePath("/invoices")
  revalidatePath("/ingredients")
  revalidatePath("/preparations")
  revalidatePath("/dishes")
  return true
}

export async function rejectPriceChange(lineItemId: string) {
  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: { priceApproved: false },
  })

  const li = await db.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    select: { invoiceId: true },
  })
  if (li) {
    const pending = await db.invoiceLineItem.count({
      where: {
        invoiceId: li.invoiceId,
        priceChanged: true,
        priceApproved: null,
      },
    })
    if (pending === 0) {
      await db.invoice.update({
        where: { id: li.invoiceId },
        data: { status: "APPROVED", approvedAt: new Date() },
      })
    }
  }

  revalidatePath("/invoices")
  return true
}

/**
 * Stronger reject: marks this line as rejected AND flags the underlying
 * supplier-item mapping as ignored, so future invoices from the same
 * supplier with the same description don't auto-match to this (wrong)
 * ingredient again. Also un-flags the line (priceChanged=false,
 * ingredientId/mappingId cleared) so the rematch endpoint can take
 * another shot at it with a clean slate.
 */
export async function rejectAndIgnoreMapping(lineItemId: string) {
  const line = await db.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      id: true,
      mappingId: true,
      invoiceId: true,
      description: true,
      invoice: { select: { supplierId: true } },
    },
  })
  if (!line) throw new Error("Line not found")

  // Mark mapping as ignored — by id if we have one, otherwise by
  // (supplier, description) lookup.
  if (line.mappingId) {
    await db.supplierItemMapping.update({
      where: { id: line.mappingId },
      data: { ignored: true, ignoredAt: new Date() },
    })
  } else if (line.invoice?.supplierId) {
    await db.supplierItemMapping
      .updateMany({
        where: {
          supplierId: line.invoice.supplierId,
          invoiceDescription: line.description,
        },
        data: { ignored: true, ignoredAt: new Date() },
      })
      .catch(() => null)
  }

  // Reset the line so the next rematch can try fresh.
  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: {
      priceApproved: false,
      priceChanged: false,
      ingredientId: null,
      mappingId: null,
      currentPrice: null,
    },
  })

  revalidatePath("/suppliers")
  revalidatePath("/invoices")
  return { ok: true }
}

export async function approveAllPriceChanges(invoiceId?: string) {
  // No invoiceId = the alerts tab's "Apply all": every pending change.
  const lineItems = await db.invoiceLineItem.findMany({
    where: {
      ...(invoiceId ? { invoiceId } : {}),
      priceChanged: true,
      priceApproved: null,
      ingredientId: { not: null },
    },
  })

  // One refused line (unit changed since flagging, mapping since ignored)
  // must not abort the rest of the batch — collect and report instead.
  let applied = 0
  const failed: string[] = []
  for (const li of lineItems) {
    try {
      await approvePriceChange(li.id)
      applied++
    } catch {
      failed.push(li.description)
    }
  }
  return { applied, failed }
}

export async function getGmailStatus() {
  const conn = await db.gmailConnection.findFirst()
  return conn
    ? {
        connected: true,
        email: conn.email,
        lastScanAt: conn.lastScanAt,
        scanFrequency: conn.scanFrequency,
      }
    : { connected: false, email: null, lastScanAt: null, scanFrequency: 60 }
}

export async function updateScanFrequency(minutes: number) {
  const conn = await db.gmailConnection.findFirst()
  if (!conn) throw new Error("Gmail not connected")
  await db.gmailConnection.update({
    where: { id: conn.id },
    data: { scanFrequency: minutes },
  })
  revalidatePath("/invoices")
  return true
}

export async function disconnectGmail() {
  await db.gmailConnection.deleteMany()
  revalidatePath("/invoices")
  return true
}

// ============================================================
// PRICE ALERTS (thin wrappers over the price-change line items)
// ============================================================

// Alert = an InvoiceLineItem whose invoice price disagrees with the current
// ingredient price. priceApproved is the tri-state: null = pending,
// true = applied, false = acknowledged/rejected.

export async function getPriceAlerts() {
  const items = await db.invoiceLineItem.findMany({
    where: { priceChanged: true },
    include: {
      invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, supplierName: true, supplierId: true } },
      ingredient: { select: { id: true, name: true, purchaseUnit: true, purchaseQuantity: true, purchasePrice: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  // Pre-fetch any conversion factors so we can show the user the price in
  // the ingredient's purchase unit (not the invoice's), keeping the +%
  // honest for converted rows.
  const conversionLookup = new Map<string, { factor: number; invoiceUnit: string | null }>()
  const lookupKeys = items
    .filter((li) => li.invoice.supplierId && li.ingredient)
    .map((li) => ({ supplierId: li.invoice.supplierId!, description: li.description }))
  if (lookupKeys.length > 0) {
    const mappings = await db.supplierItemMapping.findMany({
      where: {
        ignored: false,
        OR: lookupKeys.map((k) => ({
          supplierId: k.supplierId,
          invoiceDescription: k.description,
        })),
      },
      select: { supplierId: true, invoiceDescription: true, conversionFactor: true, invoiceUnit: true },
    })
    for (const m of mappings) {
      if (m.conversionFactor) {
        conversionLookup.set(`${m.supplierId}::${m.invoiceDescription}`, {
          factor: Number(m.conversionFactor),
          invoiceUnit: m.invoiceUnit ?? null,
        })
      }
    }
  }

  return items.map((li) => {
    const rawInvoiceUnitPrice = li.unitPrice ? Number(li.unitPrice) : 0
    const previousPrice = li.currentPrice ? Number(li.currentPrice) : null
    const supplierId = li.invoice.supplierId

    // Default: same-unit row, the stored currentPrice and the invoice's
    // unitPrice are already in the same units.
    let displayUnit = li.unit ?? ""
    let displayUnitPrice = rawInvoiceUnitPrice

    // Fast path: if the processor wrote a normalised per-base-unit price,
    // use it directly (avoids re-running compareUnits on every page load).
    if (li.normalisedUnitPrice != null && li.ingredient) {
      displayUnit = li.ingredient.purchaseUnit
      displayUnitPrice = Number(li.normalisedUnitPrice)
    } else if (li.ingredient && supplierId) {
      const conversion = conversionLookup.get(`${supplierId}::${li.description}`)
      const result = compareUnits(
        {
          purchaseUnit: li.ingredient.purchaseUnit,
          purchaseQuantity: Number(li.ingredient.purchaseQuantity),
          purchasePrice: Number(li.ingredient.purchasePrice),
        },
        {
          unit: li.unit,
          unitPrice: rawInvoiceUnitPrice,
          description: li.description,
        },
        conversion?.factor ?? null,
        conversion?.invoiceUnit ?? null
      )
      if (result.kind === "converted") {
        displayUnit = li.ingredient.purchaseUnit
        displayUnitPrice = result.invoiceUnitPriceInStoredUnits
      } else if (result.kind === "same_unit") {
        displayUnit = li.ingredient.purchaseUnit
      }
    }

    const priceChangeAmount =
      previousPrice !== null ? displayUnitPrice - previousPrice : null
    const priceChangePercent =
      previousPrice !== null && previousPrice !== 0
        ? ((displayUnitPrice - previousPrice) / previousPrice) * 100
        : null

    return {
      id: li.id,
      invoiceId: li.invoiceId,
      invoiceNumber: li.invoice.invoiceNumber ?? null,
      invoiceDate: li.invoice.invoiceDate
        ? li.invoice.invoiceDate.toISOString().split("T")[0]
        : null,
      supplierName: li.invoice.supplierName,
      supplierId: li.invoice.supplierId ?? null,
      description: li.description,
      ingredientId: li.ingredientId ?? null,
      ingredientName: li.ingredient?.name ?? li.description,
      quantity: li.quantity ? Number(li.quantity) : 0,
      unit: displayUnit,
      unitPrice: displayUnitPrice,
      previousPrice,
      priceChangeAmount,
      priceChangePercent,
      acknowledged: li.priceApproved !== null,
      createdAt: li.createdAt.toISOString(),
    }
  })
}

export interface UnitChangedAlert {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  invoiceDate: string | null
  supplierName: string
  supplierId: string | null
  description: string
  ingredientId: string | null
  ingredientName: string
  storedUnit: string
  storedQuantity: number
  storedUnitPrice: number
  invoiceUnit: string
  invoiceUnitPrice: number
  suggestedConversionFactor: number | null
}

export async function getUnitChangedAlerts(): Promise<UnitChangedAlert[]> {
  const items = await db.invoiceLineItem.findMany({
    where: { unitChanged: true, priceApproved: null },
    include: {
      invoice: { select: { invoiceNumber: true, invoiceDate: true, supplierName: true, supplierId: true } },
      ingredient: { select: { id: true, name: true, purchaseUnit: true, purchaseQuantity: true, purchasePrice: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return items.map((li) => {
    const ing = li.ingredient
    const purchaseQuantity = ing ? Number(ing.purchaseQuantity) : 1
    const purchasePrice = ing ? Number(ing.purchasePrice) : 0
    return {
      id: li.id,
      invoiceId: li.invoiceId,
      invoiceNumber: li.invoice.invoiceNumber ?? null,
      invoiceDate: li.invoice.invoiceDate
        ? li.invoice.invoiceDate.toISOString().split("T")[0]
        : null,
      supplierName: li.invoice.supplierName,
      supplierId: li.invoice.supplierId ?? null,
      description: li.description,
      ingredientId: li.ingredientId,
      ingredientName: ing?.name ?? li.description,
      storedUnit: ing?.purchaseUnit ?? "",
      storedQuantity: purchaseQuantity,
      storedUnitPrice: purchaseQuantity > 0 ? purchasePrice / purchaseQuantity : 0,
      invoiceUnit: li.unit ?? "",
      invoiceUnitPrice: li.unitPrice ? Number(li.unitPrice) : 0,
      suggestedConversionFactor: li.suggestedConversionFactor
        ? Number(li.suggestedConversionFactor)
        : null,
    }
  })
}

/**
 * User has confirmed how the invoice unit relates to the stored purchase
 * unit. The argument is the HUMAN answer to "1 <invoice unit> = how many
 * <stored unit>s?" (e.g. 1 carton = 5 when stored per-kg and the carton
 * holds 5 kg). The ENGINE multiplies invoice price × factor to get the
 * per-stored-unit price, so what we store is the RECIPROCAL: 1/5.
 * Getting this backwards was the single biggest source of corrupted
 * prices (a 5 kg carton saved as ×5 instead of ÷5 = 25× off) — keep the
 * human semantics at this boundary and the engine semantics below it.
 */
export async function confirmConversion(lineItemId: string, storedUnitsPerInvoiceUnit: number) {
  if (!Number.isFinite(storedUnitsPerInvoiceUnit) || storedUnitsPerInvoiceUnit <= 0) {
    throw new Error("Conversion must be a positive number")
  }
  const conversionFactor = 1 / storedUnitsPerInvoiceUnit

  const li = await db.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    include: { invoice: { select: { supplierId: true } } },
  })
  if (!li || !li.ingredientId) throw new Error("Line not matched to an ingredient")
  if (!li.invoice.supplierId) throw new Error("Invoice has no supplier")

  const ingredient = await db.ingredient.findUnique({
    where: { id: li.ingredientId },
    select: { purchasePrice: true, purchaseQuantity: true, purchaseUnit: true },
  })
  if (!ingredient) throw new Error("Ingredient not found")

  await db.supplierItemMapping.upsert({
    where: {
      supplierId_invoiceDescription: {
        supplierId: li.invoice.supplierId,
        invoiceDescription: li.description,
      },
    },
    update: {
      conversionFactor,
      invoiceUnit: li.unit,
      lastUsed: new Date(),
    },
    create: {
      supplierId: li.invoice.supplierId,
      invoiceDescription: li.description,
      ingredientId: li.ingredientId,
      invoiceUnit: li.unit,
      conversionFactor,
    },
  })

  const evaluation = evaluatePriceChange(
    {
      purchaseUnit: ingredient.purchaseUnit,
      purchaseQuantity: Number(ingredient.purchaseQuantity),
      purchasePrice: Number(ingredient.purchasePrice),
    },
    {
      unit: li.unit,
      unitPrice: effectiveUnitPrice(
        li.unitPrice ? Number(li.unitPrice) : null,
        li.quantity ? Number(li.quantity) : null,
        li.lineTotal ? Number(li.lineTotal) : null
      ),
      description: li.description,
    },
    conversionFactor,
    // The mapping upserted just above records invoiceUnit = this line's unit,
    // so the factor is by construction valid for this line.
    li.unit
  )

  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: {
      priceChanged: evaluation.priceChanged,
      unitChanged: false,
      currentPrice: evaluation.currentPrice,
      normalisedUnitPrice: evaluation.normalisedUnitPrice,
      suggestedConversionFactor: null,
    },
  })

  revalidatePath("/suppliers")
  return { ok: true, priceChanged: evaluation.priceChanged }
}

export async function getUnacknowledgedAlertCount(): Promise<number> {
  return db.invoiceLineItem.count({
    where: {
      OR: [
        { priceChanged: true, priceApproved: null },
        { unitChanged: true, priceApproved: null },
      ],
    },
  })
}

export async function acknowledgeAlert(lineItemId: string) {
  // Acknowledge = reject the price change (mark handled without applying).
  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: { priceApproved: false },
  })
  revalidatePath("/suppliers")
}

export async function acknowledgeAllAlerts() {
  await db.invoiceLineItem.updateMany({
    where: { priceChanged: true, priceApproved: null },
    data: { priceApproved: false },
  })
  revalidatePath("/suppliers")
}

export async function applyAndAcknowledgeAlert(lineItemId: string) {
  // Apply the price change, which also marks it approved (=acknowledged).
  return approvePriceChange(lineItemId)
}

export async function applyAllPriceChanges(invoiceId?: string) {
  return approveAllPriceChanges(invoiceId)
}

// ============================================================
// MANUAL SUPPLIER ITEM MAPPING
// ============================================================

export async function createManualMapping(input: {
  supplierId: string
  invoiceDescription: string
  ingredientId: string
  invoiceUnit?: string | null
  conversionFactor?: number | null
}) {
  await db.supplierItemMapping.upsert({
    where: {
      supplierId_invoiceDescription: {
        supplierId: input.supplierId,
        invoiceDescription: input.invoiceDescription,
      },
    },
    update: {
      ingredientId: input.ingredientId,
      invoiceUnit: input.invoiceUnit ?? null,
      conversionFactor: input.conversionFactor ?? null,
      lastUsed: new Date(),
    },
    create: {
      supplierId: input.supplierId,
      invoiceDescription: input.invoiceDescription,
      ingredientId: input.ingredientId,
      invoiceUnit: input.invoiceUnit ?? null,
      conversionFactor: input.conversionFactor ?? null,
    },
  })
  revalidatePath("/suppliers")
}
