// Database side of the pricing rebuild. Runs in SHADOW MODE: it reads the
// same InvoiceLineItem rows the existing pipeline writes, but never touches
// priceChanged / unitChanged / PriceAlert. The only way it writes an
// ingredient price is acceptProductAlert(), which a person triggers.

import Decimal from "decimal.js"
import { db } from "@/lib/db"
import { streamForCategory } from "@/lib/price-alerts/classifier"
import type {
  IngredientCategory,
  PackConfidence as DbPackConfidence,
  PackSource as DbPackSource,
  ObservationStatus as DbObservationStatus,
  Prisma,
} from "@/generated/prisma/client"
import { productKey, resolvePack } from "./pack"
import { deriveObservation } from "./observation"
import { evaluateProduct, newPurchasePrice } from "./alerts"
import type { IngredientPackInfo, ObservationPoint, RecentDecision } from "./types"

const OBSERVATION_WINDOW_DAYS = 90

function num(d: Decimal | number | null | undefined): number | null {
  if (d === null || d === undefined) return null
  const n = typeof d === "number" ? d : Number(d.toString())
  return Number.isFinite(n) ? n : null
}

type IngredientRow = {
  id: string
  category: IngredientCategory
  baseUnitType: "WEIGHT" | "VOLUME" | "COUNT"
  purchaseUnit: string
  purchaseQuantity: Decimal
  purchasePrice: Decimal
  baseUnitsPerPurchase: Decimal
  gramsPerUnit: Decimal | null
}

function packInfo(ing: IngredientRow): IngredientPackInfo {
  return {
    baseUnitType: ing.baseUnitType,
    purchaseUnit: ing.purchaseUnit,
    purchaseQuantity: num(ing.purchaseQuantity) ?? 0,
    baseUnitsPerPurchase: num(ing.baseUnitsPerPurchase) ?? 0,
    gramsPerUnit: num(ing.gramsPerUnit),
  }
}

/** Ingredient's current cost per base unit, before waste. Null if unknown. */
export function ingredientPerBase(ing: Pick<IngredientRow, "purchasePrice" | "baseUnitsPerPurchase">): number | null {
  const price = num(ing.purchasePrice)
  const base = num(ing.baseUnitsPerPurchase)
  if (price === null || base === null || price <= 0 || base <= 0) return null
  return price / base
}

export interface IngestSummary {
  invoiceId: string
  lines: number
  productsCreated: number
  observations: { valid: number; suspect: number; excluded: number; skipped: number }
}

/**
 * Build / refresh SupplierProducts and PriceObservations for every line on
 * an invoice. Idempotent: re-running updates the existing observation for
 * each line (keyed on invoiceLineItemId).
 *
 * Lines with no ingredient mapping are skipped: the product needs an
 * ingredient before a pack means anything. The existing matcher owns that
 * mapping; when it lands (rematch cron, manual map) re-ingesting picks
 * the line up.
 */
