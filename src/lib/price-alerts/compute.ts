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

  // Recently resolved alerts, so a chef's decision STICKS: a DISMISSED
  // alert must not resurrect nightly at the same price (zombie), and an
  // ACCEPTED produce alert must not re-fire while the trailing median
  // catches up to the accepted price. Only a further price move re-alerts.
  const recentlyResolved = new Map<string, Decimal>()
  const resolved = await db.priceAlert.findMany({
    where: {
      status: { in: ["DISMISSED", "ACCEPTED"] },
      resolvedAt: { gte: daysAgo(45) },
    },
    orderBy: { resolvedAt: "asc" },
    select: { ingredientId: true, currentPrice: true },
  })
  for (const r of resolved) {
    // asc order → the latest resolution per ingredient wins.
    recentlyResolved.set(r.ingredientId, new Decimal(r.currentPrice.toString()))
  }

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
      // 4-week trailing median target, EXCLUDING the latest delivery being
      // tested — a self-referential median drags itself up toward the spike
      // (with 2 points, "+25% vs median" silently required +67% vs prior).
      const latestDate = latest.invoice!.invoiceDate!.getTime()
      const inWindow = validLines.filter((l) => {
        const t = l.invoice?.invoiceDate?.getTime() ?? 0
        return t >= fourWeeksAgo.getTime() && t < latestDate
      })
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

      // Require ≥2 consecutive recent DELIVERIES above threshold — distinct
      // invoice dates, not the last N line items (one invoice with two lines
      // for the same ingredient must not self-confirm a one-off spike).
      const byDate = new Map<number, LineWithRels>()
      for (const l of validLines) {
        byDate.set(l.invoice!.invoiceDate!.getTime(), l) // last line per date wins
      }
      const deliveryDates = [...byDate.keys()].sort((a, b) => a - b)
      if (deliveryDates.length < PRODUCE_CONFIRMATION_DELIVERIES) {
        counts.dismissed++
        continue
      }
      const recentDeliveries = deliveryDates
        .slice(-PRODUCE_CONFIRMATION_DELIVERIES)
        .map((d) => byDate.get(d)!)
      const allAbove = recentDeliveries.every((l) => {
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

    // Chef decisions stick: if this ingredient's alert was dismissed or
    // accepted recently AT THIS PRICE (±2%), don't re-open it. A further
    // move re-alerts as normal.
    const resolvedAt = recentlyResolved.get(ingId)
    if (
      resolvedAt &&
      resolvedAt.gt(0) &&
      currentPrice.minus(resolvedAt).abs().div(resolvedAt).lt(0.02)
    ) {
      counts.dismissed++
      continue
    }

    const changePct = currentPrice
      .minus(priorPrice)
      .div(priorPrice)
      .mul(100)
      .toDecimalPlaces(2)

    // Estimated weekly $ impact = recent purchase volume × per-unit delta.
    // Volume comes from the trailing 28 days of validated lines: each line's
    // base-unit quantity is lineTotal / normalisedUnitPrice (both already
    // unit-safe), so carton/pack conversions can't distort it. Null when no
    // line in the window carries a total — the digest sorts those last.
    let volumeBaseUnits = new Decimal(0)
    let hasVolume = false
    for (const l of validLines) {
      const t = l.invoice?.invoiceDate
      if (!t || t < fourWeeksAgo) continue
      if (l.lineTotal == null) continue
      const perUnit = new Decimal(l.normalisedUnitPrice!.toString())
      if (perUnit.lte(0)) continue
      volumeBaseUnits = volumeBaseUnits.plus(
        new Decimal(l.lineTotal.toString()).div(perUnit)
      )
      hasVolume = true
    }
    const weeklyImpactDollars = hasVolume
      ? volumeBaseUnits
          .div(PRODUCE_WINDOW_WEEKS)
          .mul(currentPrice.minus(priorPrice))
          .toDecimalPlaces(2)
          .toNumber()
      : null

    // Sanity cap for unit-mismatch ghosts. With conversions unit-scoped and
    // normalised prices rebuilt, big moves are usually REAL (cocoa doubled;
    // vanilla paste +115% was being hidden by the old 100% cap) — only
    // truly absurd multiples are still worth suppressing.
    if (changePct.abs().gte(500)) {
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
      // normalisedUnitPrice is per single purchase-unit (per g / ml / piece),
      // so that is the unit the alert must display. The raw invoice label
      // (PKT / CTN / BTL) made every converted row read as nonsense.
      currentUnit: ing.purchaseUnit,
      priorPrice: priorPrice.toDecimalPlaces(4).toNumber(),
      priorPeriodMedian: priorMedian
        ? priorMedian.toDecimalPlaces(4).toNumber()
        : null,
      changePct: changePct.toNumber(),
      weeklyImpactDollars,
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
          weeklyImpactDollars: alertData.weeklyImpactDollars,
          supplierName: alertData.supplierName,
          lastSeenAt: alertData.lastSeenAt,
        },
      })
      refreshed++
    } else {
      try {
        await db.priceAlert.create({ data: alertData })
        newAlerts++
      } catch {
        // Partial unique index (one OPEN per ingredient): a concurrent run
        // (manual Recompute racing the cron) created it first — that run's
        // values are equivalent; skip rather than duplicate.
        refreshed++
      }
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
