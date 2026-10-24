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
 *    figure never reaches staff as if it were right. Since 23 Oct 2026 that
 *    includes the headline: left = budget − spent so far − the usual
 *    deliveries still to come, the still-to-come list adds up to its total,
 *    and the pace projection adds exactly the same deliveries. Since 25 Oct
 *    2026 the overdue gap (overdue-gap.ts) is a fourth term on both sides:
 *    left + used + still to come + overdue = budget and pace = used + still
 *    to come + overdue, so a supplier whose invoices stopped is counted once
 *    in each, never ignored by one and doubled by the other.
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
    ["usualStillToCome", b.usualStillToCome],
    ["overdueGap", b.overdueGap],
    ["leftToSpend", b.leftToSpend],
    ["leftBeforeStillToCome", b.leftBeforeStillToCome],
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

  // ---- still to come: never negative, the list adds up to the total
  if (b.usualStillToCome < 0) p.push(tag(`usualStillToCome is negative (${b.usualStillToCome})`))
  if (b.stillToCome.length > 0) {
    const sum = b.stillToCome.reduce((s, r) => s + r.amount, 0)
    if (!near(sum, b.usualStillToCome, 0.5))
      p.push(tag(`still-to-come rows add to ${Math.round(sum)}, not usualStillToCome ${Math.round(b.usualStillToCome)}`))
    for (const r of b.stillToCome)
      if (!Number.isFinite(r.amount) || r.amount <= 0) p.push(tag(`still-to-come row ${r.supplier} is ${r.amount}`))
  }

  // ---- overdue: never negative, the list adds up to the total, and those
  // days are not also still to come
  if (b.overdueGap < 0) p.push(tag(`overdueGap is negative (${b.overdueGap})`))
  {
    const sum = b.overdueGapRows.reduce((s, r) => s + r.amount, 0)
    if (!near(sum, b.overdueGap, 0.5))
      p.push(tag(`overdue rows add to ${Math.round(sum)}, not overdueGap ${Math.round(b.overdueGap)}`))
    for (const r of b.overdueGapRows) {
      if (!Number.isFinite(r.amount) || r.amount <= 0) p.push(tag(`overdue row ${r.supplier} is ${r.amount}`))
      const toCome = b.stillToCome.find((x) => x.supplier === r.supplier)
      const both = toCome ? r.days.filter((d) => toCome.days.includes(d)) : []
      if (both.length) p.push(tag(`${r.supplier} ${both.join("/")} is both overdue and still to come`))
    }
  }

  // ---- the headline and its secondary line
  if (b.budget == null) {
    if (b.leftToSpend != null) p.push(tag(`leftToSpend set with no budget`))
    if (b.leftBeforeStillToCome != null) p.push(tag(`leftBeforeStillToCome set with no budget`))
    if (b.paceStatus !== "no-forecast") p.push(tag(`paceStatus ${b.paceStatus} with no budget`))
  } else {
    if (b.forecastRevenue == null) p.push(tag(`budget set with no forecast`))
    else if (!near(b.budget, (b.forecastRevenue * Number(b.targetPct)) / 100))
      p.push(tag(`budget ${b.budget} ≠ forecast ${b.forecastRevenue} × ${b.targetPct}%`))
    if (b.leftToSpend == null) p.push(tag(`leftToSpend missing although budget is set`))
    else if (!near(b.leftToSpend + b.estimatedSpentToDate + b.usualStillToCome + b.overdueGap, b.budget))
      p.push(
        tag(
          `leftToSpend ${b.leftToSpend} + used ${b.estimatedSpentToDate} + still to come ${b.usualStillToCome} + overdue ${b.overdueGap} ≠ budget ${b.budget}`
        )
      )
    if (b.leftBeforeStillToCome == null) p.push(tag(`leftBeforeStillToCome missing although budget is set`))
    else if (!near(b.leftBeforeStillToCome + b.estimatedSpentToDate + b.overdueGap, b.budget))
      p.push(
        tag(`leftBeforeStillToCome ${b.leftBeforeStillToCome} + used ${b.estimatedSpentToDate} + overdue ${b.overdueGap} ≠ budget ${b.budget}`)
      )
    if (b.paceStatus === "no-forecast") p.push(tag(`paceStatus no-forecast although budget is set`))
  }
  if (b.projectedEndOfWeek + 0.01 < b.estimatedSpentToDate)
    p.push(tag(`projectedEndOfWeek ${b.projectedEndOfWeek} is below spend to date ${b.estimatedSpentToDate}`))
  // The pace adds the same deliveries the headline takes off
  if (!near(b.projectedEndOfWeek, b.estimatedSpentToDate + b.usualStillToCome + b.overdueGap))
    p.push(
      tag(
        `projectedEndOfWeek ${b.projectedEndOfWeek} ≠ used ${b.estimatedSpentToDate} + still to come ${b.usualStillToCome} + overdue ${b.overdueGap}`
      )
    )

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
