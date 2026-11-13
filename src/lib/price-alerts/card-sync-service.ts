/**
 * Nightly cost-card sync: loads invoices, quotes and cards, plans with
 * ./card-sync.ts (rules and the "audit against the latest quote" step are
 * documented there) and writes the changes with a PriceHistory row each,
 * then recosts every recipe once. `dry` plans without writing; the Friday
 * digest uses that to list what was charged above quote.
 */
import { db } from "@/lib/db"
import { effectiveUnitPrice } from "@/lib/invoices/units"
import { planCardSync, type CardSyncPlan, type QuoteRow, type SyncLine } from "./card-sync"

const DAY = 86_400_000
const LINE_WINDOW_DAYS = 90
const MANUAL_EDIT_DAYS = 14
/** PriceHistory ids written by the sync (and the 13 Nov 2026 clean-up), so a person's edit can be told apart. */
export const SYNC_HISTORY_PREFIXES = ["sync_", "ph_cardfix_"]

const num = (v: { toString(): string } | null | undefined): number | null =>
  v == null ? null : Number(v.toString())

export async function planCostCardSync(now: Date = new Date()): Promise<CardSyncPlan> {
  const from = new Date(now.getTime() - LINE_WINDOW_DAYS * DAY)
  const raw = await db.invoiceLineItem.findMany({
    where: {
      ingredientId: { not: null },
      normalisedUnitPrice: { not: null },
      unitPrice: { not: null },
      invoice: { invoiceDate: { gte: from, lte: now }, status: { in: ["MATCHED", "EXTRACTED", "APPROVED"] } },
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
      invoice: { select: { supplierName: true, invoiceDate: true, venue: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const lines = new Map<string, SyncLine[]>()
  for (const l of raw) {
    if (!l.ingredientId || !l.invoice?.invoiceDate) continue
    const billed = effectiveUnitPrice(num(l.unitPrice), num(l.quantity), num(l.lineTotal)) ?? num(l.unitPrice) ?? 0
    const arr = lines.get(l.ingredientId) ?? []
    arr.push({
      supplierName: l.invoice.supplierName,
      productCode: l.productCode,
      description: l.description,
      unit: l.unit,
      venue: l.invoice.venue,
      invoiceDate: l.invoice.invoiceDate,
      price: num(l.normalisedUnitPrice)!,
      lineTotal: num(l.lineTotal),
      billedPrice: billed,
    })
    lines.set(l.ingredientId, arr)
  }

  const ingredients = (
    await db.ingredient.findMany({
      where: { id: { in: [...lines.keys()] } },
      select: { id: true, name: true, purchasePrice: true, purchaseQuantity: true, purchaseUnit: true },
    })
  ).map((i) => ({
    id: i.id,
    name: i.name,
    purchasePrice: num(i.purchasePrice) ?? 0,
    purchaseQuantity: num(i.purchaseQuantity) ?? 0,
    purchaseUnit: i.purchaseUnit,
  }))

  const quotes: QuoteRow[] = (
    await db.approvedSupplierItem.findMany({
      where: { packPrice: { gt: 0 } },
      select: { id: true, name: true, packPrice: true, unit: true, unitPrice: true, supplier: { select: { name: true } } },
    })
  ).map((q) => ({
    id: q.id,
    supplierName: q.supplier.name,
    name: q.name,
    packPrice: num(q.packPrice) ?? 0,
    unit: q.unit,
    unitPrice: num(q.unitPrice),
  }))

  const recent = await db.priceHistory.findMany({
    where: {
      changedAt: { gte: new Date(now.getTime() - MANUAL_EDIT_DAYS * DAY) },
      NOT: SYNC_HISTORY_PREFIXES.map((p) => ({ id: { startsWith: p } })),
    },
    select: { ingredientId: true },
  })

  return planCardSync({
    ingredients,
    lines,
    quotes,
    manuallyChanged: new Set(recent.map((r) => r.ingredientId)),
    now,
  })
}

export async function syncCostCards(opts: { dry?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const plan = await planCostCardSync(now)
  if (opts.dry) return { dry: true, applied: 0, recosted: false, plan }

  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "")
  let applied = 0
  for (const u of plan.updates) {
    // Only if the card still holds the price this plan was made from: a
    // chef editing it in between wins.
    const res = await db.ingredient.updateMany({
      where: { id: u.ingredientId, purchasePrice: u.oldPrice },
      data: { purchasePrice: u.newPrice },
    })
    if (res.count !== 1) continue
    await db.priceHistory.create({
      data: {
        id: `sync_${stamp}_${u.ingredientId}_${Date.now().toString(36)}`,
        ingredientId: u.ingredientId,
        oldPrice: u.oldPrice,
        newPrice: u.newPrice,
        oldUnit: u.purchaseUnit,
        oldQuantity: u.purchaseQuantity,
      },
    })
    applied++
  }

  let recosted = false
  if (applied > 0) {
    const { recalculateAll } = await import("@/lib/actions/ingredients")
    await recalculateAll()
    recosted = true
  }
  return { dry: false, applied, recosted, plan }
}
