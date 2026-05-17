/**
 * Friday weekly digest aggregator. Builds the structured snapshot that
 * gets handed to Claude for narrative synthesis.
 *
 * The whole digest is anchored to Tarte's trading week (Wed → Tue) via
 * `lastCompletedTarteWeek()` — by Friday 08:00 AEST the freshest closed
 * week is the Wed → Tue that ended on Tuesday, which is also the
 * payroll cycle Chloe's labour PDF covers.
 *
 * Per the dept-wage-targets memory we group raw wage fields into
 * combined buckets when comparing to band targets — never show Chef
 * vs KP separately when the target is the pair, and fold wagesBarista
 * into FOH for Beach House.
 */

import { db } from "@/lib/db"
import { Venue, ReviewSentiment } from "@/generated/prisma/enums"
import { lastCompletedTarteWeek } from "@/lib/dates"

const SINGLE_VENUES: Venue[] = [
  Venue.BURLEIGH,
  Venue.BEACH_HOUSE,
  Venue.TEA_GARDEN,
]

const VENUE_LABEL: Record<Venue, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
  BOTH: "All",
}

// Department-wage targets (per tarte_dept_wage_targets.md).
const WAGE_TARGETS: Record<
  "BURLEIGH" | "BEACH_HOUSE",
  Record<string, { min: number; max: number; label: string }>
> = {
  BURLEIGH: {
    chefsKp: { min: 11.5, max: 12.0, label: "Chefs + KP" },
    fohBarista: { min: 20.5, max: 21.0, label: "FOH + Barista" },
    pastry: { min: 4.75, max: 5.25, label: "Pastry" },
  },
  BEACH_HOUSE: {
    chefsKp: { min: 12.5, max: 13.5, label: "Chefs + KP" },
    foh: { min: 21.5, max: 22.5, label: "FOH (incl. Barista)" },
    pastry: { min: 2.5, max: 3.0, label: "Pastry" },
  },
}

export interface WeeklyDigestSnapshot {
  weekStart: string // YYYY-MM-DD AEST
  weekEnd: string // YYYY-MM-DD AEST
  labourWeekStart: string | null
  labourWeekEnd: string | null

  reviews: ReviewsSection
  priceSpikes: PriceSpikesSection
  wastage: WastageSection
  cogs: CogsSection
  labour: LabourSection
  topSellers: TopSellersSection
  sales: SalesSection
  operations: OperationsSection
  /// Pacing snapshot for the CURRENT (in-flight) trading week — what
  /// the kitchen has spent on invoices so far this week and what's
  /// left in the cap. Distinct from `cogs` (which is the just-closed
  /// week's xlsx-sourced actuals).
  spendPacing: SpendPacingSection
}

interface SpendPacingSection {
  weekStartWed: string
  weekEndTue: string
  dayOfWeek: number
  daysElapsedFull: number
  buckets: Array<{
    bucket: "BURLEIGH" | "CURRUMBIN"
    label: string
    forecastRevenue: number | null
    targetPct: number
    budget: number | null
    spentToDate: number
    estimatedMissingSpend: number
    projectedEndOfWeek: number
    remaining: number | null
    paceStatus: "on-track" | "watch" | "over" | "no-forecast"
  }>
  coverageProblems: Array<{
    canonicalName: string
    status: "overdue" | "missing"
    daysSinceLast: number | null
    expectedIntervalDays: number
    note?: string
  }>
}

interface ReviewsSection {
  totalCount: number
  averageRating: number | null
  perVenue: Array<{
    venue: string
    count: number
    averageThisWeek: number | null
    aggregateRating: number | null
    aggregateTotalRatings: number | null
    sentimentBreakdown: Record<string, number>
    topThemes: string[]
    staffMentioned: string[]
    notable: Array<{
      rating: number
      sentiment: string | null
      author: string | null
      summary: string | null
      text: string | null
    }>
  }>
  overallNegatives: Array<{
    venue: string
    rating: number
    author: string | null
    summary: string | null
    text: string | null
  }>
}

