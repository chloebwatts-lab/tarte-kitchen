"use server"

import { db } from "@/lib/db"
import { SINGLE_VENUES, type SingleVenue } from "@/lib/venues"

export type SensitivityScope = SingleVenue | "ALL"

export interface ScopeDefaults {
  scope: SensitivityScope
  /** Annualised revenue ex GST, dollars. */
  annualRevenue: number
  /** Annualised total COGS, dollars. */
  annualCogs: number
  /** Weeks of real data the annualisation is based on (0 = fallback). */
  weeksOfData: number
  /** ISO date of the most recent week included, if any. */
  latestWeek: string | null
}

export interface ProfitSensitivityDefaults {
  scopes: ScopeDefaults[]
  /** Where the numbers came from, for the UI caption. */
  source: "weekly-cogs" | "xero-fallback"
}

/**
 * FY26 (Jul 2025 – Jun 2026) actuals from the Tarte Currumbin Xero
 * P&L, used only when no WeeklyCogs uploads exist (fresh install /
 * local dev). Revenue is total income, COGS is total cost of sales,
 * both ex GST. Update alongside the annual accounts if still in use.
 */
const XERO_FY26_FALLBACK = { revenue: 5_617_645, cogs: 1_960_869 }

/**
 * Annualised revenue + COGS per venue (and combined) from the weekly
 * COGS uploads, for pre-filling the price sensitivity calculator.
 * Only weeks where BOTH revenue and COGS landed are counted, so the
 * implied GP% is internally consistent; the totals are then scaled
 * to 52 weeks.
 */
export async function getProfitSensitivityDefaults(): Promise<ProfitSensitivityDefaults> {
  const earliest = new Date()
  earliest.setUTCDate(earliest.getUTCDate() - 7 * 53)

  let rows: {
    venue: string
    weekStartWed: Date
    revenueExGst: unknown
    totalCogs: unknown
  }[] = []
  try {
    rows = await db.weeklyCogs.findMany({
      where: { weekStartWed: { gte: earliest } },
      orderBy: { weekStartWed: "asc" },
    })
  } catch {
    rows = []
  }

  const perVenue = new Map<
    SingleVenue,
    { revenue: number; cogs: number; weeks: number; latest: string | null }
  >()
  for (const v of SINGLE_VENUES) {
    perVenue.set(v, { revenue: 0, cogs: 0, weeks: 0, latest: null })
  }

  for (const r of rows) {
    const revenue = r.revenueExGst != null ? Number(r.revenueExGst) : null
    const cogs = r.totalCogs != null ? Number(r.totalCogs) : null
    if (revenue == null || cogs == null || revenue <= 0) continue
    const agg = perVenue.get(r.venue as SingleVenue)
    if (!agg) continue
    agg.revenue += revenue
    agg.cogs += cogs
    agg.weeks += 1
    const iso = r.weekStartWed.toISOString().slice(0, 10)
    if (agg.latest === null || iso > agg.latest) agg.latest = iso
  }

  const venueScopes: ScopeDefaults[] = SINGLE_VENUES.flatMap((venue) => {
    const agg = perVenue.get(venue)!
    if (agg.weeks === 0) return []
    const scale = 52 / agg.weeks
    return [
      {
        scope: venue,
        annualRevenue: Math.round(agg.revenue * scale),
        annualCogs: Math.round(agg.cogs * scale),
        weeksOfData: agg.weeks,
        latestWeek: agg.latest,
      },
    ]
  })

  if (venueScopes.length === 0) {
    return {
      scopes: [
        {
          scope: "ALL",
          annualRevenue: XERO_FY26_FALLBACK.revenue,
          annualCogs: XERO_FY26_FALLBACK.cogs,
          weeksOfData: 0,
          latestWeek: null,
        },
      ],
      source: "xero-fallback",
    }
  }

  const all: ScopeDefaults = {
    scope: "ALL",
    annualRevenue: venueScopes.reduce((s, v) => s + v.annualRevenue, 0),
    annualCogs: venueScopes.reduce((s, v) => s + v.annualCogs, 0),
    weeksOfData: Math.max(...venueScopes.map((v) => v.weeksOfData)),
    latestWeek: venueScopes.reduce<string | null>(
      (latest, v) =>
        latest === null || (v.latestWeek !== null && v.latestWeek > latest)
          ? v.latestWeek
          : latest,
      null
    ),
  }

  return { scopes: [all, ...venueScopes], source: "weekly-cogs" }
}
