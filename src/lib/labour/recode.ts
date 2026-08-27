/**
 * Weekly department recode from Deputy worked areas.
 *
 * Louise's per-department wage splits code people by home profile, not by
 * where they actually worked (verified w/e 4, 18 and 25 Aug 2026), which
 * over-states FOH and under-states the kitchen at Burleigh every week. The
 * Friday digest grades bucket targets, so it recodes the splits bottom-up
 * from LabourShift timesheets (synced from Deputy) before grading:
 *
 *   1. Price every timesheet: Deputy cost where present; staff on the
 *      KNOWN_WEEKLY list have their fixed weekly gross spread across the
 *      areas they worked (their Deputy cost is 0); anyone else without a
 *      cost is estimated at the venue+bucket average hourly rate.
 *   2. Salaried staff with no timesheets that week still get their full
 *      weekly gross in their home bucket (paid regardless).
 *   3. Each venue is scaled so the buckets sum exactly to Louise's
 *      verified venue total (less admin), so the cash never drifts from
 *      the bookkeeper's numbers, only the split does.
 *
 * Cross-venue salary: one BOH salary is paid through Beach House but the
 * role works in the Burleigh kitchen. Standing internal correction
 * (reporting only, never payroll): the weekly gross+super moves from the
 * Beach House total to Burleigh, and the gross lands in Burleigh chefsKp.
 */
import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma/enums"
import { bucketFor, type Bucket } from "./buckets"

/** Weekly gross+super moved Beach House -> Burleigh (reporting only). */
export const CROSS_VENUE_WEEKLY_TOTAL = 1400.0
/** Gross portion of the above, appended to Burleigh chefsKp pre-scale. */
const CROSS_VENUE_WEEKLY_GROSS = 1250.0

interface KnownWeekly {
  match: RegExp
  weekly: number // gross ex super; venue scaling absorbs super
  homeVenue: Venue
  homeBucket: Bucket
  /** true = salaried: include full weekly even with no timesheets */
  salaried: boolean
}

// Sources: Deputy pay-week audits + Louise's Wages 4.8.2026 xlsx. Update
// when salaries change; a stale figure only drifts the split, not the cash
// (venue totals are always Louise's).
const KNOWN_WEEKLY: KnownWeekly[] = [
  // Burleigh salaried
  { match: /^georgia farquhar/i, weekly: 1471.15, homeVenue: Venue.BURLEIGH, homeBucket: "fohBarista", salaried: true },
  { match: /^oliver warren/i, weekly: 1692.31, homeVenue: Venue.BURLEIGH, homeBucket: "fohBarista", salaried: true },
  { match: /^savannah hjorth/i, weekly: 1288.46, homeVenue: Venue.BURLEIGH, homeBucket: "fohBarista", salaried: true },
  { match: /^vinicius/i, weekly: 1538.46, homeVenue: Venue.BURLEIGH, homeBucket: "chefsKp", salaried: true },
  { match: /^tais mansur/i, weekly: 1407.88, homeVenue: Venue.BURLEIGH, homeBucket: "chefsKp", salaried: true },
  { match: /^jess(ica)? passos/i, weekly: 1576.92, homeVenue: Venue.BURLEIGH, homeBucket: "pastry", salaried: true },
  { match: /^beatriz maciel/i, weekly: 1250.0, homeVenue: Venue.BURLEIGH, homeBucket: "pastry", salaried: true },
  { match: /^eden lord/i, weekly: 769.23, homeVenue: Venue.BURLEIGH, homeBucket: "pastry", salaried: true },
  { match: /^yung chi chang/i, weekly: 1096.15, homeVenue: Venue.BURLEIGH, homeBucket: "fohBarista", salaried: true },
  // Beach House full-timers with no Deputy rates (fixed weekly, hourly on
  // paper: only counted when they actually have timesheets that week)
  { match: /^baily roberts/i, weekly: 1192.31, homeVenue: Venue.BEACH_HOUSE, homeBucket: "fohBarista", salaried: false },
  { match: /^carmen taylor/i, weekly: 1317.31, homeVenue: Venue.BEACH_HOUSE, homeBucket: "fohBarista", salaried: false },
  { match: /^chloe johns/i, weekly: 1317.3, homeVenue: Venue.BEACH_HOUSE, homeBucket: "fohBarista", salaried: false },
  { match: /^georgia rodney/i, weekly: 1317.31, homeVenue: Venue.BEACH_HOUSE, homeBucket: "fohBarista", salaried: false },
  { match: /^debbie embalsado/i, weekly: 1134.62, homeVenue: Venue.BEACH_HOUSE, homeBucket: "pastry", salaried: false },
  { match: /^michelle$|^michelle malbog/i, weekly: 1096.15, homeVenue: Venue.BEACH_HOUSE, homeBucket: "chefsKp", salaried: false },
  { match: /^hannah summers/i, weekly: 1400.0, homeVenue: Venue.TEA_GARDEN, homeBucket: "fohBarista", salaried: false },
]

export interface VenueRecode {
  /** Scaled bucket dollars; sums to Louise total less admin (+/- cross-venue). */
  buckets: Record<Bucket, number>
  /** Louise's venue total incl admin, +/- the cross-venue correction. */
  adjustedGrossWages: number
  /** Dollars (pre-scale) priced at estimated average rates, for the caveat. */
  estimatedDollars: number
  timesheetCount: number
}