interface PriceSpikesSection {
  count: number
  items: Array<{
    ingredient: string
    supplier: string | null
    oldPrice: number
    newPrice: number
    changePct: number
    changedAt: string
  }>
}

interface WastageSection {
  totalDollarsThisWeek: number
  totalDollarsLastWeek: number
  wowChangePct: number | null
  perVenue: Array<{ venue: string; total: number }>
  topItems: Array<{
    name: string
    venue: string
    occurrences: number
    totalDollars: number
    totalQty: number
    unit: string
    reason: string | null
  }>
  recurringOffenders: Array<{ name: string; daysSeen: number; venues: string[] }>
}

interface CogsSection {
  weekStartWed: string | null
  perVenue: Array<{
    venue: string
    revenueExGst: number | null
    totalCogs: number
    cogsPct: number | null
    targetPct: number | null
    delta: number | null
    biggestCategory: { name: string; dollars: number } | null
  }>
}

interface LabourSection {
  weekStartWed: string | null
  perVenue: Array<{
    venue: string
    revenueExGst: number | null
    grossWages: number
    overallPct: number | null
    departmentGroups: Array<{
      label: string
      dollars: number
      pct: number | null
      target: { min: number; max: number } | null
      status: "ok" | "amber" | "red" | "no-target"
    }>
  }>
}

interface TopSellersSection {
  perVenue: Array<{
    venue: string
    byQuantity: Array<{ name: string; qty: number; revenue: number }>
    byRevenue: Array<{ name: string; qty: number; revenue: number }>
    risers: string[]
  }>
}

interface OperationsSection {
  perVenue: Array<{
    venue: string
    runsCompleted: number
    overdueAlerts: number
    tempReadings: number
    tempBreaches: Array<{
      template: string
      label: string
      tempCelsius: number
      hotCheck: boolean
      runDate: string
    }>
  }>
  cooling: {
    total: number
    breaches: Array<{
      venue: string
      itemName: string
      reason: string
      startedAt: string
    }>
  }
}

interface SalesSection {
  totalThisWeek: number
  totalLastWeek: number
  wowChangePct: number | null
  perVenue: Array<{
    venue: string
    thisWeek: number
    lastWeek: number
    wowPct: number | null
  }>
}

// ─── Date helpers ────────────────────────────────────────────────────

interface DigestWeek {
  start: Date
  end: Date
  startKey: string
  endKey: string
}

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0]
}

// ─── Section builders ────────────────────────────────────────────────

async function buildReviewsSection(week: DigestWeek): Promise<ReviewsSection> {
  const [thisWeekReviews, places] = await Promise.all([
    db.googleReview.findMany({
      where: { publishTime: { gte: week.start, lte: week.end } },
      orderBy: [{ rating: "asc" }, { publishTime: "desc" }],
    }),
    db.googleVenuePlace.findMany(),
  ])

  const perVenue: ReviewsSection["perVenue"] = SINGLE_VENUES.map((v) => {
    const venueReviews = thisWeekReviews.filter((r) => r.venue === v)
    const place = places.find((p) => p.venue === v)
    const themeCount = new Map<string, number>()
    const sentimentBreakdown: Record<string, number> = {}
    const staff = new Set<string>()
    for (const r of venueReviews) {
      for (const t of r.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1)
      if (r.sentiment)
        sentimentBreakdown[r.sentiment] =
          (sentimentBreakdown[r.sentiment] ?? 0) + 1
      for (const s of r.staffMentions) staff.add(s)
    }
    return {
      venue: VENUE_LABEL[v],
      count: venueReviews.length,
      averageThisWeek: venueReviews.length
        ? venueReviews.reduce((s, r) => s + r.rating, 0) / venueReviews.length
        : null,
      aggregateRating: place?.rating != null ? Number(place.rating) : null,
      aggregateTotalRatings: place?.ratingCount ?? null,
      sentimentBreakdown,
      topThemes: Array.from(themeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t]) => t),
      staffMentioned: Array.from(staff),
      notable: venueReviews.slice(0, 3).map((r) => ({
        rating: r.rating,
        sentiment: r.sentiment,
        author: r.authorName,
        summary: r.taggedSummary,
        text: r.text ? truncate(r.text, 400) : null,
      })),
    }
  })

  const overallNegatives = thisWeekReviews
    .filter(
      (r) =>
        r.sentiment === ReviewSentiment.NEGATIVE ||
        r.sentiment === ReviewSentiment.MIXED ||
        r.rating <= 3
    )
    .slice(0, 6)
    .map((r) => ({
      venue: VENUE_LABEL[r.venue],
      rating: r.rating,
      author: r.authorName,
      summary: r.taggedSummary,
      text: r.text ? truncate(r.text, 400) : null,
    }))

  return {
    totalCount: thisWeekReviews.length,
    averageRating: thisWeekReviews.length
      ? thisWeekReviews.reduce((s, r) => s + r.rating, 0) /
        thisWeekReviews.length
      : null,
    perVenue,
    overallNegatives,
  }
}

