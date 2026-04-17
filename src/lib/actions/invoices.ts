"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Invoice, InvoiceLineItem, Ingredient, Supplier } from "@/generated/prisma/client"

type InvoiceWithItems = Invoice & {
  lineItems: (InvoiceLineItem & { ingredient: (Ingredient & { supplier: Supplier | null }) | null })[]
  supplier: Supplier | null
}

export async function getInvoices(filters?: {
  status?: string
  supplier?: string
  venue?: string
  dateFrom?: string
  dateTo?: string
}) {
  const where: Record<string, unknown> = {}

  if (filters?.status && filters.status !== "ALL") {
    where.status = filters.status
  }
  if (filters?.supplier) {
    where.supplierName = { contains: filters.supplier, mode: "insensitive" }
  }
  if (filters?.venue && filters.venue !== "ALL") {
    where.venue = filters.venue
  }
  if (filters?.dateFrom || filters?.dateTo) {
    where.invoiceDate = {}
    if (filters?.dateFrom) (where.invoiceDate as Record<string, unknown>).gte = new Date(filters.dateFrom)
    if (filters?.dateTo) (where.invoiceDate as Record<string, unknown>).lte = new Date(filters.dateTo)
  }

  const invoices = await db.invoice.findMany({
    where,
    include: {
      supplier: true,
      lineItems: {
        include: { ingredient: { include: { supplier: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return invoices.map((inv) => ({
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
    })),
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
    select: { id: true, name: true, purchasePrice: true, purchaseQuantity: true },
  })
  if (!ingredient) throw new Error("Ingredient not found")

  // Detect price change
  const currentPrice = Number(ingredient.purchasePrice)
  const storedUnitPrice = Number(ingredient.purchasePrice) / Number(ingredient.purchaseQuantity)
  const invoiceUnitPrice = lineItem.unitPrice ? Number(lineItem.unitPrice) : null
  const priceChanged = invoiceUnitPrice != null && Math.abs(invoiceUnitPrice - storedUnitPrice) > 0.01

  await db.invoiceLineItem.update({
    where: { id: lineItemId },
    data: {
      ingredientId,
      matchConfidence: "manual",
      matchedName: ingredient.name,
      currentPrice,
      priceChanged,
    },
  })

  // Create supplier-item mapping for future auto-matching
  if (lineItem.invoice.supplierId) {
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

  // Calculate new purchase price from invoice unit price * purchase quantity
  const newPurchasePrice = Number(li.unitPrice) * Number(ingredient.purchaseQuantity)

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

export async function approveAllPriceChanges(invoiceId: string) {
  const lineItems = await db.invoiceLineItem.findMany({
    where: {
      invoiceId,
      priceChanged: true,
      priceApproved: null,
      ingredientId: { not: null },
    },
  })

  for (const li of lineItems) {
    await approvePriceChange(li.id)
  }

  return true
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
  return db.invoiceLineItem.findMany({
    where: { priceChanged: true, priceApproved: null },
    include: {
      invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, supplierName: true, supplierId: true } },
      ingredient: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getUnacknowledgedAlertCount(): Promise<number> {
  return db.invoiceLineItem.count({
    where: { priceChanged: true, priceApproved: null },
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

export async function applyAllPriceChanges(invoiceId: string) {
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