export async function ingestInvoiceObservations(invoiceId: string): Promise<IngestSummary> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      supplierId: true,
      venue: true,
      invoiceDate: true,
      status: true,
      lineItems: {
        select: {
          id: true,
          description: true,
          productCode: true,
          unit: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          ingredientId: true,
          ingredient: {
            select: {
              id: true, category: true, baseUnitType: true, purchaseUnit: true,
              purchaseQuantity: true, purchasePrice: true, baseUnitsPerPurchase: true, gramsPerUnit: true,
            },
          },
        },
      },
    },
  })
  const summary: IngestSummary = {
    invoiceId,
    lines: 0,
    productsCreated: 0,
    observations: { valid: 0, suspect: 0, excluded: 0, skipped: 0 },
  }
  if (!invoice || !invoice.supplierId || !invoice.invoiceDate) return summary
  // Statements / order confirmations / duplicates are not deliveries.
  if (["STATEMENT", "ORDER_CONFIRMATION", "DUPLICATE"].includes(invoice.status)) return summary
  const isCredit = invoice.status === "CREDIT_NOTE"

  for (const line of invoice.lineItems) {
    summary.lines++
    if (!line.ingredient) {
      summary.observations.skipped++
      continue
    }
    const key = productKey(line.productCode, line.description, line.unit)
    let product = await db.supplierProduct.findUnique({
      where: { supplierId_productKey: { supplierId: invoice.supplierId, productKey: key } },
    })
    const ingInfo = packInfo(line.ingredient as IngredientRow)

    if (!product) {
      const resolved = resolvePack(line.description, line.unit, ingInfo)
      product = await db.supplierProduct.create({
        data: {
          supplierId: invoice.supplierId,
          productKey: key,
          productCode: line.productCode?.trim() || null,
          description: line.description,
          billedUnit: line.unit,
          ingredientId: line.ingredient.id,
          packBaseUnits: resolved?.packBaseUnits ?? null,
          packSource: (resolved?.source ?? null) as DbPackSource | null,
          packConfidence: (resolved?.confidence ?? null) as DbPackConfidence | null,
          packExplanation: resolved?.explanation ?? null,
          status: resolved ? "ACTIVE" : "NEEDS_PACK",
        },
      })
      summary.productsCreated++
    } else if (product.ingredientId === null && product.status !== "REJECTED") {
      // Product existed without an ingredient (mapped later): adopt it and
      // try to resolve the pack now.
      const resolved = resolvePack(line.description, line.unit, ingInfo)
      product = await db.supplierProduct.update({
        where: { id: product.id },
        data: {
          ingredientId: line.ingredient.id,
          packBaseUnits: resolved?.packBaseUnits ?? null,
          packSource: (resolved?.source ?? null) as DbPackSource | null,
          packConfidence: (resolved?.confidence ?? null) as DbPackConfidence | null,
          packExplanation: resolved?.explanation ?? null,
          status: resolved ? "ACTIVE" : "NEEDS_PACK",
        },
      })
    }

    if (product.status === "REJECTED") {
      summary.observations.skipped++
      continue
    }

    const obs = deriveObservation(
      {
        description: line.description,
        unit: line.unit,
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
        lineTotal: num(line.lineTotal),
        isCreditNote: isCredit,
      },
      num(product.packBaseUnits),
      (product.packConfidence ?? null) as DbPackConfidence | null,
      ingredientPerBase(line.ingredient as IngredientRow)
    )

    const data = {
      supplierProductId: product.id,
      invoiceId: invoice.id,
      ingredientId: line.ingredient.id,
      observedAt: invoice.invoiceDate,
      venue: invoice.venue,
      billedQty: obs.billedQty,
      billedUnitPrice: obs.billedUnitPrice,
      packBaseUnits: obs.packBaseUnits,
      pricePerBaseUnit: obs.pricePerBaseUnit,
      baseUnitsDelivered: obs.baseUnitsDelivered,
      status: obs.status as DbObservationStatus,
      reason: obs.reason,
    }
    await db.priceObservation.upsert({
      where: { invoiceLineItemId: line.id },
      create: { ...data, invoiceLineItemId: line.id },
      update: data,
    })
    await db.supplierProduct.update({
      where: { id: product.id },
      data: {
        lastSeenAt: new Date(),
        // A SUSPECT observation on an unconfirmed pack parks the product
        // for one human question. A confirmed pack is never re-parked.
        ...(obs.status === "SUSPECT" && product.packSource !== "CONFIRMED"
          ? { status: "NEEDS_PACK" }
          : {}),
      },
    })
    if (obs.status === "VALID") summary.observations.valid++
    else if (obs.status === "SUSPECT") summary.observations.suspect++
    else summary.observations.excluded++
  }
  return summary
}

/**
 * A person answers "one <billed unit> of <description> holds N <g|ml|ea>".
 * Stored as given. Every observation on the product is re-derived so the
 * history is on the corrected basis, and the product goes ACTIVE.
 */
