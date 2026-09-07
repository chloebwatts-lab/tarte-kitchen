"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  acceptProductAlert,
  dismissProductAlert,
  confirmProductPack,
  computeProductAlerts,
  ingredientPerBase,
} from "@/lib/pricing/service"
import { parsePackSize } from "@/lib/invoices/units"
import { BASE_UNIT_LABEL } from "@/lib/pricing/pack"
import type { BaseUnitType } from "@/lib/pricing/types"

export interface PackQuestion {
  productId: string
  supplierName: string
  description: string
  productCode: string | null
  billedUnit: string | null
  ingredientName: string
  baseUnitLabel: "g" | "ml" | "ea"
  /** Pre-filled answer, if the description or ingredient record suggests one. */
  suggested: number | null
  explanation: string | null
  /** Effective price paid per billed unit on the latest line, for context. */
  latestBilledUnitPrice: number | null
  latestObservedAt: string | null
  linesSeen: number
}

export async function listPackQuestions(): Promise<PackQuestion[]> {
  const products = await db.supplierProduct.findMany({
    where: { status: "NEEDS_PACK", ingredientId: { not: null } },
    include: {
      supplier: { select: { name: true } },
      ingredient: { select: { name: true, baseUnitType: true, purchaseUnit: true, purchaseQuantity: true, baseUnitsPerPurchase: true } },
      observations: { orderBy: { observedAt: "desc" }, take: 1, select: { billedUnitPrice: true, observedAt: true } },
      _count: { select: { observations: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  })
  return products.map((p) => {
    const type = p.ingredient!.baseUnitType as BaseUnitType
    const parsed = parsePackSize(p.description)
    let suggested: number | null = p.packBaseUnits ? Number(p.packBaseUnits) : null
    if (suggested === null && parsed) {
      const fam: BaseUnitType = parsed.unit === "kg" ? "WEIGHT" : parsed.unit === "l" ? "VOLUME" : "COUNT"
      if (fam === type) suggested = parsed.unit === "ea" ? parsed.qty : parsed.qty * 1000
    }
    const latest = p.observations[0]
    return {
      productId: p.id,
      supplierName: p.supplier.name,
      description: p.description,
      productCode: p.productCode,
      billedUnit: p.billedUnit,
      ingredientName: p.ingredient!.name,
      baseUnitLabel: BASE_UNIT_LABEL[type],
      suggested,
      explanation: p.packExplanation,
      latestBilledUnitPrice: latest?.billedUnitPrice ? Number(latest.billedUnitPrice) : null,
      latestObservedAt: latest?.observedAt ? latest.observedAt.toISOString().slice(0, 10) : null,
      linesSeen: p._count.observations,
    }
  })
}

export interface ProductAlertRow {
  id: string
  productId: string
  ingredientId: string
  ingredientName: string
  category: string
  baseUnitType: BaseUnitType
  supplierName: string
  description: string
  billedUnit: string | null
  stream: "PRODUCE" | "STABLE"
  currentPerBase: number
  priorPerBase: number
  priorMedianPerBase: number | null
  changePct: number
  weeklyImpactDollars: number | null
  /** Ingredient's cost per base unit right now, so the chef can see what accept would replace. */
  ingredientPerBase: number | null
  /** Last deliveries, oldest first, per base unit. */
  history: { date: string; perBase: number }[]
  lastSeenAt: string
}

export async function listProductAlerts(): Promise<ProductAlertRow[]> {
  const alerts = await db.productPriceAlert.findMany({
    where: { status: "OPEN" },
    include: {
      ingredient: { select: { name: true, category: true, baseUnitType: true, purchasePrice: true, baseUnitsPerPurchase: true } },
      supplierProduct: {
        include: {
          supplier: { select: { name: true } },
          observations: {
            where: { status: "VALID", pricePerBaseUnit: { not: null } },
            orderBy: { observedAt: "desc" },
            take: 8,
            select: { observedAt: true, pricePerBaseUnit: true },
          },
        },
      },
    },
  })
  const rows = alerts.map((a) => ({
    id: a.id,
    productId: a.supplierProductId,
    ingredientId: a.ingredientId,
    ingredientName: a.ingredient.name,
    category: a.ingredient.category,
    baseUnitType: a.ingredient.baseUnitType as BaseUnitType,
    supplierName: a.supplierProduct.supplier.name,
    description: a.supplierProduct.description,
    billedUnit: a.supplierProduct.billedUnit,
    stream: a.stream,
    currentPerBase: Number(a.currentPerBase),
    priorPerBase: Number(a.priorPerBase),
    priorMedianPerBase: a.priorMedianPerBase ? Number(a.priorMedianPerBase) : null,
    changePct: Number(a.changePct),
    weeklyImpactDollars: a.weeklyImpactDollars ? Number(a.weeklyImpactDollars) : null,
    ingredientPerBase: ingredientPerBase(a.ingredient),
    history: a.supplierProduct.observations
      .slice()
      .reverse()
      .map((o) => ({ date: o.observedAt.toISOString().slice(0, 10), perBase: Number(o.pricePerBaseUnit) })),
    lastSeenAt: a.lastSeenAt.toISOString(),
  }))
  rows.sort((x, y) => {
    if (x.stream !== y.stream) return x.stream === "STABLE" ? -1 : 1
    const ix = Math.abs(x.weeklyImpactDollars ?? 0)
    const iy = Math.abs(y.weeklyImpactDollars ?? 0)
    if (ix !== iy) return iy - ix
    return Math.abs(y.changePct) - Math.abs(x.changePct)
  })
  return rows
}

function refresh() {
  revalidatePath("/pricing")
  revalidatePath("/ingredients")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
}

export async function answerPackQuestion(productId: string, packBaseUnits: number) {
  const r = await confirmProductPack(productId, packBaseUnits, null)
  if (r.ok) {
    // The corrected history may already be a price move: evaluate now
    // rather than making the chef wait for the nightly run.
    await computeProductAlerts()
  }
  refresh()
  return r
}

export async function rejectProduct(productId: string) {
  await db.supplierProduct.update({
    where: { id: productId },
    data: { status: "REJECTED", packExplanation: "Rejected: wrong ingredient" },
  })
  refresh()
  return { ok: true as const }
}

export async function acceptProductAlertAction(alertId: string) {
  const r = await acceptProductAlert(alertId, null)
  refresh()
  return r
}

export async function dismissProductAlertAction(alertId: string) {
  const r = await dismissProductAlert(alertId)
  refresh()
  return r
}

export async function recomputeProductAlertsAction() {
  const r = await computeProductAlerts()
  refresh()
  return r
}
