/**
 * Shared types + non-async constants for the live spend tracker.
 * Kept separate from `current-week.ts` because Next.js requires
 * "use server" files to export only async functions.
 */

import { Venue } from "@/generated/prisma/client"
import type { StillToComeRow } from "./still-to-come"

export type { StillToComeRow }

// Two reporting buckets: Burleigh (its own venue) and Currumbin
// (BEACH_HOUSE + TEA_GARDEN combined for COGS).
export type SpendBucket = "BURLEIGH" | "CURRUMBIN"

export const SPEND_BUCKETS: SpendBucket[] = ["BURLEIGH", "CURRUMBIN"]

export const SPEND_BUCKET_LABEL: Record<SpendBucket, string> = {
  BURLEIGH: "Burleigh",
  CURRUMBIN: "Currumbin (Beach House + Tea Garden)",
}

export function venueToBucket(v: Venue | null): SpendBucket | null {
  if (v === "BURLEIGH") return "BURLEIGH"
  if (v === "BEACH_HOUSE" || v === "TEA_GARDEN") return "CURRUMBIN"
  return null
}

export interface DailySpendCell {
  /// AEST yyyy-mm-dd
  date: string
  /// AEST day-of-week name (Wed/Thu/.../Tue)
  dayName: string
  amount: number
  cumulative: number
  invoiceCount: number
}

export interface DailyRevenueCell {
  /// AEST yyyy-mm-dd
  date: string
  dayName: string
  /// POS revenue ex GST for this completed day (0 until the figure lands)
  amount: number
  cumulative: number
  /// True once at least one venue in the bucket has a final figure for the day
  reported: boolean
  /// Today only: intraday takings so far (Square sync), not in amount/cumulative
  soFar?: number
  /// A completed day whose figure looks partial (well under the weekday's
  /// 8-week average). Shown, never counted in the pace. See guards.ts.
  suspect?: boolean
}

/// One supplier's contribution to estimatedMissingSpend, so the amber
/// box can show WHO is missing instead of just a lump sum.
export interface MissingSpendRow {
  supplier: string
  estWeekly: number
  lastSeen: string | null
  daysSinceLast: number | null
}

export interface SupplierSpendCell {
  supplier: string
  amount: number
  invoiceCount: number
  /// Average $/wk over the last 4 weeks at this venue, for context.
  fourWeekAvg: number | null
}

export interface CoverageRow {
  canonicalName: string
  category: string
  critical: boolean
  note?: string
  /// Latest invoice received (any venue, any time)
  lastInvoiceDate: string | null
  /// Days since last invoice
  daysSinceLast: number | null
  /// Days expected between invoices
  expectedIntervalDays: number
  /// "ok" | "due-soon" | "overdue" | "missing"
  status: "ok" | "due-soon" | "overdue" | "missing"
  /// Estimated weekly spend (for the small ones we can pad into the
  /// budget when invoices haven't arrived yet). Derived from the last
  /// 8 weeks of COGS xlsx data if we have it, else null.
  estimatedWeeklySpend: number | null
}

export interface UnassignedInvoice {
  id: string
  supplierName: string
  invoiceDate: string | null
  total: number | null
  invoiceNumber: string | null
}

export interface BucketSpendData {
  bucket: SpendBucket
  label: string
  spentToDate: number
  forecastRevenue: number | null
  /// Estimated $ to add for known suppliers whose invoices haven't
  /// arrived (Joval/Paramount/etc). Sum of their estimatedWeeklySpend.
  estimatedMissingSpend: number
  /// Per-supplier composition of estimatedMissingSpend
  missingSpendBreakdown: MissingSpendRow[]
  targetPct: number
  budget: number | null
  /// Spent so far: spentToDate plus the deliveries of the days before today
  /// that are normally not invoiced yet at this point in the week (8-wk
  /// arrival-lag profile). Today's invoices count as they are.
  estimatedSpentToDate: number
  /// estimatedSpentToDate minus spentToDate: delivered, not invoiced yet
  estimatedUninvoiced: number
  /// The deliveries that usually still land before Tuesday close (ex GST):
  /// each supplier's 8-wk usual for the rest of today (if it has not
  /// invoiced for today yet) and the days after, at this week's trade.
  /// Sum of stillToCome when there is supplier history.
  usualStillToCome: number
  /// Who usually still delivers, biggest first (still-to-come.ts). Empty
  /// when the history is too thin for a supplier pattern.
  stillToCome: StillToComeRow[]
  /// budget minus estimatedSpentToDate minus usualStillToCome: what can
  /// still be ordered once the usual deliveries land. THE "left to spend"
  /// figure, everywhere: the /spend page, the Sunday email, the Friday
  /// digest and Shifts' owner note all lead with this (checkSpendSnapshot
  /// in guards.ts enforces the sum).
  leftToSpend: number | null
  /// budget minus estimatedSpentToDate: left before the usual deliveries
  /// still to come. Printed only as the secondary line under leftToSpend.
  leftBeforeStillToCome: number | null
  /// Full-week spend projection: estimatedSpentToDate + usualStillToCome +
  /// estimatedMissingSpend, so it always agrees with leftToSpend. Method
  /// "usual" when the supplier pattern is there. Fallbacks for thin
  /// history: "weighted" divides by the days through today's share of a
  /// week's deliveries; "flat" is spent ÷ days × 7.
  projectedEndOfWeek: number
  spendProjectionMethod: "usual" | "weighted" | "flat"
  /// How projectedRevenueExGst was derived (null = no revenue yet):
  /// "forecast" / "usual" = takings so far + that week's share for the
  /// days to come; "weighted" / "flat" scale takings so far up
  revenueProjectionMethod: "forecast" | "usual" | "weighted" | "flat" | null
  /// projectedEndOfWeek vs budget
  paceStatus: "on-track" | "watch" | "over" | "no-forecast"
  invoiceCount: number
  daily: DailySpendCell[]
  suppliers: SupplierSpendCell[]

  // ---- Live revenue (POS end-of-day figures, ex GST) ----
  /// Sum of DailySalesSummary.totalRevenueExGst for completed days that
  /// passed the suspect-day guard. Null when none yet this week. NB: POS
  /// misses online/event sales, so true revenue reads slightly higher.
  revenueToDateExGst: number | null
  /// Number of completed trading days counted (0-7)
  revenueDaysReported: number
  /// AEST date of the most recent counted day this week
  lastRevenueDate: string | null
  /// Full-week takings: so far plus the forecast for the days to come
  projectedRevenueExGst: number | null
  revenueDaily: DailyRevenueCell[]
  /// Today's intraday takings ex GST (Square), shown as "so far" and kept
  /// out of revenueToDateExGst and the pace. Null when none yet.
  todaySoFarExGst: number | null
  /// Plain-language caveats on the revenue side (suspect days left out of
  /// the pace). Printed under the takings wherever the bucket is shown.
  revenueNotes: string[]
}

export interface CurrentWeekSpendSnapshot {
  weekStartWed: string
  weekEndTue: string
  /// AEST today yyyy-mm-dd
  todayAest: string
  /// 1-7, where 1 = Wed (first day of trading week)
  dayOfWeek: number
  daysElapsedFull: number
  buckets: BucketSpendData[]
  coverage: CoverageRow[]
  unassigned: UnassignedInvoice[]
}