export async function confirmProductPack(
  productId: string,
  packBaseUnits: number,
  confirmedBy: string | null
): Promise<{ ok: true; rederived: number } | { ok: false; reason: string }> {
  if (!(packBaseUnits > 0) || !Number.isFinite(packBaseUnits)) {
    return { ok: false, reason: "Pack must be a positive number of g / ml / ea" }
  }
  const product = await db.supplierProduct.findUnique({
    where: { id: productId },
    include: { ingredient: { select: { purchasePrice: true, baseUnitsPerPurchase: true } } },
  })
  if (!product) return { ok: false, reason: "Product not found" }
  await db.supplierProduct.update({
    where: { id: productId },
    data: {
      packBaseUnits,
      packSource: "CONFIRMED",
      packConfidence: "HIGH",
      packExplanation: `Confirmed by ${confirmedBy ?? "staff"}`,
      packConfirmedBy: confirmedBy,
      packConfirmedAt: new Date(),
      status: "ACTIVE",
    },
  })
  const rederived = await rederiveProductObservations(productId)
  return { ok: true, rederived }
}

/** Re-run deriveObservation for every line on a product with its current pack. */
export async function rederiveProductObservations(productId: string): Promise<number> {
  const product = await db.supplierProduct.findUnique({
    where: { id: productId },
    include: {
      ingredient: { select: { purchasePrice: true, baseUnitsPerPurchase: true } },
      observations: {
        include: {
          invoiceLineItem: { select: { description: true, unit: true, quantity: true, unitPrice: true, lineTotal: true } },
          invoice: { select: { status: true } },
        },
      },
    },
  })
  if (!product) return 0
  const ref = product.ingredient ? ingredientPerBase(product.ingredient) : null
  let n = 0
  for (const o of product.observations) {
    const li = o.invoiceLineItem
    const obs = deriveObservation(
      {
        description: li.description,
        unit: li.unit,
        quantity: num(li.quantity),
        unitPrice: num(li.unitPrice),
        lineTotal: num(li.lineTotal),
        isCreditNote: o.invoice.status === "CREDIT_NOTE",
      },
      num(product.packBaseUnits),
      (product.packConfidence ?? null) as DbPackConfidence | null,
      ref
    )
    await db.priceObservation.update({
      where: { id: o.id },
      data: {
        billedQty: obs.billedQty,
        billedUnitPrice: obs.billedUnitPrice,
        packBaseUnits: obs.packBaseUnits,
        pricePerBaseUnit: obs.pricePerBaseUnit,
        baseUnitsDelivered: obs.baseUnitsDelivered,
        status: obs.status as DbObservationStatus,
        reason: obs.reason,
      },
    })
    n++
  }
  return n
}

export interface ProductAlertComputeResult {
  productsEvaluated: number
  fired: number
  refreshed: number
  autoClosed: number
  needsPack: number
  durationMs: number
}

/**
 * Nightly: evaluate every ACTIVE product with a VALID observation in the
 * window, open / refresh / auto-close ProductPriceAlerts. Idempotent.
 */