const EMPTY_BUCKETS = (): Record<Bucket, number> => ({
  chefsKp: 0,
  fohBarista: 0,
  pastry: 0,
  other: 0,
})

/**
 * Rebuild bucket splits for the labour week starting at weekStartWed
 * (UTC-midnight date, matching LabourWeekActual). Returns null when the
 * timesheet coverage looks too thin to trust (digest then falls back to
 * Louise's splits).
 */
export async function recodeLabourWeek(
  weekStartWed: Date
): Promise<Partial<Record<Venue, VenueRecode>> | null> {
  // Wed 00:00 AEST = Tue 14:00 UTC the day before the stored UTC date.
  const windowStart = new Date(weekStartWed.getTime() - 10 * 3600 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 7 * 86400 * 1000)

  const [shifts, actuals] = await Promise.all([
    db.labourShift.findMany({
      where: {
        source: "TIMESHEET",
        shiftStart: { gte: windowStart, lt: windowEnd },
      },
      select: {
        employeeName: true,
        venue: true,
        area: true,
        hours: true,
        cost: true,
      },
    }),
    db.labourWeekActual.findMany({ where: { weekStartWed } }),
  ])
  if (shifts.length < 100) return null // sync gap; don't pretend

  type Cell = { venue: Venue; bucket: Bucket; hours: number; dollars: number | null }
  const cells: Cell[] = []
  const byPerson = new Map<string, Cell[]>()
  for (const s of shifts) {
    const cell: Cell = {
      venue: s.venue,
      bucket: bucketFor(s.venue, s.area),
      hours: Number(s.hours),
      dollars: Number(s.cost) > 0 ? Number(s.cost) : null,
    }
    cells.push(cell)
    const list = byPerson.get(s.employeeName) ?? []
    list.push(cell)
    byPerson.set(s.employeeName, list)
  }

  // Fixed-weekly staff: spread weekly gross across worked areas by hours,
  // or append to home bucket when salaried with no timesheets.
  for (const k of KNOWN_WEEKLY) {
    const owned: Cell[] = []
    for (const [name, list] of byPerson) if (k.match.test(name.trim())) owned.push(...list)
    const totalHours = owned.reduce((s, c) => s + c.hours, 0)
    if (totalHours > 0) {
      for (const c of owned) c.dollars = (k.weekly * c.hours) / totalHours
    } else if (k.salaried) {
      cells.push({ venue: k.homeVenue, bucket: k.homeBucket, hours: 0, dollars: k.weekly })
    }
  }

  // Cross-venue BOH salary: gross into Burleigh chefsKp (no timesheets).
  cells.push({
    venue: Venue.BURLEIGH,
    bucket: "chefsKp",
    hours: 0,
    dollars: CROSS_VENUE_WEEKLY_GROSS,
  })

  // Estimate leftovers at the venue+bucket average hourly rate.
  const pool = new Map<string, { dollars: number; hours: number }>()
  for (const c of cells) {
    if (c.dollars != null && c.hours > 0) {
      const key = `${c.venue}/${c.bucket}`
      const p = pool.get(key) ?? { dollars: 0, hours: 0 }
      p.dollars += c.dollars
      p.hours += c.hours
      pool.set(key, p)
    }
  }
  const estimated = new Map<Venue, number>()
  for (const c of cells) {
    if (c.dollars == null) {
      const p = pool.get(`${c.venue}/${c.bucket}`)
      const rate = p && p.hours > 0 ? p.dollars / p.hours : 30
      c.dollars = rate * c.hours
      estimated.set(c.venue, (estimated.get(c.venue) ?? 0) + c.dollars)
    }
  }

  const out: Partial<Record<Venue, VenueRecode>> = {}
  for (const venue of [Venue.BURLEIGH, Venue.BEACH_HOUSE, Venue.TEA_GARDEN]) {
    const actual = actuals.find((a) => a.venue === venue)
    if (!actual) continue
    const raw = EMPTY_BUCKETS()
    let venueSum = 0
    let count = 0
    for (const c of cells) {
      if (c.venue !== venue) continue
      raw[c.bucket] += c.dollars ?? 0
      venueSum += c.dollars ?? 0
      if (c.hours > 0) count++
    }
    if (venueSum <= 0) continue

    const crossVenue =
      venue === Venue.BURLEIGH
        ? CROSS_VENUE_WEEKLY_TOTAL
        : venue === Venue.BEACH_HOUSE
          ? -CROSS_VENUE_WEEKLY_TOTAL
          : 0
    const adjustedGrossWages = Number(actual.grossWages) + crossVenue
    const admin = actual.wagesAdmin != null ? Number(actual.wagesAdmin) : 0
    const scale = (adjustedGrossWages - admin) / venueSum

    const buckets = EMPTY_BUCKETS()
    for (const b of Object.keys(buckets) as Bucket[]) buckets[b] = raw[b] * scale
    out[venue] = {
      buckets,
      adjustedGrossWages,
      estimatedDollars: estimated.get(venue) ?? 0,
      timesheetCount: count,
    }
  }
  return Object.keys(out).length ? out : null
}
