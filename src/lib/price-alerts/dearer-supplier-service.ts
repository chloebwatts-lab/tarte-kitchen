/**
 * Loads the 8 weeks of invoice lines and the order forms behind the Friday
 * digest's "Bought from the dearer supplier" check (rules in
 * ./dearer-supplier.ts). Read only.
 */
import { db } from "@/lib/db"
import { effectiveUnitPrice } from "@/lib/invoices/units"
import type { FormRow } from "@/lib/preferred-supplier"
import { DEARER_WINDOW_DAYS, findDearerBuys, type BuyLine, type DearerResult } from "./dearer-supplier"

const num = (v: { toString(): string } | null | undefined): number | null =>
  v == null ? null : Number(v.toString())

export async function loadDearerBuys(weekStart: Date, weekEnd: Date): Promise<DearerResult> {
  const from = new Date(weekEnd.getTime() - DEARER_WINDOW_DAYS * 86_400_000)
  const raw = await db.invoiceLineItem.findMany({
    where: {
      unitPrice: { gt: 0 },
      quantity: { gt: 0 },
      lineTotal: { gt: 0 },
      invoice: { invoiceDate: { gte: from, lte: weekEnd }, status: { in: ["MATCHED", "EXTRACTED", "APPROVED"] } },
    },
    select: {
      ingredientId: true,
      description: true,
      productCode: true,
      unit: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      normalisedUnitPrice: true,
      ingredient: { select: { name: true, purchaseUnit: true } },
      invoice: { select: { supplierName: true, invoiceDate: true, venue: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  const lines: BuyLine[] = raw
    .filter((l) => l.invoice?.invoiceDate)
    .map((l) => {
      const unitPrice = num(l.unitPrice) ?? 0
      const qty = num(l.quantity) ?? 0
      const lineTotal = num(l.lineTotal) ?? 0
      return {
        ingredientId: l.ingredientId,
        ingredientName: l.ingredient?.name ?? null,
        supplierName: l.invoice!.supplierName,
        productCode: l.productCode,
        description: l.description,
        unit: l.unit,
        venue: l.invoice!.venue,
        invoiceDate: l.invoice!.invoiceDate!,
        qty,
        lineTotal,
        unitPrice,
        effectivePrice: effectiveUnitPrice(unitPrice, qty, lineTotal),
        normalisedPrice: num(l.normalisedUnitPrice),
        purchaseUnit: l.ingredient?.purchaseUnit ?? null,
      }
    })

  const forms: FormRow[] = (
    await db.approvedSupplierItem.findMany({
      select: {
        id: true, name: true, packSize: true, packPrice: true, unitPrice: true, unit: true,
        category: true, notes: true, active: true, supplier: { select: { name: true } },
      },
    })
  ).map((f) => ({
    id: f.id,
    supplier: f.supplier.name,
    name: f.name,
    packSize: f.packSize,
    packPrice: num(f.packPrice) ?? 0,
    unitPrice: num(f.unitPrice),
    unit: f.unit,
    category: f.category,
    notes: f.notes,
    active: f.active,
  }))

  return findDearerBuys({ lines, forms, weekStart, weekEnd })
}
