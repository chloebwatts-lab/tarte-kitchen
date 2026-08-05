"use server"

import { db } from "@/lib/db"
import { Venue, WasteReason } from "@/generated/prisma/client"
import { SINGLE_VENUES } from "@/lib/venues"
import { buildCanonicalizer } from "@/lib/wastage/canonical"

// ============================================================================
// Types
// ============================================================================

export interface WastageAnalytics {
  rangeDays: number
  venue: Venue | "ALL"
  // Big numbers
  totalCost: number
  totalEntries: number
  revenueExGst: number
  wasteAsPctRevenue: number | null
  // Distributions
  byReason: { reason: WasteReason; cost: number; entries: number; pctOfTotal: number }[]
  byVenue: { venue: Venue; cost: number; entries: number; pctOfRevenue: number | null }[]
  byWeek: { weekStart: string; cost: number; revenueExGst: number; pctOfRevenue: number | null }[]
  // Top items
  topItems: {
    itemName: string
    cost: number
    quantity: number
    unit: string | null
    entries: number
    ingredientId: string | null
    dishId: string | null
  }[]
  // Trending, items where cost spiked vs the prior window of equal length.
  // deltaPct is null when the item had no waste in the prior window (new).
  trendingUp: {
    itemName: string
    recentCost: number
    priorCost: number
    deltaPct: number | null
  }[]
  // Shrinkage detective, compare reported waste to what theoretical vs actual
  // stocktakes suggest we lost
  shrinkage: {
    ingredientId: string
    ingredientName: string
    reportedWasteBase: number
    variancePositiveBase: number // how much more we lost than reported
    unaccountedValue: number
    unit: string
  }[]
  // Actionable recommendations
  recommendations: {
    severity: "info" | "warn" | "critical"
    title: string
    body: string
    action?: { label: string; href: string }
  }[]
}

// ============================================================================
// Helpers
// ============================================================================

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  aest.setUTCDate(aest.getUTCDate() - offsetDays)
  return new Date(aest.toISOString().split("T")[0])
}

function weekStartIso(d: Date): string {
  // Monday-anchored AEST week. Mirrors the +10h shift pattern of
  // startOfTarteWeekUtc in src/lib/dates.ts (Monday-anchored to match the
  // checklist-cycle convention). DB dates are stored as UTC midnight of the
  // AEST date, so the shift is a no-op for those, but this stays correct
  // for any real timestamp too.
  const shifted = new Date(d.getTime() + 10 * 60 * 60 * 1000)
  shifted.setUTCHours(0, 0, 0, 0)
  const diff = (shifted.getUTCDay() + 6) % 7
  shifted.setUTCDate(shifted.getUTCDate() - diff)
  return shifted.toISOString().split("T")[0]
}

/**
 * Convert a waste-entry quantity to the ingredient's base unit (g / ml / ea).
 * Returns null when the unit cannot be converted for that base type, e.g.
 * "serve", "tray" or a pack unit; callers skip those rows rather than mix
 * incomparable units into a grams-based variance.
 */
function toIngredientBase(
  qty: number,
  unit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT"
): number | null {
  const u = unit.trim().toLowerCase()
  if (baseType === "WEIGHT") {
    if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams") return qty
    if (u === "kg" || u === "kgs") return qty * 1000
    return null
  }
  if (baseType === "VOLUME") {
    if (u === "ml") return qty
    if (u === "l" || u === "lt" || u === "ltr" || u === "litre" || u === "litres") return qty * 1000
    return null
  }
  if (u === "ea" || u === "each") return qty
  if (u === "dozen") return qty * 12
  return null
}

// ============================================================================
// Main
// ============================================================================

