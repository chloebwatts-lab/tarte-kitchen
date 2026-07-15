/**
 * Compute open PriceAlerts from current invoice + ingredient state.
 *
 * Two streams:
 *   PRODUCE — categories VEGETABLE/FRUIT/HERB/MUSHROOM/SALAD. Volatile.
 *     Compare current invoice price against 4-week trailing MEDIAN of
 *     same ingredient. Only flag if ≥25% above median AND confirmed on
 *     ≥2 deliveries (don't fire on a one-off market move).
 *
 *   STABLE — everything else. Compare against Ingredient.purchasePrice.
 *     Flag if delta ≥5% either direction. Drops matter — Bidfood rebate
 *     refreshes go unnoticed otherwise. Group by canonicalName so
 *     "American Burger cheese" Bidfood and "Cheese Slices Hi Melt" Fermex
 *     surface as one alert if the chef switches suppliers between invoices.
 *
 * Unit safety: only compare invoice lines where the invoice unit matches
 * the ingredient.purchaseUnit (or has a known SupplierItemMapping.conversionFactor).
 * Skip unit-changed lines — those are handled by the existing units.ts gate.
 */
import { db } from "@/lib/db"
import Decimal from "decimal.js"
import {
  streamForCategory,
  STABLE_FLAG_THRESHOLD_PCT,
  PRODUCE_FLAG_THRESHOLD_PCT,
  PRODUCE_CONFIRMATION_DELIVERIES,
  PRODUCE_WINDOW_WEEKS,
} from "./classifier"
import type {
  Prisma,
  InvoiceLineItem,
  Ingredient,
  IngredientCategory,
} from "@/generated/prisma/client"

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

type LineWithRels = InvoiceLineItem & {
  invoice: { supplierName: string; invoiceDate: Date | null } | null
  ingredient:
    | (Pick<
        Ingredient,
        "id" | "name" | "purchaseUnit" | "purchasePrice" | "purchaseQuantity" | "baseUnitsPerPurchase" | "canonicalName"
      > & { category: IngredientCategory })
    | null
}

type StreamCounts = {
  produce: number
  stable: number
  dismissed: number  // counted but suppressed (unit mismatch, no signal, etc.)
}

export interface ComputeResult {
  evaluated: number
  newAlerts: number
  refreshed: number
  closed: number
  perStream: StreamCounts
  durationMs: number
}

/**
 * Recompute the entire PriceAlert table from scratch using the last 90 days
 * of invoice data. Idempotent — running twice is a no-op except for
 * lastSeenAt timestamps. OPEN alerts that no longer fire are auto-closed
 * (status → DISMISSED with resolvedAt set).
 */
