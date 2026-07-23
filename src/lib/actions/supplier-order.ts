"use server"

/**
 * Per-supplier ordering workflow.
 *
 * The chef opens `/orders/new/[supplierId]?venue=BURLEIGH`, sees every
 * ApprovedSupplierItem on that supplier's form, with a suggested quantity
 * derived from:
 *   1) IngredientPar (per-venue) when the item is linked to an Ingredient
 *      and has a par row, else
 *   2) the last invoiced qty for that supplier+ingredient+venue, else
 *   3) blank — chef enters manually
 *
 * Ticking items + entering quantities + clicking "Send order" creates a
 * DRAFT PurchaseOrder, populates lines (linked to Ingredients where possible),
 * and (optionally) emails the supplier through the existing gmail/send module.
 */

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma"

export type SupplierOrderLine = {
  approvedItemId: string
  /** Linked ingredient if known (powers par + on-hand math). */
  ingredientId: string | null
  name: string
  category: string | null
  packSize: string | null
  packPrice: number
  unit: string | null
  /** Suggested quantity in `unit` (purchase pack count, e.g. 2 = "2 bags"). */
  suggestedPacks: number
  /** Source of the suggestion so the chef can judge it. */
  suggestionSource: "PAR" | "LAST_INVOICE" | "NONE"
  /** Last invoice date for this item (for context on how stale the suggestion is). */
  lastInvoiceDate: string | null
  notes: string | null
}

export async function getSupplierOrderForm(
  supplierId: string,
  venue: Venue
): Promise<{
  supplier: { id: string; name: string; email: string | null; deliveryDays: number[] } | null
  lines: SupplierOrderLine[]
}> {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, email: true, deliveryDays: true },
  })
  if (!supplier) return { supplier: null, lines: [] }

  const items = await db.approvedSupplierItem.findMany({
    where: { supplierId, active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      ingredient: {
        select: {
          id: true,
          purchaseQuantity: true,
          purchaseUnit: true,
          baseUnitType: true,
          pars: { where: { venue } },
        },
      },
    },
  })

  // For unlinked items, try to find recent invoice qty by exact name match
  // on InvoiceLineItem.description (last 90 days).
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 90)
  const ingredientIdsForLastInv = items
    .map((it) => it.ingredient?.id)
    .filter((x): x is string => !!x)

  const recentByIngredient = new Map<string, { qty: number; date: Date }>()
  if (ingredientIdsForLastInv.length > 0) {
    const recent = await db.invoiceLineItem.findMany({
      where: {
        ingredientId: { in: ingredientIdsForLastInv },
        invoice: {
          invoiceDate: { gte: cutoff },
          status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION"] },
          supplierId,
          venue,
        },
        quantity: { not: null },
      },
      select: {
        ingredientId: true,
        quantity: true,
        invoice: { select: { invoiceDate: true } },
      },
      orderBy: { invoice: { invoiceDate: "desc" } },
    })
    for (const r of recent) {
      if (!r.ingredientId || r.quantity == null || !r.invoice.invoiceDate) continue
      if (recentByIngredient.has(r.ingredientId)) continue
      recentByIngredient.set(r.ingredientId, {
        qty: Number(r.quantity),
        date: r.invoice.invoiceDate,
      })
    }
  }

  const lines: SupplierOrderLine[] = items.map((it) => {
    const ing = it.ingredient
    let suggestedPacks = 0
    let suggestionSource: SupplierOrderLine["suggestionSource"] = "NONE"
    let lastInvoiceDate: string | null = null

    if (ing) {
      const packQty = Number(ing.purchaseQuantity) || 1
      const par = ing.pars[0]
      if (par && Number(par.parLevel) > 0) {
        // Par is in ingredient's purchaseUnit; divide by pack to get whole-pack count.
        const parInPurchase = Number(par.parLevel)
        suggestedPacks = Math.max(1, Math.ceil(parInPurchase / packQty))
        suggestionSource = "PAR"
      } else {
        const lastInv = recentByIngredient.get(ing.id)
        if (lastInv) {
          suggestedPacks = Math.max(1, Math.ceil(lastInv.qty / packQty))
          suggestionSource = "LAST_INVOICE"
          lastInvoiceDate = lastInv.date.toISOString().split("T")[0]
        }
      }
    }

    return {
      approvedItemId: it.id,
      ingredientId: ing?.id ?? null,
      name: it.name,
      category: it.category,
      packSize: it.packSize,
      packPrice: Number(it.packPrice),
      unit: it.unit,
      suggestedPacks,
      suggestionSource,
      lastInvoiceDate,
      notes: it.notes,
    }
  })

  return { supplier, lines }
}

/**
 * List all suppliers that have at least one active ApprovedSupplierItem —
 * these are the candidates for the "pick a supplier to order from" landing.
 */
export async function listSuppliersWithForms(): Promise<
  Array<{ id: string; name: string; email: string | null; itemCount: number; deliveryDays: number[] }>
> {
  const rows = await db.supplier.findMany({
    where: { approvedItems: { some: { active: true } } },
    select: {
      id: true,
      name: true,
      email: true,
      deliveryDays: true,
      _count: { select: { approvedItems: { where: { active: true } } } },
    },
    orderBy: { name: "asc" },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    deliveryDays: r.deliveryDays,
    itemCount: r._count.approvedItems,
  }))
}