export async function getWastageAnalytics(params: {
  venue: Venue | "ALL"
  rangeDays?: number
}): Promise<WastageAnalytics> {
  const { venue, rangeDays = 28 } = params
  const start = startOfAestDay(rangeDays)
  const venueFilter =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: { in: [venue as Venue] } }

  // ---------- Base pulls ----------
  const entries = await db.wasteEntry.findMany({
    where: { ...venueFilter, date: { gte: start } },
    orderBy: { date: "desc" },
  })

  const summaries = await db.dailySalesSummary.findMany({
    where: { ...venueFilter, date: { gte: start } },
  })

  const [allDishes, allPreps] = await Promise.all([
    db.dish.findMany({ select: { name: true } }),
    db.preparation.findMany({ select: { name: true } }),
  ])
  const canon = buildCanonicalizer(allDishes, allPreps)

  // ---------- Totals ----------
  const totalCost = entries.reduce((s, e) => s + Number(e.estimatedCost), 0)
  const totalEntries = entries.length
  const revenueExGst = summaries.reduce(
    (s, r) => s + Number(r.totalRevenueExGst),
    0
  )
  const wasteAsPctRevenue =
    revenueExGst > 0 ? (totalCost / revenueExGst) * 100 : null

  // ---------- By reason ----------
  const reasonMap = new Map<WasteReason, { cost: number; entries: number }>()
  for (const e of entries) {
    const existing = reasonMap.get(e.reason) ?? { cost: 0, entries: 0 }
    existing.cost += Number(e.estimatedCost)
    existing.entries += 1
    reasonMap.set(e.reason, existing)
  }
  const byReason = Array.from(reasonMap.entries())
    .map(([reason, v]) => ({
      reason,
      cost: Math.round(v.cost * 100) / 100,
      entries: v.entries,
      pctOfTotal:
        totalCost > 0 ? Math.round((v.cost / totalCost) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)

  // ---------- By venue ----------
  const venueMap = new Map<Venue, { cost: number; entries: number }>()
  for (const e of entries) {
    const existing = venueMap.get(e.venue) ?? { cost: 0, entries: 0 }
    existing.cost += Number(e.estimatedCost)
    existing.entries += 1
    venueMap.set(e.venue, existing)
  }
  const revenueByVenue = new Map<Venue, number>()
  for (const s of summaries) {
    revenueByVenue.set(
      s.venue,
      (revenueByVenue.get(s.venue) ?? 0) + Number(s.totalRevenueExGst)
    )
  }
  const byVenueAll: { venue: Venue; cost: number; entries: number; pctOfRevenue: number | null }[] = []
  for (const v of SINGLE_VENUES) {
    const d = venueMap.get(v)
    const rev = revenueByVenue.get(v) ?? 0
    if (!d && rev === 0) continue
    byVenueAll.push({
      venue: v,
      cost: d ? Math.round(d.cost * 100) / 100 : 0,
      entries: d?.entries ?? 0,
      pctOfRevenue:
        rev > 0 ? Math.round(((d?.cost ?? 0) / rev) * 10000) / 100 : null,
    })
  }

  // ---------- By week ----------
  const weekCostMap = new Map<string, number>()
  for (const e of entries) {
    const w = weekStartIso(e.date)
    weekCostMap.set(w, (weekCostMap.get(w) ?? 0) + Number(e.estimatedCost))
  }
  const weekRevMap = new Map<string, number>()
  for (const s of summaries) {
    const w = weekStartIso(s.date)
    weekRevMap.set(
      w,
      (weekRevMap.get(w) ?? 0) + Number(s.totalRevenueExGst)
    )
  }
  const allWeeks = new Set<string>([
    ...weekCostMap.keys(),
    ...weekRevMap.keys(),
  ])
  const byWeek = Array.from(allWeeks)
    .sort()
    .map((w) => {
      const cost = weekCostMap.get(w) ?? 0
      const rev = weekRevMap.get(w) ?? 0
      return {
        weekStart: w,
        cost: Math.round(cost * 100) / 100,
        revenueExGst: Math.round(rev * 100) / 100,
        pctOfRevenue:
          rev > 0 ? Math.round((cost / rev) * 10000) / 100 : null,
      }
    })

  // ---------- Top items ----------
  const itemMap = new Map<
    string,
    {
      itemName: string
      cost: number
      quantity: number
      unit: string | null
      entries: number
      ingredientId: string | null
      dishId: string | null
    }
  >()
  for (const e of entries) {
    // Prefer FK identity, but free-text rows fall back to the canonical name
    // so "Almond Croissant - Each" lines up with "Croissant - Almond".
    const display = canon(e.itemName)
    const key = e.ingredientId ?? e.dishId ?? display
    const existing = itemMap.get(key) ?? {
      itemName: display,
      cost: 0,
      quantity: 0,
      unit: e.unit,
      entries: 0,
      ingredientId: e.ingredientId,
      dishId: e.dishId,
    }
    existing.cost += Number(e.estimatedCost)
    existing.quantity += Number(e.quantity)
    existing.entries += 1
    itemMap.set(key, existing)
  }
  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15)
    .map((i) => ({
      ...i,
      cost: Math.round(i.cost * 100) / 100,
      quantity: Math.round(i.quantity * 1000) / 1000,
    }))

  // ---------- Trending up (last rangeDays vs the rangeDays before) ----------
  // The prior window needs its own fetch: `entries` only covers the current
  // range, so comparing inside it left the prior window empty at 14d and
  // flagged every item as +999%.
  const priorStart = startOfAestDay(rangeDays * 2)
  const priorEntries = await db.wasteEntry.findMany({
    where: { ...venueFilter, date: { gte: priorStart, lt: start } },
  })
  const recentMap = new Map<string, number>()
  const priorMap = new Map<string, number>()
  for (const e of entries) {
    const key = canon(e.itemName)
    recentMap.set(key, (recentMap.get(key) ?? 0) + Number(e.estimatedCost))
  }
  for (const e of priorEntries) {
    const key = canon(e.itemName)
    priorMap.set(key, (priorMap.get(key) ?? 0) + Number(e.estimatedCost))
  }
  const trendingUp = Array.from(recentMap.entries())
    .map(([itemName, recent]) => {
      const prior = priorMap.get(itemName) ?? 0
      // null delta = no prior-window waste at all; the UI renders "new"
      // instead of a fabricated percentage.
      const deltaPct =
        prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null
      return {
        itemName,
        recentCost: Math.round(recent * 100) / 100,
        priorCost: Math.round(prior * 100) / 100,
        deltaPct,
      }
    })
    .filter((t) => t.recentCost >= 10 && (t.deltaPct === null || t.deltaPct >= 30))
    .sort((a, b) => {
      if (a.deltaPct === null && b.deltaPct === null) return b.recentCost - a.recentCost
      if (a.deltaPct === null) return -1
      if (b.deltaPct === null) return 1
      return b.deltaPct - a.deltaPct
    })
    .slice(0, 8)

  // ---------- Shrinkage detective ----------
  // A SUBMITTED stocktake's variance covers the interval since the previous
  // submitted stocktake at the same venue (that is how saveStocktakeCounts
  // computes expected stock). So each negative variance must be compared to
  // the waste logged for that ingredient in the SAME interval, converted to
  // the ingredient's base unit. The remaining gap is unaccounted loss:
  // theft, over-portioning, dropped trays never logged.
  const stocktakes = await db.stocktake.findMany({
    where: {
      ...venueFilter,
      status: "SUBMITTED",
      date: { gte: startOfAestDay(rangeDays + 28) }, // catch pairs straddling the range
    },
    orderBy: { date: "desc" },
    include: {
      items: {
        include: {
          ingredient: { select: { name: true, baseUnitType: true, purchasePrice: true, baseUnitsPerPurchase: true } },
        },
      },
    },
  })

  // Interval start per stocktake = date of the previous submitted stocktake
  // at the same venue. Inside the fetched (desc-ordered) set that's just the
  // next row for the venue; the earliest fetched one needs a DB lookup.
  const stocktakesByVenue = new Map<Venue, typeof stocktakes>()
  for (const st of stocktakes) {
    const arr = stocktakesByVenue.get(st.venue) ?? []
    arr.push(st)
    stocktakesByVenue.set(st.venue, arr)
  }
  const intervalStartByStocktake = new Map<string, Date>()
  for (const [stVenue, sts] of stocktakesByVenue) {
    for (let i = 0; i < sts.length; i++) {
      if (i + 1 < sts.length) {
        intervalStartByStocktake.set(sts[i].id, sts[i + 1].date)
      } else {
        const prevSt = await db.stocktake.findFirst({
          where: { venue: stVenue, status: "SUBMITTED", date: { lt: sts[i].date } },
          orderBy: { date: "desc" },
          select: { date: true },
        })
        if (prevSt) intervalStartByStocktake.set(sts[i].id, prevSt.date)
      }
    }
  }

  // Waste entries covering the earliest interval, indexed per venue+ingredient.
  const intervalStarts = Array.from(intervalStartByStocktake.values())
  const shrinkWasteByKey = new Map<
    string,
    { date: Date; quantity: number; unit: string }[]
  >()
  if (intervalStarts.length > 0) {
    const minIntervalStart = new Date(
      Math.min(...intervalStarts.map((d) => d.getTime()))
    )
    const shrinkWaste = await db.wasteEntry.findMany({
      where: {
        ...venueFilter,
        ingredientId: { not: null },
        date: { gte: minIntervalStart },
      },
      select: { ingredientId: true, venue: true, date: true, quantity: true, unit: true },
    })
    for (const w of shrinkWaste) {
      if (!w.ingredientId) continue
      const k = `${w.venue}|${w.ingredientId}`
      const arr = shrinkWasteByKey.get(k) ?? []
      arr.push({ date: w.date, quantity: Number(w.quantity), unit: w.unit })
      shrinkWasteByKey.set(k, arr)
    }
  }

  const shrinkageMap = new Map<
    string,
    {
      ingredientName: string
      variancePositiveBase: number
      reportedBase: number
      unit: string
      unitCost: number
    }
  >()
  for (const st of stocktakes) {
    const intervalStart = intervalStartByStocktake.get(st.id)
    // No previous stocktake means no variance was computed for this one.
    if (!intervalStart) continue
    for (const it of st.items) {
      if (!it.ingredient) continue
      const variance = Number(it.varianceBaseQty ?? 0)
      // Only count NEGATIVE variance, i.e. we counted less than expected,
      // which means "we lost more than we accounted for". Positive variance
      // is over-count (mis-count, found in another fridge, etc).
      if (variance >= 0) continue
      const lossBase = -variance
      const baseType = it.ingredient.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
      const baseUnit = baseType === "WEIGHT" ? "g" : baseType === "VOLUME" ? "ml" : "ea"
      const unitCost =
        Number(it.ingredient.baseUnitsPerPurchase) > 0
          ? Number(it.ingredient.purchasePrice) /
            Number(it.ingredient.baseUnitsPerPurchase)
          : 0
      // Waste logged in this stocktake pair's own interval (prev, current],
      // in the ingredient's base unit. Unconvertible rows are skipped.
      let reportedBase = 0
      const wasteRows = shrinkWasteByKey.get(`${st.venue}|${it.ingredientId}`) ?? []
      for (const w of wasteRows) {
        if (!(w.date > intervalStart && w.date <= st.date)) continue
        const base = toIngredientBase(w.quantity, w.unit, baseType)
        if (base === null) continue
        reportedBase += base
      }
      const existing = shrinkageMap.get(it.ingredientId) ?? {
        ingredientName: it.ingredient.name,
        variancePositiveBase: 0,
        reportedBase: 0,
        unit: baseUnit,
        unitCost,
      }
      existing.variancePositiveBase += lossBase
      existing.reportedBase += reportedBase
      shrinkageMap.set(it.ingredientId, existing)
    }
  }
  const shrinkage = Array.from(shrinkageMap.entries())
    .map(([ingredientId, s]) => {
      const unaccountedBase = Math.max(
        s.variancePositiveBase - s.reportedBase,
        0
      )
      return {
        ingredientId,
        ingredientName: s.ingredientName,
        reportedWasteBase: Math.round(s.reportedBase),
        variancePositiveBase: Math.round(s.variancePositiveBase),
        unaccountedValue:
          Math.round(unaccountedBase * s.unitCost * 100) / 100,
        unit: s.unit,
      }
    })
    .filter((s) => s.unaccountedValue >= 5)
    .sort((a, b) => b.unaccountedValue - a.unaccountedValue)
    .slice(0, 10)

  // ---------- Recommendations ----------
  const recs: WastageAnalytics["recommendations"] = []

  if (wasteAsPctRevenue !== null && wasteAsPctRevenue >= 3) {
    recs.push({
      severity: wasteAsPctRevenue >= 5 ? "critical" : "warn",
      title: `Waste is ${wasteAsPctRevenue.toFixed(1)}% of revenue`,
      body:
        wasteAsPctRevenue >= 5
          ? "Industry benchmark is under 3%. Every 1% recovered here drops straight to gross profit, if this holds over a year that's real money."
          : "You're above the 2–3% benchmark. Focus the next 4 weeks on the top 5 items below; most hospitality sites halve their waste within 60 days of starting tight tracking.",
    })
  }

  const topReason = byReason[0]
  if (topReason && topReason.pctOfTotal >= 30) {
    const map: Record<WasteReason, string> = {
      OVERPRODUCTION:
        "Trim the prep sheet for these items, or switch to made-to-order. Review venue-specific DoW patterns, the prep sheet already uses a median forecast.",
      SPOILAGE:
        "Audit FIFO rotation and fridge temps. Check the HACCP checklist is actually being completed each shift (alerting coming, see Checklists).",
      EXPIRED:
        "Shorten order windows with the supplier, tighten the par level, or introduce smaller batch preps.",
      DROPPED:
        "Usually a training/layout issue. Tag the venue with the most drops and spot-check lunch service.",
      STAFF_MEAL:
        "Reclassify staff meals if they're a perk, they're not technically waste. Otherwise cap via a dedicated staff-meal budget.",
      CUSTOMER_RETURN:
        "Pull the top returned dishes from the Menu Matrix, classic Dog quadrant behaviour.",
      QUALITY_ISSUE:
        "Trace back to the supplier via invoice history; a pattern here warrants a price-history + rejection conversation.",
      OTHER: "Reclassify 'Other' entries, most are really spoilage or overproduction.",
    }
    recs.push({
      severity: "warn",
      title: `${topReason.reason.replace(/_/g, " ")} is ${topReason.pctOfTotal.toFixed(0)}% of waste cost`,
      body: map[topReason.reason],
    })
  }

  if (trendingUp.length > 0) {
    const t = trendingUp[0]
    recs.push({
      severity: "warn",
      title:
        t.deltaPct === null
          ? `${t.itemName} waste is new in the last ${rangeDays} days`
          : `${t.itemName} waste up ${t.deltaPct}% in the last ${rangeDays} days`,
      body:
        t.deltaPct === null
          ? `Nothing logged in the prior ${rangeDays} days, now $${t.recentCost.toFixed(0)}. Likely a prep/portion issue: check who's on that section and whether the recipe yield shifted.`
          : `Was $${t.priorCost.toFixed(0)}, now $${t.recentCost.toFixed(0)}. Likely a prep/portion issue: check who's on that section and whether the recipe yield shifted.`,
      action: {
        label: "Review entries",
        href: `/wastage?search=${encodeURIComponent(t.itemName)}`,
      },
    })
  }

  if (shrinkage.length > 0) {
    const totalUnaccounted = shrinkage.reduce(
      (s, x) => s + x.unaccountedValue,
      0
    )
    if (totalUnaccounted >= 50) {
      recs.push({
        severity: "critical",
        title: `$${totalUnaccounted.toFixed(0)} of stock loss is unaccounted for`,
        body: `Stocktake variance says we lost more than what's been logged in wastage. Top offender: ${shrinkage[0].ingredientName} ($${shrinkage[0].unaccountedValue.toFixed(0)}). Likely over-portioning, unrecorded staff meals, or theft.`,
      })
    }
  }

  if (entries.length === 0) {
    recs.push({
      severity: "info",
      title: "No waste logged this period",
      body:
        "If that's accurate, great. If not, you can't improve what you don't measure; prompt staff via a daily closing checklist item.",
    })
  }

  return {
    rangeDays,
    venue,
    totalCost: Math.round(totalCost * 100) / 100,
    totalEntries,
    revenueExGst: Math.round(revenueExGst * 100) / 100,
    wasteAsPctRevenue:
      wasteAsPctRevenue !== null
        ? Math.round(wasteAsPctRevenue * 100) / 100
        : null,
    byReason,
    byVenue: byVenueAll,
    byWeek,
    topItems,
    trendingUp,
    shrinkage,
    recommendations: recs,
  }
}
