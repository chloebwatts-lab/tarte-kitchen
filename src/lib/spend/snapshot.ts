/**
 * The Live Spend snapshot, built from rows already read from the database.
 * Pure (no DB, clock passed in) so the /spend page, the Sunday email, the
 * Friday digest and Shifts' owner note (all via getCurrentWeekSpend in
 * current-week.ts) run the same code as the backtests and the tests.
 *
 * The headline, "left to spend", is budget minus what has come in minus the
 * deliveries that usually still land before Tuesday close (still-to-come.ts):
 *  - spent so far = invoices in hand, plus the deliveries of the days before
 *    today that are normally not invoiced yet at this point in the week
 *    (arrival-lag.ts). Today's invoices count as they are.
 *  - still to come = each supplier's usual for the rest of today (when it
 *    has not invoiced for today yet) and the days after, at this week's
 *    trade. The pace projection adds the same deliveries.
 *  - overdue = the days before today a supplier has not invoiced because
 *    its invoices have stopped (overdue-gap.ts), at the same usual. Its own
 *    line, off the headline and in the pace exactly once.
 * Until 23 Oct 2026 the gross-up ran through today and nothing was added
 * for the days after, so on Sunday 18 Oct Burleigh read $3,708 left with
 * the usual $8k Monday and Tuesday still to come; the week finished $3.7k
 * over. Same instant now: about $5.3k over.
 */

import { Venue } from "@/generated/prisma/client"
import { currentTarteWeekRange, weekStartWedIso } from "@/lib/dates"
import { exGstInvoiceAmount } from "./gst"
import { sharedSplit } from "./shared-split"
import { arrivalCompleteness, type ArrivalLagRow } from "./arrival-lag"
import { isCompletedSalesDay } from "./sales-day"
import {
  fullHistoryWeeks,
  historyWeekIndex,
  projectEndOfWeekSpend,
  projectWeekRevenue,
  usualHistory,
  usualWeekSpend,
  type HistoryWeek,
} from "./projection"
import { supplierWeekdayUsual, usualStillToCome, type SupplierDayRow } from "./still-to-come"
import { overdueGap } from "./overdue-gap"
import { suspectRevenueDay } from "./guards"
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
  type SupplierSpendCell,
  type CoverageRow,
  type UnassignedInvoice,
  type BucketSpendData,
  type CurrentWeekSpendSnapshot,
} from "./types"

const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000

/** A Prisma Decimal, a number, or null: anything Number() reads. */
type Amount = { toString(): string } | number | null

/** The rows getCurrentWeekSpend reads, one field per query. */
export interface SpendSnapshotRows {
  /// Invoices dated this trading week (valid statuses)
  invoices: Array<{ supplierName: string; invoiceDate: Date | null; venue: Venue | null; total: Amount; subtotal: Amount; gst: Amount }>
  forecasts: Array<{ venue: Venue; amount: Amount }>
  targets: Array<{ venue: Venue; targetPct: Amount }>
  /// Louise's COGS xlsx supplier lines, the 8 weeks before this one
  cogsSupplierHistory: Array<{ venue: Venue | null; supplier: string; amount: Amount; weekStartWed: Date }>
  /// This week's invoices with no venue
  unassignedRaw: Array<{ id: string; supplierName: string; invoiceDate: Date | null; total: Amount; subtotal: Amount; invoiceNumber: string | null }>
  latestInvoiceByAlias: Array<{ supplierName: string; _max: { invoiceDate: Date | null } }>
  /// Takings rows dated this week
  salesSummaries: Array<{ date: Date; venue: Venue; totalRevenueExGst: Amount; source: "API" | "EMAIL" }>
  /// Takings rows, the 8 weeks before this one
  salesHistory: Array<{ date: Date; venue: Venue; totalRevenueExGst: Amount }>
  /// Invoices with a venue, the 8 weeks before this one
  invoiceHistory: Array<{ invoiceDate: Date | null; createdAt: Date; venue: Venue | null; supplierName: string; total: Amount; subtotal: Amount; gst: Amount }>
}

/** The 8 weeks of history the snapshot reads, Wed 00:00 (UTC date) to this week's start. */
export function snapshotWindow(now: Date): { start: Date; end: Date; historyStart: Date } {
  const { start, end } = currentTarteWeekRange(now)
  const historyStart = new Date(start)
  historyStart.setUTCDate(historyStart.getUTCDate() - 7 * 8)
  return { start, end, historyStart }
}

