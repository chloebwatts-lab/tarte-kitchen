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
  type DailyRevenueCell,
  type MissingSpendRow,
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
    salesSummaries,
    salesHistory,
    invoiceHistory,
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
        subtotal: true,
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
        subtotal: true,
        invoiceNumber: true,
      },
      orderBy: { invoiceDate: "desc" },
    }),
    db.invoice.groupBy({
      by: ["supplierName"],
      _max: { invoiceDate: true },
      where: { status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] } },
    }),
    // Lightspeed EOD revenue for the week. `date` is a @db.Date stored at
    // UTC midnight of the AEST calendar day, so it sits inside [start, end).
    db.dailySalesSummary.findMany({
      where: { date: { gte: start, lt: end } },
      select: { date: true, venue: true, totalRevenueExGst: true },
    }),
    // 8 weeks of revenue history — weekday-share weights for projections
    db.dailySalesSummary.findMany({
      where: { date: { gte: earliest8wkStart, lt: start } },
      select: { date: true, venue: true, totalRevenueExGst: true },
    }),
    // 8 weeks of invoice history — weekday-share weights for spend pace
    db.invoice.findMany({
      where: {
        invoiceDate: { gte: earliest8wkStart, lt: start },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] },
        venue: { not: null },
      },
      select: { invoiceDate: true, venue: true, total: true, subtotal: true },
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
    // ex-GST to match the budget basis (subtotal falls back to total for
    // the odd invoice whose parser found no subtotal line)
    const amt = Number(inv.subtotal ?? inv.total)
    // Venue BOTH = genuinely shared spend (per Chris 2026-07-14 Breadtop
    // is a 50/50 split) — half the total lands in each bucket.
    const targets: Array<{ bucket: SpendBucket; amount: number }> =
      inv.venue === "BOTH"
        ? [
            { bucket: "BURLEIGH", amount: amt / 2 },
            { bucket: "CURRUMBIN", amount: amt / 2 },
          ]
        : (() => {
            const bucket = venueToBucket(inv.venue)
            return bucket ? [{ bucket, amount: amt }] : [] // unassigned — handled separately below
          })()
    const dateKey = aestDateKey(inv.invoiceDate)
    for (const t of targets) {
      const agg = bucketAgg[t.bucket]
      agg.spent += t.amount
      agg.invoiceCount += 1
      const dayCell = agg.daily.find((c) => c.date === dateKey)
      if (dayCell) {
        dayCell.amount += t.amount
        dayCell.invoiceCount += 1
      }
      const supplierKey = inv.supplierName
      const existing = agg.supplierMap.get(supplierKey) ?? {
        amount: 0,
        invoiceCount: 0,
      }
      existing.amount += t.amount
      existing.invoiceCount += 1
      agg.supplierMap.set(supplierKey, existing)
    }
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

  // ------- Live revenue per bucket (Lightspeed EOD emails, ex GST)
  const revenueByBucketDate = new Map<string, number>()
  const revenueReportedDates: Record<SpendBucket, Set<string>> = {
    BURLEIGH: new Set(),
    CURRUMBIN: new Set(),
  }
  for (const row of salesSummaries) {
    const bucket = venueToBucket(row.venue)
    if (!bucket) continue
    // @db.Date rows sit at UTC midnight of the AEST calendar day.
    const dateKey = row.date.toISOString().split("T")[0]
    const key = `${bucket}::${dateKey}`
    revenueByBucketDate.set(
      key,
      (revenueByBucketDate.get(key) ?? 0) + Number(row.totalRevenueExGst)
    )
    revenueReportedDates[bucket].add(dateKey)
  }

  // ------- Weekday-share weights (last 8 weeks) for projections.
  // Index 0 = Wed … 6 = Tue (trading-week order). Straight-line ÷days×7
  // systematically overshoots on a Monday (the average includes the
  // weekend peak) and undershoots midweek, so instead we ask: "what
  // fraction of a normal week's total lands on the days we've already
  // seen?" and divide by that.
  const tradingDayIndex = (d: Date, shiftAest: boolean): number => {
    const dow = shiftAest
      ? new Date(d.getTime() + BRISBANE_OFFSET_MS).getUTCDay()
      : d.getUTCDay()
    return (dow - 3 + 7) % 7 // 3 = Wednesday
  }
  const buildShares = (
    rows: Array<{ idx: number; amount: number }>
  ): number[] | null => {
    const sums = [0, 0, 0, 0, 0, 0, 0]
    let total = 0
    for (const r of rows) {
      sums[r.idx] += r.amount
      total += r.amount
    }
    // Need meaningful history before trusting the profile.
    if (total <= 0 || rows.length < 14) return null
    return sums.map((s) => s / total)
  }
  const revenueShares: Record<SpendBucket, number[] | null> = {
    BURLEIGH: null,
    CURRUMBIN: null,
  }
  const spendShares: Record<SpendBucket, number[] | null> = {
    BURLEIGH: null,
    CURRUMBIN: null,
  }
  {
    const revRows: Record<SpendBucket, Array<{ idx: number; amount: number }>> =
      { BURLEIGH: [], CURRUMBIN: [] }
    for (const row of salesHistory) {
      const bucket = venueToBucket(row.venue)
      if (!bucket) continue
      revRows[bucket].push({
        // @db.Date at UTC midnight — weekday is directly readable.
        idx: tradingDayIndex(row.date, false),
        amount: Number(row.totalRevenueExGst),
      })
    }
    const spendRows: Record<
      SpendBucket,
      Array<{ idx: number; amount: number }>
    > = { BURLEIGH: [], CURRUMBIN: [] }
    for (const row of invoiceHistory) {
      if (!row.invoiceDate || row.total == null) continue
      const idx = tradingDayIndex(row.invoiceDate, true)
      const exGst = Number(row.subtotal ?? row.total)
      if (row.venue === "BOTH") {
        const half = exGst / 2
        spendRows.BURLEIGH.push({ idx, amount: half })
        spendRows.CURRUMBIN.push({ idx, amount: half })
        continue
      }
      const bucket = venueToBucket(row.venue)
      if (!bucket) continue
      spendRows[bucket].push({ idx, amount: exGst })
    }
    for (const bucket of SPEND_BUCKETS) {
      revenueShares[bucket] = buildShares(revRows[bucket])
      spendShares[bucket] = buildShares(spendRows[bucket])
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
  const missingBreakdownPerBucket: Record<SpendBucket, MissingSpendRow[]> = {
    BURLEIGH: [],
    CURRUMBIN: [],
  }
  for (const sup of EXPECTED_SUPPLIERS) {
    const cov = coverage.find((c) => c.canonicalName === sup.canonicalName)
    if (!cov) continue
    if (cov.status !== "overdue" && cov.status !== "missing") continue
    for (const bucket of SPEND_BUCKETS) {
      let bucketEst = 0
      for (const alias of sup.nameAliases) {
        const avg = cogsAvgPerBucket.get(bucket)!.get(alias)
        if (avg) bucketEst += avg
      }
      if (bucketEst > 0) {
        estimatedMissingPerBucket[bucket] += bucketEst
        missingBreakdownPerBucket[bucket].push({
          supplier: sup.canonicalName,
          estWeekly: Math.round(bucketEst * 100) / 100,
          lastSeen: cov.lastInvoiceDate,
          daysSinceLast: cov.daysSinceLast,
        })
      }
    }
  }
  for (const bucket of SPEND_BUCKETS) {
    missingBreakdownPerBucket[bucket].sort((a, b) => b.estWeekly - a.estWeekly)
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
    // Pace: project end-of-week spend. Preferred: divide by the share of
    // a typical week's deliveries that lands on the elapsed weekdays
    // (8-wk history). Fallback: flat daily-rate extrapolation.
    // For the missing-supplier component, project the full weekly avg
    // rather than scaling (these will land in full by week end).
    const spendShare = spendShares[bucket]
    const elapsedSpendShare = spendShare
      ? spendShare.slice(0, daysElapsedFull).reduce((a, b) => a + b, 0)
      : 0
    const spendWeighted = spendShare != null && elapsedSpendShare >= 0.1
    const projectedFromInvoices = spendWeighted
      ? Math.round((spentToDate / elapsedSpendShare) * 100) / 100
      : daysElapsedFull > 0
      ? Math.round((spentToDate / daysElapsedFull) * 7 * 100) / 100
      : 0
    const projectedEndOfWeek =
      Math.round((projectedFromInvoices + estimatedMissing) * 100) / 100
    let paceStatus: BucketSpendData["paceStatus"]
    if (budget == null) paceStatus = "no-forecast"
    else if (projectedEndOfWeek > budget * 1.05) paceStatus = "over"
    else if (projectedEndOfWeek > budget * 0.95) paceStatus = "watch"
    else paceStatus = "on-track"

    // ---- Live revenue (Lightspeed EOD, ex GST) ----
    const reportedDates = revenueReportedDates[bucket]
    const revenueDaily: DailyRevenueCell[] = []
    let revenueRunning = 0
    for (const cell of agg.daily) {
      const amt = revenueByBucketDate.get(`${bucket}::${cell.date}`) ?? 0
      revenueRunning += amt
      revenueDaily.push({
        date: cell.date,
        dayName: cell.dayName,
        amount: Math.round(amt * 100) / 100,
        cumulative: Math.round(revenueRunning * 100) / 100,
        reported: reportedDates.has(cell.date),
      })
    }
    const revenueDaysReported = reportedDates.size
    const revenueToDateExGst =
      revenueDaysReported > 0 ? Math.round(revenueRunning * 100) / 100 : null
    const lastRevenueDate =
      revenueDaysReported > 0 ? Array.from(reportedDates).sort().pop()! : null
    // Full-week revenue pace: divide takings-so-far by the share of a
    // typical week those reported weekdays represent (8-wk history);
    // flat ÷days×7 as fallback.
    const revShare = revenueShares[bucket]
    const reportedRevShare = revShare
      ? revenueDaily.reduce(
          (sum, cell, i) => (cell.reported ? sum + revShare[i] : sum),
          0
        )
      : 0
    const revenueWeighted = revShare != null && reportedRevShare >= 0.1
    const projectedRevenueExGst =
      revenueToDateExGst == null
        ? null
        : revenueWeighted
        ? Math.round((revenueToDateExGst / reportedRevShare) * 100) / 100
        : Math.round(((revenueToDateExGst / revenueDaysReported) * 7) * 100) /
          100

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
      missingSpendBreakdown: missingBreakdownPerBucket[bucket],
      targetPct,
      budget: budget == null ? null : Math.round(budget * 100) / 100,
      remaining,
      projectedEndOfWeek,
      spendProjectionMethod: spendWeighted ? ("weighted" as const) : ("flat" as const),
      revenueProjectionMethod:
        revenueToDateExGst == null
          ? null
          : revenueWeighted
          ? ("weighted" as const)
          : ("flat" as const),
      paceStatus,
      invoiceCount: agg.invoiceCount,
      daily: agg.daily,
      suppliers,
      revenueToDateExGst,
      revenueDaysReported,
      lastRevenueDate,
      projectedRevenueExGst,
      revenueDaily,
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
