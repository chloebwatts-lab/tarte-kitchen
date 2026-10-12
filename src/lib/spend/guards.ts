/**
 * Guards that keep the Live Spend numbers honest wherever they are shown.
 *
 * 1. `suspectRevenueDay`: a completed day whose takings are a fraction of
 *    that weekday's 8-week average is almost always a partial figure (an
 *    EOD email that landed early, a Square row written mid-service), not a
 *    real quiet day. It is shown but kept out of the revenue pace, with a
 *    note saying so. This is the generic version of the 12 Oct 2026 fix
 *    for today's intraday Square row.
 *
 * 2. `checkSpendSnapshot`: invariants every consumer relies on. The Sunday
 *    email refuses to send when any fail and alerts instead, so a wrong
 *    figure never reaches staff as if it were right.
 */

import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"

/** Below this share of the weekday's average a reported day is suspect. */
export const SUSPECT_DAY_SHARE = 0.4
/** Weekday averages under this are too thin to judge against. */
export const SUSPECT_DAY_MIN_AVG = 2000

export function suspectRevenueDay(amount: number, weekdayAvg: number | null): boolean {
  if (weekdayAvg == null || !(weekdayAvg >= SUSPECT_DAY_MIN_AVG)) return false
  return amount < weekdayAvg * SUSPECT_DAY_SHARE
}

const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol
const finite = (n: number | null | undefined) => n == null || Number.isFinite(n)

/** Human-readable list of broken invariants; empty when all is well. */
export function checkSpendSnapshot(snap: CurrentWeekSpendSnapshot): string[] {
  const problems: string[] = []
  if (!(snap.dayOfWeek >= 1 && snap.dayOfWeek <= 7)) problems.push(`dayOfWeek ${snap.dayOfWeek} is outside 1-7`)
  for (const b of snap.buckets) problems.push(...checkBucket(b, snap.todayAest))
  return problems
}

export function checkBucket(b: BucketSpendData, todayAest: string): string[] {
  const p: string[] = []
  const tag = (m: string) => `${b.label}: ${m}`
  const numeric: Array<[string, number | null | undefined]> = [
    ["spentToDate", b.spentToDate],
    ["estimatedSpentToDate", b.estimatedSpentToDate],
    ["estimatedUninvoiced", b.estimatedUninvoiced],
    ["budget", b.budget],
    ["leftToSpend", b.leftToSpend],
    ["projectedEndOfWeek", b.projectedEndOfWeek],
    ["revenueToDateExGst", b.revenueToDateExGst],
    ["projectedRevenueExGst", b.projectedRevenueExGst],
    ["todaySoFarExGst", b.todaySoFarExGst],
  ]
  for (const [name, v] of numeric) if (!finite(v)) p.push(tag(`${name} is not a finite number`))
  if (p.length) return p

  // ---- spend side
  if (b.spentToDate < 0) p.push(tag(`spentToDate is negative (${b.spentToDate})`))
  if (b.estimatedSpentToDate + 0.01 < b.spentToDate)
    p.push(tag(`estimatedSpentToDate ${b.estimatedSpentToDate} is below invoices in hand ${b.spentToDate}`))
  if (!near(b.estimatedUninvoiced, b.estimatedSpentToDate - b.spentToDate))
    p.push(tag(`estimatedUninvoiced ${b.estimatedUninvoiced} ≠ estimatedSpentToDate − spentToDate`))
  if (b.budget == null) {
    if (b.leftToSpend != null) p.push(tag(`leftToSpend set with no budget`))
    if (b.paceStatus !== "no-forecast") p.push(tag(`paceStatus ${b.paceStatus} with no budget`))
  } else {
    if (b.forecastRevenue == null) p.push(tag(`budget set with no forecast`))
    else if (!near(b.budget, (b.forecastRevenue * Number(b.targetPct)) / 100))
      p.push(tag(`budget ${b.budget} ≠ forecast ${b.forecastRevenue} × ${b.targetPct}%`))
    if (b.leftToSpend == null) p.push(tag(`leftToSpend missing although budget is set`))
    else if (!near(b.leftToSpend + b.estimatedSpentToDate, b.budget))
      p.push(tag(`leftToSpend ${b.leftToSpend} + used ${b.estimatedSpentToDate} ≠ budget ${b.budget}`))
    if (b.paceStatus === "no-forecast") p.push(tag(`paceStatus no-forecast although budget is set`))
  }
  if (b.projectedEndOfWeek + 0.01 < b.spentToDate)
    p.push(tag(`projectedEndOfWeek ${b.projectedEndOfWeek} is below spentToDate ${b.spentToDate}`))

  // ---- revenue side
  const reported = b.revenueDaily.filter((d) => d.reported)
  const sumReported = reported.reduce((s, d) => s + d.amount, 0)
  if (reported.length !== b.revenueDaysReported)
    p.push(tag(`revenueDaysReported ${b.revenueDaysReported} ≠ ${reported.length} reported day cells`))
  if (b.revenueToDateExGst == null) {
    if (reported.length > 0) p.push(tag(`revenueToDateExGst null with ${reported.length} reported days`))
    if (b.projectedRevenueExGst != null) p.push(tag(`projectedRevenueExGst set with no takings`))
  } else {
    if (!near(b.revenueToDateExGst, sumReported))
      p.push(tag(`revenueToDateExGst ${b.revenueToDateExGst} ≠ sum of reported days ${Math.round(sumReported)}`))
    if (b.projectedRevenueExGst != null && b.projectedRevenueExGst + 0.01 < b.revenueToDateExGst)
      p.push(tag(`projectedRevenueExGst ${b.projectedRevenueExGst} is below takings to date`))
    if (b.lastRevenueDate == null) p.push(tag(`lastRevenueDate missing although takings exist`))
    const todayCell = b.revenueDaily.find((d) => d.date === todayAest)
    if (todayCell?.reported && todayCell.soFar != null)
      p.push(tag(`today is both reported and "so far" (${todayAest})`))
  }
  for (const d of b.revenueDaily) {
    if (d.reported && d.suspect) p.push(tag(`${d.date} is reported yet flagged suspect`))
  }
  return p
}