async function buildPriceSpikes(week: DigestWeek): Promise<PriceSpikesSection> {
  // We query InvoiceLineItem (not PriceHistory) because PriceHistory only
  // captures *applied* changes — i.e. ones a human clicked through in the
  // suppliers UI. Most price changes sit pending review. For the digest
  // we want everything the parser detected this week so Chloe sees the
  // real movement, not just the rows already acknowledged.
  //
  // Each line has `priceChanged=true` when the invoice unit price
  // differed from the matched ingredient's purchasePrice at parse time,
  // and `currentPrice` stores what the previous master price was at that
  // moment (despite the field name).
  const lines = await db.invoiceLineItem.findMany({
    where: {
      priceChanged: true,
      ingredientId: { not: null },
      invoice: {
        invoiceDate: { gte: week.start, lte: week.end },
      },
    },
    include: {
      ingredient: {
        select: {
          name: true,
          supplier: { select: { name: true } },
        },
      },
      invoice: {
        select: { invoiceDate: true, supplierName: true },
      },
    },
    take: 200,
  })

  // Dedupe: a single ingredient may appear on multiple invoices the same
  // week; keep the biggest absolute % move per ingredient.
  const bestByIngredient = new Map<
    string,
    {
      ingredient: string
      supplier: string | null
      oldPrice: number
      newPrice: number
      changePct: number
      changedAt: string
    }
  >()
  for (const l of lines) {
    if (l.unitPrice == null || l.currentPrice == null) continue
    const oldP = Number(l.currentPrice)
    const newP = Number(l.unitPrice)
    if (oldP <= 0) continue
    const changePct = ((newP - oldP) / oldP) * 100
    // Skip changes ≥200% — almost always a unit mismatch (case price vs
    // single-unit price), not a real spike.
    if (Math.abs(changePct) >= 200) continue
    if (Math.abs(changePct) < 5) continue

    const key = l.ingredientId ?? l.ingredient?.name ?? l.description
    const existing = bestByIngredient.get(key)
    if (!existing || Math.abs(changePct) > Math.abs(existing.changePct)) {
      bestByIngredient.set(key, {
        ingredient: l.ingredient?.name ?? l.description,
        supplier:
          l.ingredient?.supplier?.name ?? l.invoice?.supplierName ?? null,
        oldPrice: oldP,
        newPrice: newP,
        changePct,
        changedAt: (l.invoice?.invoiceDate ?? new Date()).toISOString(),
      })
    }
  }

  const items = Array.from(bestByIngredient.values())
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 12)

  return { count: items.length, items }
}

