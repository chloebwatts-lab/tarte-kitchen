"use server"

/**
 * Live current-week spend aggregator. Pulls every Invoice with an
 * `invoiceDate` inside the current Tarte trading week (Wed → Tue AEST),
 * groups by venue + supplier + day, and returns the shape the live
 * `/spend` page and the Friday digest both render off.
 *
 * Venue split: per Chris 2026-05-17 there are NO shared orders between
 * Burleigh and Currumbin — every supplier delivery is for one venue.
 * Invoices with a null `venue` field are surfaced as "unassigned" so
 * they can be split manually, not silently lumped into a "Shared"
 * bucket.
 *
 * BEACH_HOUSE here represents Currumbin's COGS, which per the Mge PDF
 * combines Beach House + Tea Garden — so we sum TEA_GARDEN spend and
 * forecast into BEACH_HOUSE for the budget read.
 */

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import {
  currentTarteWeekRange,
  weekStartWedIso,
} from "@/lib/dates"
import {
  EXPECTED_SUPPLIERS,
  matchExpectedSupplier,
  type ExpectedSupplier,
} from "./expected-suppliers"
import {
  SPEND_BUCKETS,
  SPEND_BUCKET_LABEL,
  venueToBucket,
  type SpendBucket,
  type DailySpendCell,
  type SupplierSpendCell,
  type CoverageRow,
  type UnassignedInvoice,
  type BucketSpendData,
  type CurrentWeekSpendSnapshot,
} from "./types"

const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** AEST yyyy-mm-dd for a Date instance. */
function aestDateKey(d: Date): string {
  const shifted = new Date(d.getTime() + BRISBANE_OFFSET_MS)
  return shifted.toISOString().split("T")[0]
}

/** AEST day-of-week short name. */
function aestDayName(d: Date): string {
  const shifted = new Date(d.getTime() + BRISBANE_OFFSET_MS)
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][shifted.getUTCDay()]
}