/**
 * One name per supplier, whichever alias, case or spacing the invoice came
 * in under, so a supplier already in for today is never also "still to come".
 */
export function spendSupplierKey(supplierName: string): string {
  const known = matchExpectedSupplier(supplierName)?.canonicalName
  if (known) return known
  return supplierName
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

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

const cents = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

export function buildSpendSnapshot(rows: SpendSnapshotRows, now: Date): CurrentWeekSpendSnapshot {
  const {
    invoices,
    forecasts,
    targets,
    cogsSupplierHistory,
    unassignedRaw,
    latestInvoiceByAlias,
    salesSummaries,
    salesHistory,
    invoiceHistory,
  } = rows
  const { start, end } = snapshotWindow(now)
  const weekStartWed = weekStartWedIso(start)
  const weekEndTueDate = new Date(end)
  weekEndTueDate.setUTCDate(weekEndTueDate.getUTCDate() - 1)
  const weekEndTue = aestDateKey(weekEndTueDate)
  const todayAest = aestDateKey(now)

  // Day-of-week within the trading week (1 = Wed ... 7 = Tue).
  const msInDay = 24 * 60 * 60 * 1000
  const aestNowMs = now.getTime() + BRISBANE_OFFSET_MS
  const aestStartMs = start.getTime()
  // Whole AEST days completed since Wed 00:00 (0 on the Wednesday).
  const daysSinceStart = Math.min(6, Math.max(0, Math.floor((aestNowMs - aestStartMs) / msInDay)))
  const dayOfWeek = daysSinceStart + 1
  // Fully elapsed days (shown on /spend). The spend projection does NOT use
  // this: its fallbacks project from the days through today
  // (daysThroughToday). Mixing the two made a Thursday divide two days of
  // deliveries by Wednesday's share alone.
  const daysElapsedFull = Math.max(1, Math.min(7, daysSinceStart))
  const daysThroughToday = daysSinceStart + 1
  // Today as a trading-day index, 0 = Wed
  const todayIdx = daysSinceStart

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
      /// Part of spent dated before today: the only part the arrival-lag
      /// gross-up applies to (today's deliveries are still coming in)
      spentBeforeToday: number
      invoiceCount: number
      daily: DailySpendCell[]
      supplierMap: Map<string, { amount: number; invoiceCount: number }>
      /// Supplier (spendSupplierKey) -> trading days it has invoiced for
      invoicedDays: Map<string, Set<number>>
      /// Supplier -> its part of spentBeforeToday
      beforeTodayBySupplier: Map<string, number>
    }
  > = {
    BURLEIGH: {
      spent: 0,
      spentBeforeToday: 0,
      invoiceCount: 0,
      daily: buildDailySkeleton(start),
      supplierMap: new Map(),
      invoicedDays: new Map(),
      beforeTodayBySupplier: new Map(),
    },
    CURRUMBIN: {
      spent: 0,
      spentBeforeToday: 0,
      invoiceCount: 0,
      daily: buildDailySkeleton(start),
      supplierMap: new Map(),
      invoicedDays: new Map(),
      beforeTodayBySupplier: new Map(),
    },
  }

  // Days each supplier has invoiced, any venue, as offsets from this week's
  // Wednesday (history negative): whether its invoices have stopped is the
  // supplier's, as on the coverage table, not one venue's (overdue-gap.ts).
  const invoicedOn = new Map<string, Set<number>>()
  const dayOffset = (d: Date) => Math.round((Date.parse(aestDateKey(d)) - start.getTime()) / msInDay)
  const markInvoiced = (canonical: string, d: Date) => {
    const set = invoicedOn.get(canonical) ?? new Set<number>()
    set.add(dayOffset(d))
    invoicedOn.set(canonical, set)
  }

  for (const inv of invoices) {
    // Only skip when we truly have no amount at all, an invoice with a
    // subtotal but no parsed total is still real spend.
    if (!inv.invoiceDate || (inv.subtotal == null && inv.total == null)) continue
    // ex-GST to match the budget basis
    const amt = exGstInvoiceAmount(inv)
    if (amt > 0) markInvoiced(spendSupplierKey(inv.supplierName), inv.invoiceDate)
    // Venue BOTH = genuinely shared spend (per Chris 2026-07-14 Breadtop
    // is a 50/50 split). The ratio comes from shared-split.ts so a supplier
    // can carry its own (Parallel Roasters 55/45).
    const split = sharedSplit(inv.supplierName)
    const targets: Array<{ bucket: SpendBucket; amount: number }> =
      inv.venue === "BOTH"
        ? [
            { bucket: "BURLEIGH", amount: amt * split.BURLEIGH },
            { bucket: "CURRUMBIN", amount: amt * split.CURRUMBIN },
          ]
        : (() => {
            const bucket = venueToBucket(inv.venue)
            return bucket ? [{ bucket, amount: amt }] : [] // unassigned, handled separately below
          })()
    const dateKey = aestDateKey(inv.invoiceDate)
    const canonical = spendSupplierKey(inv.supplierName)
    for (const t of targets) {
      const agg = bucketAgg[t.bucket]
      agg.spent += t.amount
      agg.invoiceCount += 1
      const dayIdx = agg.daily.findIndex((c) => c.date === dateKey)
      if (dayIdx >= 0) {
        agg.daily[dayIdx].amount += t.amount
        agg.daily[dayIdx].invoiceCount += 1
        if (dayIdx < todayIdx) {
          agg.spentBeforeToday += t.amount
          agg.beforeTodayBySupplier.set(canonical, (agg.beforeTodayBySupplier.get(canonical) ?? 0) + t.amount)
        }
        // A supplier that has invoiced for a day has made that delivery: its
        // usual for the day is not still to come (credit notes do not count)
        if (t.amount > 0) {
          const days = agg.invoicedDays.get(canonical) ?? new Set<number>()
          days.add(dayIdx)
          agg.invoicedDays.set(canonical, days)
        }
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

  // ------- Live revenue per bucket (POS end-of-day figures, ex GST)
  const revenueByBucketDate = new Map<string, number>()
  const revenueReportedDates: Record<SpendBucket, Set<string>> = {
    BURLEIGH: new Set(),
    CURRUMBIN: new Set(),
  }
  // Today's intraday Square figure: shown as "so far", never a reported day.
  // Counting it as a full day made the Sunday 08:30 email read Sunday's
  // first $2k of coffees as the whole day and pace the week at 80%.
  const todaySoFarByBucket: Record<SpendBucket, number | null> = {
    BURLEIGH: null,
    CURRUMBIN: null,
  }
  for (const row of salesSummaries) {
    const bucket = venueToBucket(row.venue)
    if (!bucket) continue
    // @db.Date rows sit at UTC midnight of the AEST calendar day.
    const dateKey = row.date.toISOString().split("T")[0]
    if (!isCompletedSalesDay(dateKey, todayAest, row.source)) {
      todaySoFarByBucket[bucket] =
        (todaySoFarByBucket[bucket] ?? 0) + Number(row.totalRevenueExGst)
      continue
    }
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
  // Absolute 8-week average takings per trading weekday (idx 0 = Wed),
  // null where fewer than 3 weeks of data. Feeds the suspect-day guard.
  const revenueWeekdayAvg: Record<SpendBucket, Array<number | null>> = {
    BURLEIGH: new Array(7).fill(null),
    CURRUMBIN: new Array(7).fill(null),
  }
  // The 8 weeks before this one, ex GST, idx 0 = the week just gone. Over
  // the weeks with all their takings on file, spend ÷ takings is the usual
  // spend per $ of takings and takings ÷ weeks a usual week (usualHistory).
  const historyWeeks: Record<SpendBucket, HistoryWeek[]> = {
    BURLEIGH: Array.from({ length: 8 }, () => ({ spend: 0, revenue: 0, revenueDays: 0 })),
    CURRUMBIN: Array.from({ length: 8 }, () => ({ spend: 0, revenue: 0, revenueDays: 0 })),
  }
  const historyRevenueDates: Record<SpendBucket, Set<number>> = {
    BURLEIGH: new Set(),
    CURRUMBIN: new Set(),
  }
  // The same spend by supplier and trading day: each supplier's usual week,
  // for the deliveries still to come (still-to-come.ts).
  const supplierDayRows: Record<SpendBucket, SupplierDayRow[]> = {
    BURLEIGH: [],
    CURRUMBIN: [],
  }
  const addHistorySpend = (bucket: SpendBucket, date: Date, amount: number, supplier: string, day: number) => {
    const k = historyWeekIndex(start.getTime(), date.getTime())
    if (k == null) return
    historyWeeks[bucket][k].spend += amount
    supplierDayRows[bucket].push({ supplier, week: k, day, amount })
  }
  // Rows for the invoice arrival-lag estimate (see arrival-lag.ts), by
  // supplier so an overdue supplier can be left out of it.
  const lagRows: Record<SpendBucket, Array<ArrivalLagRow & { supplier: string }>> = {
    BURLEIGH: [],
    CURRUMBIN: [],
  }
  const WEEK_MS = 7 * msInDay
  {
    const revRows: Record<SpendBucket, Array<{ idx: number; amount: number }>> =
      { BURLEIGH: [], CURRUMBIN: [] }
    for (const row of salesHistory) {
      const bucket = venueToBucket(row.venue)
      if (!bucket) continue
      revRows[bucket].push({
        // @db.Date at UTC midnight, weekday is directly readable.
        idx: tradingDayIndex(row.date, false),
        amount: Number(row.totalRevenueExGst),
      })
      const k = historyWeekIndex(start.getTime(), row.date.getTime())
      if (k != null) {
        historyWeeks[bucket][k].revenue += Number(row.totalRevenueExGst)
        if (!historyRevenueDates[bucket].has(row.date.getTime())) {
          historyRevenueDates[bucket].add(row.date.getTime())
          historyWeeks[bucket][k].revenueDays += 1
        }
      }
    }
    const spendRows: Record<
      SpendBucket,
      Array<{ idx: number; amount: number }>
    > = { BURLEIGH: [], CURRUMBIN: [] }
    for (const row of invoiceHistory) {
      if (!row.invoiceDate || (row.subtotal == null && row.total == null)) continue
      const idx = tradingDayIndex(row.invoiceDate, true)
      const exGst = exGstInvoiceAmount(row)
      const canonical = spendSupplierKey(row.supplierName)
      const invoiceDateMs = row.invoiceDate.getTime()
      const lagBase = {
        weekStartMs:
          start.getTime() -
          Math.ceil((start.getTime() - invoiceDateMs) / WEEK_MS) * WEEK_MS,
        invoiceDateMs,
        createdAtMs: row.createdAt.getTime(),
        supplier: canonical,
      }
      if (exGst > 0) markInvoiced(canonical, row.invoiceDate)
      if (row.venue === "BOTH") {
        const split = sharedSplit(row.supplierName)
        spendRows.BURLEIGH.push({ idx, amount: exGst * split.BURLEIGH })
        spendRows.CURRUMBIN.push({ idx, amount: exGst * split.CURRUMBIN })
        addHistorySpend("BURLEIGH", row.invoiceDate, exGst * split.BURLEIGH, canonical, idx)
        addHistorySpend("CURRUMBIN", row.invoiceDate, exGst * split.CURRUMBIN, canonical, idx)
        lagRows.BURLEIGH.push({ ...lagBase, amount: exGst * split.BURLEIGH })
        lagRows.CURRUMBIN.push({ ...lagBase, amount: exGst * split.CURRUMBIN })
        continue
      }
      const bucket = venueToBucket(row.venue)
      if (!bucket) continue
      spendRows[bucket].push({ idx, amount: exGst })
      addHistorySpend(bucket, row.invoiceDate, exGst, canonical, idx)
      lagRows[bucket].push({ ...lagBase, amount: exGst })
    }
    for (const bucket of SPEND_BUCKETS) {
      revenueShares[bucket] = buildShares(revRows[bucket])
      spendShares[bucket] = buildShares(spendRows[bucket])
      const sums = new Array<number>(7).fill(0)
      const counts = new Array<number>(7).fill(0)
      for (const r of revRows[bucket]) {
        sums[r.idx] += r.amount
        counts[r.idx] += 1
      }
      revenueWeekdayAvg[bucket] = sums.map((v, i) => (counts[i] >= 3 ? v / counts[i] : null))
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

  // ------- Coverage audit (cross-venue, invoice latest-seen is what
  //         tells us whether accounts@ is on the supplier's mailing list).
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
      // Compare AEST calendar-date keys, not raw instants: invoiceDate is
      // stored as UTC midnight of the AEST date (the 10:00 AEST instant),
      // so before 10am a today invoice read as -1 days ago. Clamp at 0.
      const daysSinceLast = latest
        ? Math.max(
            0,
            Math.round(
              (Date.parse(todayAest) - Date.parse(aestDateKey(latest))) /
                msInDay
            )
          )
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

  // The supplier's latest invoice ever (any venue), as the coverage table
  // reads it, also ends a run of days with no invoice.
  for (const r of latestInvoiceByAlias) {
    if (r._max.invoiceDate) markInvoiced(spendSupplierKey(r.supplierName), r._max.invoiceDate)
  }
  const expectedIntervals = new Map(EXPECTED_SUPPLIERS.map((s) => [s.canonicalName, s.expectedIntervalDays]))

  // ------- Assemble per-bucket output
  const buckets: BucketSpendData[] = SPEND_BUCKETS.map((bucket) => {
    const agg = bucketAgg[bucket]
    const forecast =
      bucket === "BURLEIGH" ? burleighForecast : currumbinForecast
    const targetPct =
      bucket === "BURLEIGH" ? burleighTargetPct : currumbinTargetPct
    const budget = forecast == null ? null : (forecast * targetPct) / 100
    const spentToDate = Math.round(agg.spent * 100) / 100
    // ---- Live revenue (POS end-of-day, ex GST) ----
    // A completed day far below its weekday average is almost always a
    // partial figure: show it, flag it, keep it out of the pace.
    const reportedDates = new Set(revenueReportedDates[bucket])
    const revenueNotes: string[] = []
    for (const [i, cell] of agg.daily.entries()) {
      if (!reportedDates.has(cell.date)) continue
      const amt = revenueByBucketDate.get(`${bucket}::${cell.date}`) ?? 0
      const avg = revenueWeekdayAvg[bucket][i]
      if (suspectRevenueDay(amt, avg)) {
        reportedDates.delete(cell.date)
        revenueNotes.push(
          `${cell.dayName} ${cell.date.slice(5)} shows $${Math.round(amt).toLocaleString("en-AU")} against a usual $${Math.round(avg!).toLocaleString("en-AU")}, so it looks incomplete and is left out of the pace.`
        )
      }
    }
    const todaySoFar = todaySoFarByBucket[bucket]
    const revenueDaily: DailyRevenueCell[] = []
    let revenueRunning = 0
    for (const cell of agg.daily) {
      const counted = reportedDates.has(cell.date)
      const raw = revenueByBucketDate.get(`${bucket}::${cell.date}`) ?? 0
      const amt = counted ? raw : 0
      revenueRunning += amt
      revenueDaily.push({
        date: cell.date,
        dayName: cell.dayName,
        amount: Math.round(amt * 100) / 100,
        cumulative: Math.round(revenueRunning * 100) / 100,
        reported: counted,
        ...(cell.date === todayAest && todaySoFar != null
          ? { soFar: Math.round(todaySoFar * 100) / 100 }
          : {}),
        ...(!counted && revenueReportedDates[bucket].has(cell.date)
          ? { suspect: true, soFar: Math.round(raw * 100) / 100 }
          : {}),
      })
    }
    const revenueDaysReported = reportedDates.size
    const revenueToDateExGst =
      revenueDaysReported > 0 ? Math.round(revenueRunning * 100) / 100 : null
    const lastRevenueDate =
      revenueDaysReported > 0 ? Array.from(reportedDates).sort().pop()! : null
    // Full-week takings: what is in plus the forecast's share for the days
    // to come (8-wk weekday profile), see projection.ts.
    const revShare = revenueShares[bucket]
    const usual = usualHistory(historyWeeks[bucket])
    const usualWeekRevenue = usual ? usual.revenue / usual.weeks : null
    const { projectedRevenueExGst, method: revenueProjectionMethod } =
      projectWeekRevenue({
        revenueToDate: revenueToDateExGst,
        daysReported: revenueDaysReported,
        reportedShare: revShare
          ? revenueDaily.reduce(
              (sum, cell, i) => (cell.reported ? sum + revShare[i] : sum),
              0
            )
          : null,
        forecast,
        usualWeekRevenue,
      })

    // A usual week of deliveries at the takings this week is expected to do
    // (projection.ts), then supplier by supplier what of it is overdue
    // (overdue-gap.ts: days before today with no invoice because the
    // supplier's invoices have stopped) and what is still to come
    // (still-to-come.ts: the rest of today for suppliers not in yet, and the
    // days after). Scaled so all seven days add up to the usual week.
    const usualWeek =
      spendShares[bucket] && usual
        ? usualWeekSpend({
            historySpend: usual.spend,
            historyRevenue: usual.revenue,
            // No takings in yet (Wednesday): the forecast, else a usual week
            expectedWeekRevenue:
              projectedRevenueExGst ??
              (forecast != null && forecast > 0 ? forecast : usualWeekRevenue),
          })
        : null
    const usualInput =
      usualWeek != null && usual != null && usual.spend > 0
        ? {
            history: supplierDayRows[bucket],
            weeks: fullHistoryWeeks(historyWeeks[bucket]),
            scale: usualWeek / (usual.spend / usual.weeks),
          }
        : null
    const supplierUsual = usualInput ? supplierWeekdayUsual(usualInput) : null
    // Steady = invoiced this venue in each of the last two weeks (overdue-gap.ts)
    const weeksInvoiced = new Map<string, Set<number>>()
    for (const r of supplierDayRows[bucket]) {
      if (r.amount <= 0 || r.week > 1) continue
      const set = weeksInvoiced.get(r.supplier) ?? new Set<number>()
      set.add(r.week)
      weeksInvoiced.set(r.supplier, set)
    }
    const steady = new Set([...weeksInvoiced].flatMap(([sup, w]) => (w.size === 2 ? [sup] : [])))
    const gap = supplierUsual
      ? overdueGap({
          usual: supplierUsual,
          todayIdx,
          intervals: expectedIntervals,
          steady,
          invoicedOn,
          dateOf: (offset) => aestDateKey(new Date(start.getTime() + offset * msInDay)),
        })
      : { total: 0, rows: [] }
    const gapSuppliers = new Set(gap.rows.map((r) => r.supplier))

    // Spent so far: invoices in hand, plus the deliveries of the days before
    // today that are normally not invoiced yet at this point in the week.
    // Today's invoices count as they are; today's deliveries still to land
    // are in usualStillToCome below, supplier by supplier. An overdue
    // supplier is left out of the gross-up on both sides (its history and
    // its invoices in hand): its days before today are what it has invoiced
    // plus the overdue gap, so the gross-up adding a share for them as well
    // would count them twice.
    let gapSupplierBeforeToday = 0
    for (const sup of gapSuppliers) gapSupplierBeforeToday += agg.beforeTodayBySupplier.get(sup) ?? 0
    const beforeToday = agg.spentBeforeToday - gapSupplierBeforeToday
    const completeness =
      todayIdx > 0
        ? arrivalCompleteness(
            gapSuppliers.size ? lagRows[bucket].filter((r) => !gapSuppliers.has(r.supplier)) : lagRows[bucket],
            aestNowMs - aestStartMs,
            todayIdx
          ) ?? 1
        : 1
    const estimatedSpentToDate = cents(
      Math.max(beforeToday, beforeToday / completeness) + (agg.spent - beforeToday)
    )
    const estimatedUninvoiced = cents(estimatedSpentToDate - spentToDate)
    const overdue = gap.total

    const stillToCome = usualInput
      ? usualStillToCome({ ...usualInput, todayIdx, invoiced: agg.invoicedDays })
      : null

    // Pace: spent so far plus the overdue gap plus the same deliveries still
    // to come, so "left", "pace" and the COGS % agree (projection.ts).
    const { projectedEndOfWeek, method: spendProjectionMethod } =
      projectEndOfWeekSpend({
        estimatedSpentToDate,
        spendShare: spendShares[bucket],
        daysThroughToday,
        usualWeekSpend: usualWeek,
        usualStillToCome: stillToCome?.total ?? null,
        overdueGap: overdue,
      })
    // Thin history: no supplier pattern, so still to come is whatever the
    // fallback projection adds for the rest of the week.
    const usualStillToComeTotal =
      stillToCome?.total ??
      cents(Math.max(0, projectedEndOfWeek - overdue - estimatedSpentToDate))
    // THE headline: what can still be ordered once the overdue invoices are
    // in and the usual deliveries have landed
    const leftToSpend =
      budget == null ? null : cents(budget - estimatedSpentToDate - overdue - usualStillToComeTotal)
    const leftBeforeStillToCome = budget == null ? null : cents(budget - estimatedSpentToDate - overdue)
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
      overdueGap: overdue,
      overdueGapRows: gap.rows,
      targetPct,
      budget: budget == null ? null : Math.round(budget * 100) / 100,
      estimatedSpentToDate,
      estimatedUninvoiced,
      usualStillToCome: usualStillToComeTotal,
      stillToCome: stillToCome?.rows ?? [],
      leftToSpend,
      leftBeforeStillToCome,
      projectedEndOfWeek,
      spendProjectionMethod,
      revenueProjectionMethod,
      paceStatus,
      invoiceCount: agg.invoiceCount,
      daily: agg.daily,
      suppliers,
      revenueToDateExGst,
      revenueDaysReported,
      lastRevenueDate,
      projectedRevenueExGst,
      revenueDaily,
      todaySoFarExGst:
        todaySoFar == null ? null : Math.round(todaySoFar * 100) / 100,
      revenueNotes,
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