export async function computePriceAlerts(): Promise<ComputeResult> {
  const t0 = Date.now()
  const ninetyDaysAgo = daysAgo(90)
  const fourWeeksAgo = daysAgo(PRODUCE_WINDOW_WEEKS * 7)

  // Pull recent invoice line items joined to ingredient + invoice meta
  const lines = await db.invoiceLineItem.findMany({
    where: {
      ingredientId: { not: null },
      unitPrice: { not: null },
      invoice: {
        invoiceDate: { gte: ninetyDaysAgo },
        status: { in: ["MATCHED", "EXTRACTED", "APPROVED"] },
      },
    },
    include: {
      invoice: { select: { supplierName: true, invoiceDate: true } },
      ingredient: {
        select: {
          id: true, name: true, category: true,
          purchaseUnit: true, purchasePrice: true, purchaseQuantity: true,
          baseUnitsPerPurchase: true,
          canonicalName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  }) as LineWithRels[]

  let evaluated = 0
  let newAlerts = 0
  let refreshed = 0
  let closed = 0
  const counts: StreamCounts = { produce: 0, stable: 0, dismissed: 0 }

  // Group by ingredient
  const byIng = new Map<string, typeof lines>()
  for (const ln of lines) {
    if (!ln.ingredient || !ln.invoice?.invoiceDate) continue
    const arr = byIng.get(ln.ingredient.id) ?? []
    arr.push(ln)
    byIng.set(ln.ingredient.id, arr)
  }

  // Track which ingredient IDs already have an alert decision this run.
  const stillOpen = new Set<string>()

  for (const [ingId, ingLines] of byIng.entries()) {
    evaluated++
    const ing = ingLines[0].ingredient!
    const stream = streamForCategory(ing.category)

    // Sort by date asc — last is most recent.
    ingLines.sort(
      (a, b) =>
        (a.invoice?.invoiceDate?.getTime() ?? 0) -
        (b.invoice?.invoiceDate?.getTime() ?? 0)
    )

    // Only use lines where we have a normalisedUnitPrice (the validated,
    // unit-corrected per-base-unit price computed during invoice ingestion).
    // The raw `unitPrice` field is unreliable — pack-priced lines slip
    // through with the wrong unit label (e.g. "L" tagged on a per-bottle
    // price for a 5L bottle). normalisedUnitPrice goes through `units.ts`
    // which catches all of that.
    // normalisedUnitPrice is only ever written for same-unit and converted
    // comparisons (units.ts gate) — its presence IS the unit-safety check.
    // Requiring the raw unit label to also match the stored unit used to
    // exclude every legitimately converted line (cartons, "1L x 6" packs,
    // kg↔g scaling), which starved the produce stream of data points.
    const validLines = ingLines.filter((l) => l.normalisedUnitPrice !== null)
    if (validLines.length === 0) {
      counts.dismissed++
      continue
    }

    const latest = validLines[validLines.length - 1]
    const currentPrice = new Decimal(latest.normalisedUnitPrice!.toString())
    const supplierName = latest.invoice?.supplierName ?? null

    let priorPrice: Decimal
    let priorMedian: Decimal | null = null
    let triggered = false

    if (stream === "PRODUCE") {
      // 4-week trailing median target
      const inWindow = validLines.filter(
        (l) => (l.invoice?.invoiceDate?.getTime() ?? 0) >= fourWeeksAgo.getTime()
      )
      if (inWindow.length < 2) {
        counts.dismissed++
        continue
      }
      const sortedPrices = inWindow
        .map((l) => new Decimal(l.normalisedUnitPrice!.toString()))
        .sort((a, b) => a.comparedTo(b))
      const mid = Math.floor(sortedPrices.length / 2)
      priorMedian =
        sortedPrices.length % 2 === 1
          ? sortedPrices[mid]
          : sortedPrices[mid - 1].plus(sortedPrices[mid]).div(2)
      priorPrice = priorMedian

      // Require ≥2 consecutive recent deliveries above threshold
      const recentN = Math.min(
        PRODUCE_CONFIRMATION_DELIVERIES,
        validLines.length
      )
      const recent = validLines.slice(-recentN)
      const allAbove = recent.every((l) => {
        const p = new Decimal(l.normalisedUnitPrice!.toString())
        const pctDelta = p.minus(priorMedian!).div(priorMedian!).mul(100)
        return pctDelta.gte(PRODUCE_FLAG_THRESHOLD_PCT)
      })
      triggered = allAbove
    } else {
      // STABLE — compare against Ingredient.purchasePrice converted to per-unit.
      const purQty = new Decimal(ing.purchaseQuantity.toString())
      if (purQty.lte(0)) {
        counts.dismissed++
        continue
      }
      const referenceUnitPrice = new Decimal(ing.purchasePrice.toString()).div(
        purQty
      )
      if (referenceUnitPrice.lte(0)) {
        counts.dismissed++
        continue
      }
      priorPrice = referenceUnitPrice
      const pct = currentPrice
        .minus(referenceUnitPrice)
        .div(referenceUnitPrice)
        .mul(100)
      triggered = pct.abs().gte(STABLE_FLAG_THRESHOLD_PCT)
    }

    if (!triggered) {
      counts.dismissed++
      continue
    }

    const changePct = currentPrice
      .minus(priorPrice)
      .div(priorPrice)
      .mul(100)
      .toDecimalPlaces(2)

    // Hard sanity cap: real supplier moves never exceed 100% in either
    // direction. Anything beyond that is a unit-mismatch ghost the
    // normalisedUnitPrice gate let slip — skip silently rather than
    // surface garbage to the chef.
    if (changePct.abs().gte(100)) {
      counts.dismissed++
      continue
    }

    if (stream === "PRODUCE") counts.produce++
    else counts.stable++
    stillOpen.add(ingId)

    // Upsert alert
    const existing = await db.priceAlert.findFirst({
      where: { ingredientId: ingId, status: "OPEN" },
    })
    const alertData: Prisma.PriceAlertCreateInput = {
      ingredient: { connect: { id: ingId } },
      canonicalName: ing.canonicalName ?? ing.name,
      stream,
      currentPrice: currentPrice.toDecimalPlaces(4).toNumber(),
      currentUnit: latest.unit ?? ing.purchaseUnit,
      priorPrice: priorPrice.toDecimalPlaces(4).toNumber(),
      priorPeriodMedian: priorMedian
        ? priorMedian.toDecimalPlaces(4).toNumber()
        : null,
      changePct: changePct.toNumber(),
      supplierName,
      lastSeenAt: new Date(),
    }

    if (existing) {
      await db.priceAlert.update({
        where: { id: existing.id },
        data: {
          currentPrice: alertData.currentPrice,
          currentUnit: alertData.currentUnit,
          priorPrice: alertData.priorPrice,
          priorPeriodMedian: alertData.priorPeriodMedian,
          changePct: alertData.changePct,
          supplierName: alertData.supplierName,
          lastSeenAt: alertData.lastSeenAt,
        },
      })
      refreshed++
    } else {
      await db.priceAlert.create({ data: alertData })
      newAlerts++
    }
  }

  // Close any OPEN alerts that didn't fire this run
  const stale = await db.priceAlert.findMany({
    where: { status: "OPEN", ingredientId: { notIn: Array.from(stillOpen) } },
    select: { id: true },
  })
  if (stale.length > 0) {
    await db.priceAlert.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "DISMISSED", resolvedAt: new Date() },
    })
    closed = stale.length
  }

  return {
    evaluated,
    newAlerts,
    refreshed,
    closed,
    perStream: counts,
    durationMs: Date.now() - t0,
  }
}
