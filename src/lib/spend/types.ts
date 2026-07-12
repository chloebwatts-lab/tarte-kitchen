/**
 * Shared types + non-async constants for the live spend tracker.
 * Kept separate from `current-week.ts` because Next.js requires
 * "use server" files to export only async functions.
 */

import { Venue } from "@/generated/prisma"

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
  /// Lightspeed EOD revenue ex GST for this day (0 until the report lands)
  amount: number
  cumulative: number
  /// True once at least one venue in the bucket has an EOD report for the day
  reported: boolean
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
  /// spentToDate + (estimatedMissingSpend × elapsed fraction)
  effectiveSpent: number
  /// Per-supplier composition of estimatedMissingSpend
  missingSpendBreakdown: MissingSpendRow[]
  targetPct: number
  budget: number | null
  remaining: number | null
  /// Full-week spend projection + estimatedMissingSpend. "weighted"
  /// divides spent-to-date by the elapsed weekdays' historical share of
  /// a week's deliveries (8-wk profile); "flat" is spent ÷ days × 7.
  projectedEndOfWeek: number
  spendProjectionMethod: "weighted" | "flat"
  /// How projectedRevenueExGst was derived (null = no revenue yet)
  revenueProjectionMethod: "weighted" | "flat" | null
  /// projectedEndOfWeek vs budget
  paceStatus: "on-track" | "watch" | "over" | "no-forecast"
  invoiceCount: number
  daily: DailySpendCell[]
  suppliers: SupplierSpendCell[]

  // ---- Live revenue (Lightspeed EOD email imports, ex GST) ----
  /// Sum of DailySalesSummary.totalRevenueExGst for days reported so far.
  /// Null when no EOD report has landed yet this week. NB: Lightspeed
  /// misses online/event sales, so true revenue reads slightly higher.
  revenueToDateExGst: number | null
  /// Number of trading days with an EOD report in (0-7)
  revenueDaysReported: number
  /// AEST date of the most recent EOD report this week
  lastRevenueDate: string | null
  /// revenueToDateExGst ÷ revenueDaysReported × 7
  projectedRevenueExGst: number | null
  revenueDaily: DailyRevenueCell[]
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