export async function computeProductAlerts(now: Date = new Date()): Promise<ProductAlertComputeResult> {
  const t0 = Date.now()
  const from = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * 86_400_000)

  const products = await db.supplierProduct.findMany({
    where: { status: "ACTIVE", ingredientId: { not: null } },
    include: {
      ingredient: {
        select: { id: true, category: true, purchasePrice: true, baseUnitsPerPurchase: true },
      },
      observations: {
        where: { status: "VALID", observedAt: { gte: from }, pricePerBaseUnit: { not: null } },
        orderBy: [{ observedAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, observedAt: true, pricePerBaseUnit: true, baseUnitsDelivered: true },
      },
    },
  })
  const needsPack = await db.supplierProduct.count({ where: { status: "NEEDS_PACK" } })

  const stillOpen = new Set<string>()
  let fired = 0
  let refreshed = 0

  for (const p of products) {
    if (!p.ingredient || p.observations.length === 0) continue
    const points: ObservationPoint[] = p.observations.map((o) => ({
      observedAt: o.observedAt,
      pricePerBaseUnit: num(o.pricePerBaseUnit)!,
      baseUnitsDelivered: num(o.baseUnitsDelivered),
    }))
    const latestObs = p.observations[p.observations.length - 1]
    const lastDecision = await db.productPriceAlert.findFirst({
      where: { supplierProductId: p.id, status: { in: ["ACCEPTED", "DISMISSED", "AUTO_CLOSED"] } },
      orderBy: { resolvedAt: "desc" },
      select: { currentPerBase: true, resolvedBy: true },
    })
    const recent: RecentDecision | null = lastDecision
      ? {
          pricePerBaseUnit: num(lastDecision.currentPerBase) ?? 0,
          resolvedBy: lastDecision.resolvedBy === "CHEF" ? "CHEF" : "ENGINE",
        }
      : null
    const stream = streamForCategory(p.ingredient.category)
    const outcome = evaluateProduct(stream, points, ingredientPerBase(p.ingredient), recent, now)
    if (!outcome.fire) continue

    stillOpen.add(p.id)
    const a = outcome.alert
    const data: Prisma.ProductPriceAlertUncheckedCreateInput = {
      supplierProductId: p.id,
      ingredientId: p.ingredient.id,
      stream,
      latestObservationId: latestObs.id,
      currentPerBase: a.currentPerBase,
      priorPerBase: a.priorPerBase,
      priorMedianPerBase: a.priorMedianPerBase,
      changePct: a.changePct,
      weeklyImpactDollars: a.weeklyImpactDollars,
      lastSeenAt: now,
    }
    const existing = await db.productPriceAlert.findFirst({ where: { supplierProductId: p.id, status: "OPEN" } })
    if (existing) {
      await db.productPriceAlert.update({ where: { id: existing.id }, data })
      refreshed++
    } else {
      try {
        await db.productPriceAlert.create({ data })
        fired++
      } catch {
        refreshed++ // partial unique index: a concurrent run got there first
      }
    }
  }

  const stale = await db.productPriceAlert.updateMany({
    where: { status: "OPEN", supplierProductId: { notIn: [...stillOpen] } },
    data: { status: "AUTO_CLOSED", resolvedBy: "ENGINE", resolvedAt: now },
  })

  return {
    productsEvaluated: products.length,
    fired,
    refreshed,
    autoClosed: stale.count,
    needsPack,
    durationMs: Date.now() - t0,
  }
}

/**
 * Chef accepts the alert. Writes exactly the observation the alert shows:
 * purchasePrice = pricePerBaseUnit x the ingredient's existing
 * baseUnitsPerPurchase. purchaseQuantity / purchaseUnit are never touched.
 */
export async function acceptProductAlert(alertId: string, by: string | null) {
  const alert = await db.productPriceAlert.findUnique({
    where: { id: alertId },
    include: { ingredient: true },
  })
  if (!alert) return { ok: false as const, reason: "Alert no longer exists" }
  if (alert.status === "ACCEPTED") return { ok: true as const, reason: "Already accepted" }
  const obs = await db.priceObservation.findUnique({ where: { id: alert.latestObservationId } })
  const perBase = num(obs?.pricePerBaseUnit) ?? num(alert.currentPerBase)
  const base = num(alert.ingredient.baseUnitsPerPurchase)
  if (perBase === null || base === null || base <= 0) {
    return { ok: false as const, reason: "Ingredient has no base units per purchase; fix the ingredient first" }
  }
  const newPrice = newPurchasePrice(perBase, base)
  const oldPrice = num(alert.ingredient.purchasePrice) ?? 0

  await db.$transaction([
    db.priceHistory.create({
      data: {
        ingredientId: alert.ingredientId,
        oldPrice,
        newPrice,
        oldUnit: alert.ingredient.purchaseUnit,
        oldQuantity: num(alert.ingredient.purchaseQuantity),
      },
    }),
    db.ingredient.update({ where: { id: alert.ingredientId }, data: { purchasePrice: newPrice } }),
    db.productPriceAlert.update({
      where: { id: alertId },
      data: { status: "ACCEPTED", resolvedBy: "CHEF", resolvedAt: new Date() },
    }),
  ])
  const { recalculateAll } = await import("@/lib/actions/ingredients")
  await recalculateAll()
  return { ok: true as const, newPrice, by }
}

export async function dismissProductAlert(alertId: string) {
  await db.productPriceAlert.update({
    where: { id: alertId },
    data: { status: "DISMISSED", resolvedBy: "CHEF", resolvedAt: new Date() },
  })
  return { ok: true as const }
}
