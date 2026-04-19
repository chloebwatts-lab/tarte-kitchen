"use server"

import { db } from "@/lib/db"
import { Venue, WasteReason } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

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
  // Trending — items where cost spiked vs their own trailing average
  trendingUp: {
    itemName: string
    recent14dCost: number
    prior14dCost: number
    deltaPct: number
  }[]
  // Shrinkage detective — compare reported waste to what theoretical vs actual
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
  // Monday-anchored AEST week
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - diff)
  return monday.toISOString().split("T")[0]
}

function toBase(qty: number, unit: string) {
  const u = unit.toLowerCase()
  if (u === "kg") return qty * 1000
  if (u === "l") return qty * 1000
  return qty
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
    const key = e.ingredientId ?? e.dishId ?? e.itemName
    const existing = itemMap.get(key) ?? {
      itemName: e.itemName,
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

  // ---------- Trending up (last 14d vs prior 14d) ----------
  const recentStart = startOfAestDay(14)
  const priorStart = startOfAestDay(28)
  const recentMap = new Map<string, number>()
  const priorMap = new Map<string, number>()
  for (const e of entries) {
    const key = e.itemName
    const cost = Number(e.estimatedCost)
    if (e.date >= recentStart) {
      recentMap.set(key, (recentMap.get(key) ?? 0) + cost)
    } else if (e.date >= priorStart) {
      priorMap.set(key, (priorMap.get(key) ?? 0) + cost)
    }
  }
  const trendingUp = Array.from(recentMap.entries())
    .map(([itemName, recent]) => {
      const prior = priorMap.get(itemName) ?? 0
      const deltaPct =
        prior > 0
          ? Math.round(((recent - prior) / prior) * 100)
          : recent > 0
            ? 999
            : 0
      return {
        itemName,
        recent14dCost: Math.round(recent * 100) / 100,
        prior14dCost: Math.round(prior * 100) / 100,
        deltaPct,
      }
    })
    .filter((t) => t.recent14dCost >= 10 && t.deltaPct >= 30)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 8)

  // ---------- Shrinkage detective ----------
  // For each SUBMITTED stocktake pair, compare variance (expected − counted)
  // against waste entries logged in the same window. The gap is unaccounted
  // loss — theft, over-portioning, dropped trays never logged.
  const stocktakes = await db.stocktake.findMany({
    where: {
      ...venueFilter,
      status: "SUBMITTED",
      date: { gte: startOfAestDay(rangeDays + 28) }, // slightly wider window
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

  const shrinkageMap = new Map<
    string,
    { ingredientName: string; variancePositiveBase: number; unit: string; unitCost: number }
  >()
  for (const st of stocktakes) {
    for (const it of st.items) {
      if (!it.ingredient) continue
      const variance = Number(it.varianceBaseQty ?? 0)
      // Only count NEGATIVE variance — i.e. we counted less than expected,
      // which means "we lost more than we accounted for". Positive variance
      // is over-count (mis-count, found in another fridge, etc).
      if (variance >= 0) continue
      const lossBase = -variance
      const baseUnit =
        it.ingredient.baseUnitType === "WEIGHT"
          ? "g"
          : it.ingredient.baseUnitType === "VOLUME"
            ? "ml"
            : "ea"
      const unitCost =
        Number(it.ingredient.baseUnitsPerPurchase) > 0
          ? Number(it.ingredient.purchasePrice) /
            Number(it.ingredient.baseUnitsPerPurchase)
          : 0
      const existing = shrinkageMap.get(it.ingredientId) ?? {
        ingredientName: it.ingredient.name,
        variancePositiveBase: 0,
        unit: baseUnit,
        unitCost,
      }
      existing.variancePositiveBase += lossBase
      shrinkageMap.set(it.ingredientId, existing)
    }
  }
  // Subtract reported waste (converted to base units) from the variance
  const wasteByIngredient = new Map<string, number>()
  for (const e of entries) {
    if (!e.ingredientId) continue
    const base = toBase(Number(e.quantity), e.unit)
    wasteByIngredient.set(
      e.ingredientId,
      (wasteByIngredient.get(e.ingredientId) ?? 0) + base
    )
  }
  const shrinkage = Array.from(shrinkageMap.entries())
    .map(([ingredientId, s]) => {
      const reported = wasteByIngredient.get(ingredientId) ?? 0
      const unaccountedBase = Math.max(
        s.variancePositiveBase - reported,
        0
      )
      return {
        ingredientId,
        ingredientName: s.ingredientName,
        reportedWasteBase: Math.round(reported),
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
          ? "Industry benchmark is under 3%. Every 1% recovered here drops straight to gross profit — if this holds over a year that's real money."
          : "You're above the 2–3% benchmark. Focus the next 4 weeks on the top 5 items below; most hospitality sites halve their waste within 60 days of starting tight tracking.",
    })
  }

  const topReason = byReason[0]
  if (topReason && topReason.pctOfTotal >= 30) {
    const map: Record<WasteReason, string> = {
      OVERPRODUCTION:
        "Trim the prep sheet for these items, or switch to made-to-order. Review venue-specific DoW patterns — the prep sheet already uses a median forecast.",
      SPOILAGE:
        "Audit FIFO rotation and fridge temps. Check the HACCP checklist is actually being completed each shift (alerting coming — see Checklists).",
      EXPIRED:
        "Shorten order windows with the supplier, tighten the par level, or introduce smaller batch preps.",
      DROPPED:
        "Usually a training/layout issue. Tag the venue with the most drops and spot-check lunch service.",
      STAFF_MEAL:
        "Reclassify staff meals if they're a perk — they're not technically waste. Otherwise cap via a dedicated staff-meal budget.",
      CUSTOMER_RETURN:
        "Pull the top returned dishes from the Menu Matrix — classic Dog quadrant behaviour.",
      QUALITY_ISSUE:
        "Trace back to the supplier via invoice history; a pattern here warrants a price-history + rejection conversation.",
      OTHER: "Reclassify 'Other' entries — most are really spoilage or overproduction.",
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
      title: `${t.itemName} waste up ${t.deltaPct}% in the last 14 days`,
      body: `Was $${t.prior14dCost.toFixed(0)} → now $${t.recent14dCost.toFixed(0)}. Likely a prep/portion issue — check who's on that section and whether the recipe yield shifted.`,
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
        "If that's accurate — great. If not, you can't improve what you don't measure; prompt staff via a daily closing checklist item.",
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