/** Build the 7-day skeleton (Wed → Tue) for a given Wed-midnight UTC. */
function buildDailySkeleton(weekStart: Date): DailySpendCell[] {
  const cells: DailySpendCell[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    cells.push({
      date: aestDateKey(d),
      dayName: aestDayName(d),
      amount: 0,
      cumulative: 0,
      invoiceCount: 0,
    })
  }
  return cells
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

export async function getCurrentWeekSpend(): Promise<CurrentWeekSpendSnapshot> {
  const now = new Date()
  const { start, end } = currentTarteWeekRange(now)
  const weekStartWed = weekStartWedIso(start)
  const weekEndTueDate = new Date(end)
  weekEndTueDate.setUTCDate(weekEndTueDate.getUTCDate() - 1)
  const weekEndTue = aestDateKey(weekEndTueDate)
  const todayAest = aestDateKey(now)

  // Day-of-week within the trading week (1 = Wed ... 7 = Tue).
  const msInDay = 24 * 60 * 60 * 1000
  const aestNowMs = now.getTime() + BRISBANE_OFFSET_MS
  const aestStartMs = start.getTime()
  // Whole AEST days completed since Wed 00:00, capped at 7.
  const daysSinceStart =
    Math.floor((aestNowMs - aestStartMs) / msInDay)
  const dayOfWeek = Math.min(7, Math.max(1, daysSinceStart + 1))
  // For pacing we only count fully-elapsed days; the current day is
  // partial. So if we're 2 days in (Thu), we treat 2 days as the
  // pacing window — pacing reads as low until that day completes,
  // which is intentional (don't extrapolate from half a day).
  const daysElapsedFull = Math.max(1, Math.min(7, daysSinceStart))

  // ------- Pull invoices for the current week, in parallel with
  //         forecasts, targets, and COGS history.
  const earliest8wkStart = new Date(start)
  earliest8wkStart.setUTCDate(earliest8wkStart.getUTCDate() - 7 * 8)

  const [
    invoices,
    forecasts,
    targets,
    cogsSupplierHistory,
    unassignedRaw,
    latestInvoiceByAlias,
  ] = await Promise.all([
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: start, lt: end },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] },
      },
      select: {
        id: true,
        supplierName: true,
        invoiceDate: true,
        venue: true,
        total: true,
      },
    }),
    db.managerSalesForecast.findMany({
      where: { weekStartWed: start },
    }),
    db.venueCogsTarget.findMany(),
    db.cogsSupplierLine.findMany({
      where: { weekStartWed: { gte: earliest8wkStart, lt: start } },
      select: {
        venue: true,
        supplier: true,
        amount: true,
        weekStartWed: true,
      },
    }),
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: start, lt: end },
        venue: null,
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] },
      },
      select: {
        id: true,
        supplierName: true,
        invoiceDate: true,
        total: true,
        invoiceNumber: true,
      },
      orderBy: { invoiceDate: "desc" },
    }),
    db.invoice.groupBy({
      by: ["supplierName"],
      _max: { invoiceDate: true },
      where: { status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] } },
    }),
  ])

  // ------- Targets
  const targetByVenue = new Map<Venue, number>()
  for (const t of targets) targetByVenue.set(t.venue, Number(t.targetPct))
  const burleighTargetPct = targetByVenue.get("BURLEIGH") ?? 27
  // Currumbin bucket uses the BEACH_HOUSE target (Tea Garden rolls in).
  const currumbinTargetPct = targetByVenue.get("BEACH_HOUSE") ?? 28

  // ------- Forecasts (sum BEACH_HOUSE + TEA_GARDEN into Currumbin bucket)
  let burleighForecast: number | null = null
  let currumbinForecast: number | null = null
  for (const f of forecasts) {
    const amt = Number(f.amount)
    if (f.venue === "BURLEIGH") burleighForecast = (burleighForecast ?? 0) + amt
    if (f.venue === "BEACH_HOUSE" || f.venue === "TEA_GARDEN")
      currumbinForecast = (currumbinForecast ?? 0) + amt
  }

  // ------- Build per-bucket aggregates
  const bucketAgg: Record<
    SpendBucket,
    {
      spent: number
      invoiceCount: number
      daily: DailySpendCell[]
      supplierMap: Map<string, { amount: number; invoiceCount: number }>
    }
  > = {
    BURLEIGH: {
      spent: 0,
      invoiceCount: 0,
      daily: buildDailySkeleton(start),
      supplierMap: new Map(),
    },
    CURRUMBIN: {
      spent: 0,
      invoiceCount: 0,
      daily: buildDailySkeleton(start),
      supplierMap: new Map(),
    },
  }

  for (const inv of invoices) {
    if (!inv.invoiceDate || inv.total == null) continue
    const bucket = venueToBucket(inv.venue)
    if (!bucket) continue // unassigned — handled separately below
    const amt = Number(inv.total)
    const dateKey = aestDateKey(inv.invoiceDate)
    const agg = bucketAgg[bucket]
    agg.spent += amt
    agg.invoiceCount += 1
    const dayCell = agg.daily.find((c) => c.date === dateKey)
    if (dayCell) {
      dayCell.amount += amt
      dayCell.invoiceCount += 1
    }
    const supplierKey = inv.supplierName
    const existing = agg.supplierMap.get(supplierKey) ?? {
      amount: 0,
      invoiceCount: 0,
    }
    existing.amount += amt
    existing.invoiceCount += 1
    agg.supplierMap.set(supplierKey, existing)
  }

  // Compute cumulative totals per bucket.
  for (const bucket of SPEND_BUCKETS) {
    let running = 0
    for (const cell of bucketAgg[bucket].daily) {
      running += cell.amount
      cell.cumulative = Math.round(running * 100) / 100
      cell.amount = Math.round(cell.amount * 100) / 100
    }
  }

  // ------- 4-wk supplier averages per bucket (from COGS xlsx history)
  const cogsAvgPerBucket = new Map<SpendBucket, Map<string, number>>()
  cogsAvgPerBucket.set("BURLEIGH", new Map())
  cogsAvgPerBucket.set("CURRUMBIN", new Map())
  // First sum per (bucket, supplier, week), then take avg over weeks.
  const weekByKey = new Map<string, number>()
  for (const row of cogsSupplierHistory) {
    const bucket = venueToBucket(row.venue)
    if (!bucket) continue
    const wkKey = row.weekStartWed.toISOString().split("T")[0]
    const key = `${bucket}::${row.supplier}::${wkKey}`
    weekByKey.set(key, (weekByKey.get(key) ?? 0) + Number(row.amount))
  }
  // Group by (bucket, supplier) and average across the weeks they appear.
  const supplierWeeks = new Map<string, number[]>()
  for (const [key, amount] of weekByKey) {
    const [bucket, supplier] = key.split("::") as [SpendBucket, string]
    const grp = `${bucket}::${supplier}`
    const arr = supplierWeeks.get(grp) ?? []
    arr.push(amount)
    supplierWeeks.set(grp, arr)
  }
  for (const [grp, amounts] of supplierWeeks) {
    const [bucket, supplier] = grp.split("::") as [SpendBucket, string]
    const recent4 = amounts.slice(-4)
    const avg = recent4.reduce((a, b) => a + b, 0) / recent4.length
    cogsAvgPerBucket.get(bucket)!.set(supplier, Math.round(avg * 100) / 100)
  }

  // ------- Coverage audit (cross-venue — invoice latest-seen is what
  //         tells us whether accounts@ is on the supplier's mailing list).
  const todayMs = Date.now()
  const latestByAlias = new Map<string, Date | null>()
  for (const r of latestInvoiceByAlias) {
    latestByAlias.set(r.supplierName, r._max.invoiceDate ?? null)
  }

  const coverage: CoverageRow[] = EXPECTED_SUPPLIERS.map(
    (sup: ExpectedSupplier) => {
      // Latest invoice across all known aliases for this supplier.
      let latest: Date | null = null
      for (const alias of sup.nameAliases) {
        const candidate = latestByAlias.get(alias)
        if (candidate && (!latest || candidate > latest)) latest = candidate
      }
      const lastInvoiceDate = latest ? aestDateKey(latest) : null
      const daysSinceLast = latest
        ? Math.floor((todayMs - latest.getTime()) / msInDay)
        : null
      let status: CoverageRow["status"]
      if (daysSinceLast === null) status = "missing"
      else if (daysSinceLast > sup.expectedIntervalDays * 2) status = "overdue"
      else if (daysSinceLast > sup.expectedIntervalDays) status = "due-soon"
      else status = "ok"

      // Estimated weekly spend (sum across both buckets) from 4-wk avg.
      let estimatedWeeklySpend: number | null = null
      for (const alias of sup.nameAliases) {
        for (const bucket of SPEND_BUCKETS) {
          const v = cogsAvgPerBucket.get(bucket)!.get(alias)
          if (v) estimatedWeeklySpend = (estimatedWeeklySpend ?? 0) + v
        }
      }

      return {
        canonicalName: sup.canonicalName,
        category: sup.category,
        critical: sup.critical,
        note: sup.note,
        lastInvoiceDate,
        daysSinceLast,
        expectedIntervalDays: sup.expectedIntervalDays,
        status,
        estimatedWeeklySpend,
      }
    }
  )
  // Sort: critical first, then by status severity.
  const statusRank: Record<CoverageRow["status"], number> = {
    overdue: 0,
    missing: 1,
    "due-soon": 2,
    ok: 3,
  }
  coverage.sort((a, b) => {
    const critDiff = Number(b.critical) - Number(a.critical)
    if (critDiff !== 0) return critDiff
    const statusDiff = statusRank[a.status] - statusRank[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.canonicalName.localeCompare(b.canonicalName)
  })

  // ------- Estimated missing spend per bucket
  // Only count suppliers that are overdue/missing AND have a 4-wk avg —
  // we don't fabricate numbers for suppliers we have no signal on.
  const estimatedMissingPerBucket: Record<SpendBucket, number> = {
    BURLEIGH: 0,
    CURRUMBIN: 0,
  }
  for (const sup of EXPECTED_SUPPLIERS) {
    const cov = coverage.find((c) => c.canonicalName === sup.canonicalName)
    if (!cov) continue
    if (cov.status !== "overdue" && cov.status !== "missing") continue
    for (const alias of sup.nameAliases) {
      for (const bucket of SPEND_BUCKETS) {
        const avg = cogsAvgPerBucket.get(bucket)!.get(alias)
        if (avg) estimatedMissingPerBucket[bucket] += avg
      }
    }
  }

  // ------- Assemble per-bucket output
  const buckets: BucketSpendData[] = SPEND_BUCKETS.map((bucket) => {
    const agg = bucketAgg[bucket]
    const forecast =
      bucket === "BURLEIGH" ? burleighForecast : currumbinForecast
    const targetPct =
      bucket === "BURLEIGH" ? burleighTargetPct : currumbinTargetPct
    const budget = forecast == null ? null : (forecast * targetPct) / 100
    const estimatedMissing =
      Math.round(estimatedMissingPerBucket[bucket] * 100) / 100
    const spentToDate = Math.round(agg.spent * 100) / 100
    // Scale the estimated-missing by the fraction of the week elapsed:
    // if we're 3/7 of the way through, only add 3/7 of the weekly avg
    // for suppliers whose invoice hasn't shown up yet.
    const elapsedFraction = daysElapsedFull / 7
    const scaledMissing =
      Math.round(estimatedMissing * elapsedFraction * 100) / 100
    const effectiveSpent =
      Math.round((spentToDate + scaledMissing) * 100) / 100
    const remaining =
      budget == null ? null : Math.round((budget - effectiveSpent) * 100) / 100
    // Pace: project end-of-week spend at the current daily rate.
    // For the missing-supplier component, project the full weekly avg
    // rather than scaling (these will land in full by week end).
    const projectedFromInvoices =
      daysElapsedFull > 0
        ? Math.round((spentToDate / daysElapsedFull) * 7 * 100) / 100
        : 0
    const projectedEndOfWeek =
      Math.round((projectedFromInvoices + estimatedMissing) * 100) / 100
    let paceStatus: BucketSpendData["paceStatus"]
    if (budget == null) paceStatus = "no-forecast"
    else if (projectedEndOfWeek > budget * 1.05) paceStatus = "over"
    else if (projectedEndOfWeek > budget * 0.95) paceStatus = "watch"
    else paceStatus = "on-track"

    const suppliers: SupplierSpendCell[] = Array.from(
      agg.supplierMap.entries()
    )
      .map(([supplier, v]) => ({
        supplier,
        amount: Math.round(v.amount * 100) / 100,
        invoiceCount: v.invoiceCount,
        fourWeekAvg:
          cogsAvgPerBucket.get(bucket)!.get(supplier) ??
          (() => {
            const exp = matchExpectedSupplier(supplier)
            if (!exp) return null
            let sum = 0
            let found = false
            for (const alias of exp.nameAliases) {
              const v = cogsAvgPerBucket.get(bucket)!.get(alias)
              if (v) {
                sum += v
                found = true
              }
            }
            return found ? Math.round(sum * 100) / 100 : null
          })(),
      }))
      .sort((a, b) => b.amount - a.amount)

    return {
      bucket,
      label: SPEND_BUCKET_LABEL[bucket],
      spentToDate,
      forecastRevenue:
        forecast == null ? null : Math.round(forecast * 100) / 100,
      estimatedMissingSpend: estimatedMissing,
      effectiveSpent,
      targetPct,
      budget: budget == null ? null : Math.round(budget * 100) / 100,
      remaining,
      projectedEndOfWeek,
      paceStatus,
      invoiceCount: agg.invoiceCount,
      daily: agg.daily,
      suppliers,
    }
  })

  // ------- Unassigned (invoices in this week with null venue)
  const unassigned: UnassignedInvoice[] = unassignedRaw.map((u) => ({
    id: u.id,
    supplierName: u.supplierName,
    invoiceDate: u.invoiceDate ? aestDateKey(u.invoiceDate) : null,
    total: u.total == null ? null : Number(u.total),
    invoiceNumber: u.invoiceNumber,
  }))

  return {
    weekStartWed,
    weekEndTue,
    todayAest,
    dayOfWeek,
    daysElapsedFull,
    buckets,
    coverage,
    unassigned,
  }
}

/**
 * Server action to assign a venue to an invoice that came through with
 * a null venue field. Called from the unassigned panel on /spend.
 */
export async function assignInvoiceVenue(params: {
  invoiceId: string
  venue: Venue
}): Promise<void> {
  await db.invoice.update({
    where: { id: params.invoiceId },
    data: { venue: params.venue },
  })
}
