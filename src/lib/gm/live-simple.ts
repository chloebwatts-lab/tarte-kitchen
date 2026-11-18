/**
 * Oliver's live wages + COGS (Chloe, 18 Nov 2026: "a consistent up to date
 * live wage and cogs button, don't overcomplicate"). A thin, percent-only
 * read of the SAME engines as Chloe's Wages + COGS page
 * (/kitchen/managers/numbers): getLiveLabourSnapshot and getCurrentWeekSpend.
 * The headline numbers are the same fields that page shows big, so the two
 * always agree. No dollars, no day tables.
 */

import type { LiveSnapshot, LiveVenueSnapshot } from "@/lib/labour/live"
import type { BucketSpendData } from "@/lib/spend/types"

export type Tone = "ok" | "amber" | "red" | "none"

export interface SimpleWage {
  venue: string
  label: string
  /** Wage % for the week, forecast (paid leave out): Chloe's big number. */
  pct: number | null
  /** Finished days only (Wed to yesterday), actual. Null on a Wednesday. */
  lockedPct: number | null
  lockedDays: number
  depts: { label: string; pct: number | null; band: string; tone: Tone }[]
}

export interface SimpleCogs {
  label: string
  /** COGS % for the week, forecast: Chloe's big number. */
  pct: number | null
  targetPct: number
  tone: Tone
  status: string
}

export interface GmLiveSite {
  key: "BURLEIGH" | "CURRUMBIN"
  label: string
  wages: SimpleWage[]
  cogs: SimpleCogs | null
}

export interface GmLiveSimple {
  weekLabel: string
  sites: GmLiveSite[]
}

const SITES = [
  { key: "BURLEIGH", label: "Burleigh", wageVenues: ["BURLEIGH"], cogsBucket: "BURLEIGH" },
  { key: "CURRUMBIN", label: "Currumbin", wageVenues: ["BEACH_HOUSE", "TEA_GARDEN"], cogsBucket: "CURRUMBIN" },
] as const

const r1 = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10)

function toneOf(s: string): Tone {
  return s === "ok" ? "ok" : s === "amber" ? "amber" : s === "red" ? "red" : "none"
}

export function simpleWage(v: LiveVenueSnapshot): SimpleWage {
  return {
    venue: v.venue,
    label: v.label,
    pct: r1(v.workingProjectedPct),
    lockedPct: v.locked.days > 0 ? r1(v.locked.workingPct) : null,
    lockedDays: v.locked.days,
    depts: v.buckets.map((b) => ({
      label: b.label,
      pct: r1(b.workingPct),
      band: b.target ? `${b.target.min} to ${b.target.max}%` : "",
      tone: toneOf(b.workingStatus),
    })),
  }
}

export function simpleCogs(b: BucketSpendData): SimpleCogs {
  const pct = b.projectedRevenueExGst && b.projectedRevenueExGst > 0 ? (b.projectedEndOfWeek / b.projectedRevenueExGst) * 100 : null
  const tone: Tone = b.paceStatus === "on-track" ? "ok" : b.paceStatus === "watch" ? "amber" : b.paceStatus === "over" ? "red" : "none"
  const status = b.paceStatus === "on-track" ? "On track" : b.paceStatus === "watch" ? "Watch" : b.paceStatus === "over" ? "Over" : "No forecast yet"
  return { label: b.label, pct: r1(pct), targetPct: b.targetPct, tone, status }
}

export function buildGmLiveSimple(labour: Pick<LiveSnapshot, "weekLabel" | "venues">, spend: { buckets: BucketSpendData[] }): GmLiveSimple {
  return {
    weekLabel: labour.weekLabel,
    sites: SITES.map((s) => {
      const bucket = spend.buckets.find((b) => b.bucket === s.cogsBucket)
      return {
        key: s.key,
        label: s.label,
        wages: (s.wageVenues as readonly string[]).flatMap((venue) => {
          const v = labour.venues.find((x) => x.venue === venue)
          return v ? [simpleWage(v)] : []
        }),
        cogs: bucket ? simpleCogs(bucket) : null,
      }
    }),
  }
}