async function buildWastage(week: DigestWeek): Promise<WastageSection> {
  const lastWeek: DigestWeek = {
    start: new Date(week.start.getTime() - 7 * 86400000),
    end: new Date(week.end.getTime() - 7 * 86400000),
    startKey: "",
    endKey: "",
  }

  const [thisWeekEntries, lastWeekEntries] = await Promise.all([
    db.wasteEntry.findMany({
      where: { date: { gte: week.start, lte: week.end } },
    }),
    db.wasteEntry.findMany({
      where: { date: { gte: lastWeek.start, lte: lastWeek.end } },
      select: { estimatedCost: true },
    }),
  ])

  const totalDollarsThisWeek = thisWeekEntries.reduce(
    (s, e) => s + Number(e.estimatedCost),
    0
  )
  const totalDollarsLastWeek = lastWeekEntries.reduce(
    (s, e) => s + Number(e.estimatedCost),
    0
  )

  const perVenueMap = new Map<Venue, number>()
  for (const e of thisWeekEntries) {
    perVenueMap.set(
      e.venue,
      (perVenueMap.get(e.venue) ?? 0) + Number(e.estimatedCost)
    )
  }

  // Top items by total $
  const byItem = new Map<
    string,
    {
      name: string
      venue: string
      occurrences: number
      totalDollars: number
      totalQty: number
      unit: string
      dayKeys: Set<string>
      reasons: Map<string, number>
    }
  >()
  for (const e of thisWeekEntries) {
    const key = `${e.itemName.toLowerCase()}|${e.venue}`
    const cur = byItem.get(key) ?? {
      name: e.itemName,
      venue: VENUE_LABEL[e.venue],
      occurrences: 0,
      totalDollars: 0,
      totalQty: 0,
      unit: e.unit,
      dayKeys: new Set<string>(),
      reasons: new Map<string, number>(),
    }
    cur.occurrences++
    cur.totalDollars += Number(e.estimatedCost)
    cur.totalQty += Number(e.quantity)
    cur.dayKeys.add(dateKey(e.date))
    cur.reasons.set(e.reason, (cur.reasons.get(e.reason) ?? 0) + 1)
    byItem.set(key, cur)
  }
  const topItems = Array.from(byItem.values())
    .sort((a, b) => b.totalDollars - a.totalDollars)
    .slice(0, 8)
    .map((x) => ({
      name: x.name,
      venue: x.venue,
      occurrences: x.occurrences,
      totalDollars: x.totalDollars,
      totalQty: x.totalQty,
      unit: x.unit,
      reason:
        Array.from(x.reasons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null,
    }))

  // Recurring offenders — same itemName showing up on 3+ different days
  const offenderMap = new Map<
    string,
    { name: string; dayKeys: Set<string>; venues: Set<string> }
  >()
  for (const e of thisWeekEntries) {
    const k = e.itemName.toLowerCase()
    const cur = offenderMap.get(k) ?? {
      name: e.itemName,
      dayKeys: new Set<string>(),
      venues: new Set<string>(),
    }
    cur.dayKeys.add(dateKey(e.date))
    cur.venues.add(VENUE_LABEL[e.venue])
    offenderMap.set(k, cur)
  }
  const recurringOffenders = Array.from(offenderMap.values())
    .filter((x) => x.dayKeys.size >= 3)
    .sort((a, b) => b.dayKeys.size - a.dayKeys.size)
    .slice(0, 5)
    .map((x) => ({
      name: x.name,
      daysSeen: x.dayKeys.size,
      venues: Array.from(x.venues),
    }))

  return {
    totalDollarsThisWeek,
    totalDollarsLastWeek,
    wowChangePct:
      totalDollarsLastWeek > 0
        ? ((totalDollarsThisWeek - totalDollarsLastWeek) /
            totalDollarsLastWeek) *
          100
        : null,
    perVenue: SINGLE_VENUES.map((v) => ({
      venue: VENUE_LABEL[v],
      total: perVenueMap.get(v) ?? 0,
    })),
    topItems,
    recurringOffenders,
  }
}

async function buildCogs(): Promise<CogsSection> {
  // Most recent week that has cogs data for any venue
  const latest = await db.weeklyCogs.findFirst({
    orderBy: { weekStartWed: "desc" },
    select: { weekStartWed: true },
  })
  if (!latest)
    return { weekStartWed: null, perVenue: [] }

  const rows = await db.weeklyCogs.findMany({
    where: { weekStartWed: latest.weekStartWed },
  })

  const perVenue: CogsSection["perVenue"] = SINGLE_VENUES.map((v) => {
    const r = rows.find((x) => x.venue === v)
    if (!r)
      return {
        venue: VENUE_LABEL[v],
        revenueExGst: null,
        totalCogs: 0,
        cogsPct: null,
        targetPct: null,
        delta: null,
        biggestCategory: null,
      }
    const cats: Array<{ name: string; dollars: number }> = []
    if (r.cogsFood != null)
      cats.push({ name: "Food", dollars: Number(r.cogsFood) })
    if (r.cogsCoffee != null)
      cats.push({ name: "Coffee", dollars: Number(r.cogsCoffee) })
    if (r.cogsConsumables != null)
      cats.push({ name: "Consumables", dollars: Number(r.cogsConsumables) })
    const sorted = cats.sort((a, b) => b.dollars - a.dollars)
    return {
      venue: VENUE_LABEL[v],
      revenueExGst: r.revenueExGst ? Number(r.revenueExGst) : null,
      totalCogs: Number(r.totalCogs),
      cogsPct: r.cogsPct ? Number(r.cogsPct) : null,
      targetPct: r.cogsTargetPct ? Number(r.cogsTargetPct) : null,
      delta:
        r.cogsPct && r.cogsTargetPct
          ? Number(r.cogsPct) - Number(r.cogsTargetPct)
          : null,
      biggestCategory: sorted[0] ?? null,
    }
  })

  return {
    weekStartWed: dateKey(latest.weekStartWed),
    perVenue,
  }
}

async function buildLabour(): Promise<LabourSection> {
  const latest = await db.labourWeekActual.findFirst({
    orderBy: { weekStartWed: "desc" },
    select: { weekStartWed: true },
  })
  if (!latest) return { weekStartWed: null, perVenue: [] }

  const rows = await db.labourWeekActual.findMany({
    where: { weekStartWed: latest.weekStartWed },
  })

  const perVenue: LabourSection["perVenue"] = SINGLE_VENUES.map((v) => {
    const r = rows.find((x) => x.venue === v)
    if (!r)
      return {
        venue: VENUE_LABEL[v],
        revenueExGst: null,
        grossWages: 0,
        overallPct: null,
        departmentGroups: [],
      }
    const rev = r.revenueExGst ? Number(r.revenueExGst) : null
    const gross = Number(r.grossWages)
    const overallPct = rev && rev > 0 ? (gross / rev) * 100 : null

    const groups: LabourSection["perVenue"][number]["departmentGroups"] = []
    const targets = (WAGE_TARGETS as Record<string, typeof WAGE_TARGETS["BURLEIGH"]>)[v]

    function addGroup(
      label: string,
      dollars: number,
      target: { min: number; max: number } | null
    ) {
      const pct = rev && rev > 0 ? (dollars / rev) * 100 : null
      let status: "ok" | "amber" | "red" | "no-target" = "no-target"
      if (pct != null && target) {
        // For wage targets, only overspend is bad. Coming in under the
        // band is fine — cheaper labour, more margin. Only flag amber/
        // red when we exceed the top of the band.
        if (pct <= target.max) status = "ok"
        else if (pct <= target.max + 0.5) status = "amber"
        else status = "red"
      }
      groups.push({ label, dollars, pct, target, status })
    }

    if (v === Venue.BURLEIGH) {
      const chefsKp = Number(r.wagesChef ?? 0) + Number(r.wagesKp ?? 0)
      const fohBar = Number(r.wagesFoh ?? 0) + Number(r.wagesBarista ?? 0)
      const pastry = Number(r.wagesPastry ?? 0)
      addGroup("Chefs + KP", chefsKp, targets?.chefsKp ?? null)
      addGroup("FOH + Barista", fohBar, targets?.fohBarista ?? null)
      addGroup("Pastry", pastry, targets?.pastry ?? null)
    } else if (v === Venue.BEACH_HOUSE) {
      const chefsKp = Number(r.wagesChef ?? 0) + Number(r.wagesKp ?? 0)
      const foh = Number(r.wagesFoh ?? 0) + Number(r.wagesBarista ?? 0)
      const pastry = Number(r.wagesPastry ?? 0)
      addGroup("Chefs + KP", chefsKp, targets?.chefsKp ?? null)
      addGroup("FOH (incl. Barista)", foh, targets?.foh ?? null)
      addGroup("Pastry", pastry, targets?.pastry ?? null)
    } else {
      // Tea Garden — targets TBD per memory; just show raw groupings.
      const chefsKp = Number(r.wagesChef ?? 0) + Number(r.wagesKp ?? 0)
      const foh = Number(r.wagesFoh ?? 0) + Number(r.wagesBarista ?? 0)
      const pastry = Number(r.wagesPastry ?? 0)
      addGroup("Chefs + KP", chefsKp, null)
      addGroup("FOH (incl. Barista)", foh, null)
      if (pastry > 0) addGroup("Pastry", pastry, null)
    }

    return {
      venue: VENUE_LABEL[v],
      revenueExGst: rev,
      grossWages: gross,
      overallPct,
      departmentGroups: groups,
    }
  })

  return { weekStartWed: dateKey(latest.weekStartWed), perVenue }
}

async function buildTopSellers(
  week: DigestWeek
): Promise<TopSellersSection> {
  const [thisWeekRows, lastWeekRows] = await Promise.all([
    db.dailySales.findMany({
      where: { date: { gte: week.start, lte: week.end } },
      select: {
        venue: true,
        menuItemName: true,
        quantitySold: true,
        revenue: true,
      },
    }),
    db.dailySales.findMany({
      where: {
        date: {
          gte: new Date(week.start.getTime() - 7 * 86400000),
          lte: new Date(week.end.getTime() - 7 * 86400000),
        },
      },
      select: { venue: true, menuItemName: true, quantitySold: true },
    }),
  ])

  type Agg = { qty: number; revenue: number }
  const perVenueOut = SINGLE_VENUES.map((v) => {
    const tw = new Map<string, Agg>()
    for (const r of thisWeekRows.filter((x) => x.venue === v)) {
      const cur = tw.get(r.menuItemName) ?? { qty: 0, revenue: 0 }
      cur.qty += r.quantitySold
      cur.revenue += Number(r.revenue)
      tw.set(r.menuItemName, cur)
    }
    const lw = new Map<string, number>()
    for (const r of lastWeekRows.filter((x) => x.venue === v)) {
      lw.set(r.menuItemName, (lw.get(r.menuItemName) ?? 0) + r.quantitySold)
    }
    const byQuantity = Array.from(tw.entries())
      .map(([name, a]) => ({ name, qty: a.qty, revenue: a.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
    const byRevenue = Array.from(tw.entries())
      .map(([name, a]) => ({ name, qty: a.qty, revenue: a.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const lastTopNames = new Set(
      Array.from(lw.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([n]) => n)
    )
    const risers = byQuantity
      .filter((x) => !lastTopNames.has(x.name))
      .slice(0, 5)
      .map((x) => x.name)

    return {
      venue: VENUE_LABEL[v],
      byQuantity,
      byRevenue,
      risers,
    }
  })

  return { perVenue: perVenueOut }
}

async function buildSales(week: DigestWeek): Promise<SalesSection> {
  const lastWeekStart = new Date(week.start.getTime() - 7 * 86400000)
  const lastWeekEnd = new Date(week.end.getTime() - 7 * 86400000)

  // Prefer Louise Kilgour's Mge-PDF revenue (LabourWeekActual.revenueExGst).
  // It includes online sales + event revenue that Lightspeed POS misses.
  // Fall back to summing DailySalesSummary if the PDF hasn't been uploaded
  // for that week yet (digest may run before Thursday upload).
  const [
    thisWeekSummaries,
    lastWeekSummaries,
    thisWeekLouise,
    lastWeekLouise,
  ] = await Promise.all([
    db.dailySalesSummary.findMany({
      where: { date: { gte: week.start, lte: week.end } },
      select: { venue: true, totalRevenueExGst: true },
    }),
    db.dailySalesSummary.findMany({
      where: { date: { gte: lastWeekStart, lte: lastWeekEnd } },
      select: { venue: true, totalRevenueExGst: true },
    }),
    db.labourWeekActual.findMany({
      where: { weekStartWed: week.start },
      select: { venue: true, revenueExGst: true },
    }),
    db.labourWeekActual.findMany({
      where: { weekStartWed: lastWeekStart },
      select: { venue: true, revenueExGst: true },
    }),
  ])

  const sumSummariesBy = (rows: typeof thisWeekSummaries, v: Venue) =>
    rows.filter((r) => r.venue === v).reduce((s, r) => s + Number(r.totalRevenueExGst), 0)

  const louiseFor = (rows: typeof thisWeekLouise, v: Venue): number | null => {
    const row = rows.find((r) => r.venue === v)
    return row?.revenueExGst != null ? Number(row.revenueExGst) : null
  }

  const revenueFor = (
    louiseRows: typeof thisWeekLouise,
    summaryRows: typeof thisWeekSummaries,
    v: Venue
  ) => louiseFor(louiseRows, v) ?? sumSummariesBy(summaryRows, v)

  const perVenue = SINGLE_VENUES.map((v) => {
    const thisW = revenueFor(thisWeekLouise, thisWeekSummaries, v)
    const lastW = revenueFor(lastWeekLouise, lastWeekSummaries, v)
    return {
      venue: VENUE_LABEL[v],
      thisWeek: thisW,
      lastWeek: lastW,
      wowPct: lastW > 0 ? ((thisW - lastW) / lastW) * 100 : null,
    }
  })

  const totalThisWeek = perVenue.reduce((s, p) => s + p.thisWeek, 0)
  const totalLastWeek = perVenue.reduce((s, p) => s + p.lastWeek, 0)

  return {
    totalThisWeek,
    totalLastWeek,
    wowChangePct:
      totalLastWeek > 0
        ? ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100
        : null,
    perVenue,
  }
}

async function buildOperations(week: DigestWeek): Promise<OperationsSection> {
  const [runs, alerts, tempItems, coolingLogs] = await Promise.all([
    db.checklistRun.findMany({
      where: {
        runDate: { gte: week.start, lte: week.end },
        status: "COMPLETED",
      },
      select: { venue: true },
    }),
    db.checklistAlert.findMany({
      where: { runDate: { gte: week.start, lte: week.end } },
      select: { venue: true },
    }),
    db.checklistRunItem.findMany({
      where: {
        tempCelsius: { not: null },
        run: { runDate: { gte: week.start, lte: week.end } },
      },
      select: {
        tempCelsius: true,
        run: { select: { venue: true, runDate: true } },
        templateItem: {
          select: {
            label: true,
            hotCheck: true,
            template: { select: { name: true } },
          },
        },
      },
    }),
    db.coolingLog.findMany({
      where: { startedAt: { gte: week.start, lte: week.end } },
      select: {
        venue: true,
        itemName: true,
        startedAt: true,
        twoHourTempC: true,
        sixHourTempC: true,
      },
    }),
  ])

  const perVenue = SINGLE_VENUES.map((v) => {
    const venueTemps = tempItems.filter((t) => t.run.venue === v)
    const breaches = venueTemps
      .map((t) => {
        const temp = Number(t.tempCelsius)
        const hot = t.templateItem.hotCheck
        const failed = hot ? temp < 60 : temp > 5
        return failed
          ? {
              template: t.templateItem.template.name,
              label: t.templateItem.label,
              tempCelsius: temp,
              hotCheck: hot,
              runDate: t.run.runDate.toISOString().split("T")[0],
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return {
      venue: VENUE_LABEL[v],
      runsCompleted: runs.filter((r) => r.venue === v).length,
      overdueAlerts: alerts.filter((a) => a.venue === v).length,
      tempReadings: venueTemps.length,
      tempBreaches: breaches,
    }
  })

  const coolingBreaches = coolingLogs
    .map((c) => {
      const twoHr = c.twoHourTempC != null ? Number(c.twoHourTempC) : null
      const sixHr = c.sixHourTempC != null ? Number(c.sixHourTempC) : null
      const reasons: string[] = []
      if (twoHr != null && twoHr > 21)
        reasons.push(`2h temp ${twoHr.toFixed(1)}°C (target ≤21°C)`)
      if (sixHr != null && sixHr > 5)
        reasons.push(`6h temp ${sixHr.toFixed(1)}°C (target ≤5°C)`)
      if (reasons.length === 0) return null
      return {
        venue: VENUE_LABEL[c.venue],
        itemName: c.itemName,
        reason: reasons.join(" · "),
        startedAt: c.startedAt.toISOString(),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    perVenue,
    cooling: {
      total: coolingLogs.length,
      breaches: coolingBreaches,
    },
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}

export async function buildWeeklyDigestSnapshot(
  now = new Date()
): Promise<WeeklyDigestSnapshot> {
  const week = lastCompletedTarteWeek(now)
  const [reviews, priceSpikes, wastage, cogs, labour, topSellers, sales, operations, spendPacing] =
    await Promise.all([
      buildReviewsSection(week),
      buildPriceSpikes(week),
      buildWastage(week),
      buildCogs(),
      buildLabour(),
      buildTopSellers(week),
      buildSales(week),
      buildOperations(week),
      buildSpendPacing(),
    ])

  return {
    weekStart: week.startKey,
    weekEnd: week.endKey,
    labourWeekStart: labour.weekStartWed,
    labourWeekEnd: labour.weekStartWed
      ? dateKey(new Date(new Date(labour.weekStartWed).getTime() + 6 * 86400000))
      : null,
    reviews,
    priceSpikes,
    wastage,
    cogs,
    labour,
    topSellers,
    sales,
    operations,
    spendPacing,
  }
}

async function buildSpendPacing(): Promise<SpendPacingSection> {
  // Import lazily to keep this file's tree-shaking clean — the
  // aggregator is also imported by build-time paths.
  const { getCurrentWeekSpend } = await import("@/lib/spend/current-week")
  const snap = await getCurrentWeekSpend()
  return {
    weekStartWed: snap.weekStartWed,
    weekEndTue: snap.weekEndTue,
    dayOfWeek: snap.dayOfWeek,
    daysElapsedFull: snap.daysElapsedFull,
    buckets: snap.buckets.map((b) => ({
      bucket: b.bucket,
      label: b.label,
      forecastRevenue: b.forecastRevenue,
      targetPct: Number(b.targetPct),
      budget: b.budget,
      spentToDate: b.spentToDate,
      estimatedMissingSpend: b.estimatedMissingSpend,
      projectedEndOfWeek: b.projectedEndOfWeek,
      remaining: b.remaining,
      paceStatus: b.paceStatus,
    })),
    coverageProblems: snap.coverage
      .filter((c) => c.status === "overdue" || c.status === "missing")
      .filter((c) => c.critical)
      .map((c) => ({
        canonicalName: c.canonicalName,
        status: c.status as "overdue" | "missing",
        daysSinceLast: c.daysSinceLast,
        expectedIntervalDays: c.expectedIntervalDays,
        note: c.note,
      })),
  }
}
