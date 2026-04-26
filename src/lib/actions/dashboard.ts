"use server"

import { db } from "@/lib/db"
import type { Dish, PriceHistory, Ingredient } from "@/generated/prisma/client"
import { SINGLE_VENUES, VENUE_SHORT_LABEL, type SingleVenue } from "@/lib/venues"
import { startOfTarteWeekUtc } from "@/lib/dates"

export interface DashboardHighlights {
  // --- Sales today vs forecast (week-prorated) -----------------------
  salesToday: {
    perVenue: {
      venue: SingleVenue
      label: string
      revenueExGst: number
      // dailyTarget = weekly forecast / 7 (the "average day" target).
      dailyTarget: number | null
      // % of target hit so far today; null when no forecast.
      pctOfTarget: number | null
    }[]
    totalRevenue: number
    totalDailyTarget: number | null
  }
  // --- Waste this week ------------------------------------------------
  waste: {
    totalCost: number
    weekOverWeekChange: number | null // % change vs prior week
    topItem: { name: string; cost: number; venue: string } | null
    weekLabel: string
  }
  // --- Top supplier spike --------------------------------------------
  // Latest week vs 4-wk avg. Picks the single supplier with the largest
  // % jump (>25%) so the dashboard surfaces *one* thing to act on.
  supplierSpike: {
    supplier: string
    venue: SingleVenue
    venueLabel: string
    latestAmount: number
    fourWeekAvg: number
    pctIncrease: number
    weekLabel: string
  } | null
}

export async function getDashboardHighlights(): Promise<DashboardHighlights> {
  const now = new Date()

  // Today (AEST date in UTC label) — DailySalesSummary.date is stored as
  // a UTC midnight matching the AEST calendar day.
  const aestNow = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  const todayKey = aestNow.toISOString().split("T")[0]
  const todayStart = new Date(`${todayKey}T00:00:00.000Z`)

  // This-week / last-week (Wed→Tue) for waste comparison.
  const thisWeekWed = startOfTarteWeekUtc(now)
  const lastWeekWed = new Date(thisWeekWed)
  lastWeekWed.setUTCDate(lastWeekWed.getUTCDate() - 7)
  const nextWeekWed = new Date(thisWeekWed)
  nextWeekWed.setUTCDate(nextWeekWed.getUTCDate() + 7)

  const [
    todaySales,
    weekForecasts,
    thisWeekWaste,
    lastWeekWaste,
    supplierLines,
  ] = await Promise.all([
    db.dailySalesSummary.findMany({
      where: { date: todayStart },
    }),
    db.managerSalesForecast.findMany({
      where: { weekStartWed: thisWeekWed },
    }),
    db.wasteEntry.findMany({
      where: { date: { gte: thisWeekWed, lt: nextWeekWed } },
    }),
    db.wasteEntry.findMany({
      where: { date: { gte: lastWeekWed, lt: thisWeekWed } },
    }),
    // Last 5 weeks of supplier lines so we can compute a 4-wk avg vs the
    // most-recent week.
    db.cogsSupplierLine.findMany({
      where: {
        weekStartWed: {
          gte: new Date(thisWeekWed.getTime() - 5 * 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { weekStartWed: "asc" },
    }),
  ])

  // --- Sales today vs daily target -----------------------------------
  const todayByVenue = new Map<SingleVenue, number>()
  for (const s of todaySales) {
    if ((SINGLE_VENUES as readonly string[]).includes(s.venue)) {
      const v = s.venue as SingleVenue
      todayByVenue.set(v, (todayByVenue.get(v) ?? 0) + Number(s.totalRevenueExGst))
    }
  }
  const forecastByVenue = new Map<SingleVenue, number>()
  for (const f of weekForecasts) {
    if ((SINGLE_VENUES as readonly string[]).includes(f.venue)) {
      const v = f.venue as SingleVenue
      forecastByVenue.set(v, Number(f.amount))
    }
  }
  const perVenue = SINGLE_VENUES.map((v) => {
    const revenueExGst = Math.round((todayByVenue.get(v) ?? 0) * 100) / 100
    const weekly = forecastByVenue.get(v)
    const dailyTarget = weekly !== undefined ? Math.round((weekly / 7) * 100) / 100 : null
    const pctOfTarget =
      dailyTarget && dailyTarget > 0
        ? Math.round((revenueExGst / dailyTarget) * 1000) / 10
        : null
    return { venue: v, label: VENUE_SHORT_LABEL[v], revenueExGst, dailyTarget, pctOfTarget }
  })
  const totalRevenue = perVenue.reduce((s, v) => s + v.revenueExGst, 0)
  const totalDailyTarget = perVenue.some((v) => v.dailyTarget !== null)
    ? perVenue.reduce((s, v) => s + (v.dailyTarget ?? 0), 0)
    : null

  // --- Waste this week vs last week ----------------------------------
  const totalCost = thisWeekWaste.reduce((s, e) => s + Number(e.estimatedCost), 0)
  const lastWeekTotal = lastWeekWaste.reduce((s, e) => s + Number(e.estimatedCost), 0)
  const weekOverWeekChange =
    lastWeekTotal > 0
      ? Math.round(((totalCost - lastWeekTotal) / lastWeekTotal) * 1000) / 10
      : null
  const itemMap = new Map<string, { cost: number; venue: string }>()
  for (const e of thisWeekWaste) {
    const cur = itemMap.get(e.itemName) ?? { cost: 0, venue: e.venue }
    cur.cost += Number(e.estimatedCost)
    itemMap.set(e.itemName, cur)
  }
  const topItemEntry = Array.from(itemMap.entries()).sort(
    (a, b) => b[1].cost - a[1].cost
  )[0]
  const topItem = topItemEntry
    ? {
        name: topItemEntry[0],
        cost: Math.round(topItemEntry[1].cost * 100) / 100,
        venue: topItemEntry[1].venue,
      }
    : null
  const weekLabelEnd = new Date(thisWeekWed)
  weekLabelEnd.setUTCDate(weekLabelEnd.getUTCDate() + 6)
  const weekLabel = `w/e ${weekLabelEnd.getUTCDate()} ${weekLabelEnd.toLocaleString(
    "en-AU",
    { month: "short", timeZone: "UTC" }
  )}`

  // --- Top supplier spike --------------------------------------------
  // Pivot lines into (venue, supplier) → {weekIso → amount}.
  type Key = string // `${venue}|${supplier}`
  const pivot = new Map<Key, Map<string, number>>()
  const allWeeks = new Set<string>()
  for (const l of supplierLines) {
    const iso = l.weekStartWed.toISOString().split("T")[0]
    allWeeks.add(iso)
    const key: Key = `${l.venue}|${l.supplier}`
    const m = pivot.get(key) ?? new Map<string, number>()
    m.set(iso, Number(l.amount))
    pivot.set(key, m)
  }
  const orderedWeeks = Array.from(allWeeks).sort()
  const latestWeek = orderedWeeks[orderedWeeks.length - 1]
  const priorWeeks = orderedWeeks.slice(-5, -1)

  let bestSpike: DashboardHighlights["supplierSpike"] = null
  if (latestWeek) {
    for (const [key, byWeek] of pivot) {
      const [venue, supplier] = key.split("|") as [string, string]
      if (!(SINGLE_VENUES as readonly string[]).includes(venue)) continue
      const latestAmount = byWeek.get(latestWeek)
      if (latestAmount === undefined || latestAmount <= 0) continue
      const priorVals = priorWeeks
        .map((w) => byWeek.get(w))
        .filter((v): v is number => typeof v === "number" && v > 0)
      if (priorVals.length < 2) continue // need real history before crying spike
      const avg = priorVals.reduce((a, b) => a + b, 0) / priorVals.length
      if (avg <= 0) continue
      const pctIncrease = ((latestAmount - avg) / avg) * 100
      if (pctIncrease < 25) continue
      if (latestAmount - avg < 50) continue // ignore <$50 deltas — noise
      if (!bestSpike || pctIncrease > bestSpike.pctIncrease) {
        const venueShort = VENUE_SHORT_LABEL[venue as SingleVenue]
        const latestEnd = new Date(latestWeek)
        latestEnd.setUTCDate(latestEnd.getUTCDate() + 6)
        bestSpike = {
          supplier,
          venue: venue as SingleVenue,
          venueLabel: venueShort,
          latestAmount: Math.round(latestAmount * 100) / 100,
          fourWeekAvg: Math.round(avg * 100) / 100,
          pctIncrease: Math.round(pctIncrease * 10) / 10,
          weekLabel: `w/e ${latestEnd.getUTCDate()} ${latestEnd.toLocaleString("en-AU", { month: "short", timeZone: "UTC" })}`,
        }
      }
    }
  }

  return {
    salesToday: {
      perVenue,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalDailyTarget:
        totalDailyTarget !== null ? Math.round(totalDailyTarget * 100) / 100 : null,
    },
    waste: {
      totalCost: Math.round(totalCost * 100) / 100,
      weekOverWeekChange,
      topItem,
      weekLabel,
    },
    supplierSpike: bestSpike,
  }
}

type DishSelect = Pick<Dish, "id" | "name" | "menuCategory" | "venue" | "sellingPrice" | "totalCost" | "foodCostPercentage" | "grossProfit">
type PriceChangeWithIngredient = PriceHistory & { ingredient: Pick<Ingredient, "id" | "name"> }

export async function getDashboardStats() {
  const [dishes, priceChanges, prepCount] = await Promise.all([
    db.dish.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        menuCategory: true,
        venue: true,
        sellingPrice: true,
        totalCost: true,
        foodCostPercentage: true,
        grossProfit: true,
      },
      orderBy: { foodCostPercentage: "desc" },
    }) as Promise<DishSelect[]>,
    db.priceHistory.findMany({
      where: {
        changedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: { ingredient: { select: { id: true, name: true } } },
      orderBy: { changedAt: "desc" },
      take: 20,
    }) as Promise<PriceChangeWithIngredient[]>,
    db.preparation.count(),
  ])

  // Invoice tables may not exist yet — guard against missing tables
  let invoiceAlertCount = 0
  let recentInvoices: Array<{ id: string; supplier: { name: string } | null; invoiceNumber: string | null; totalAmount: unknown; status: string; createdAt: Date }> = []
  try {
    invoiceAlertCount = await db.invoiceLineItem.count({
      where: { priceChanged: true, priceApproved: null },
    })
    const rows = await db.invoice.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    recentInvoices = rows.map((r) => ({
      id: r.id,
      supplier: r.supplier,
      invoiceNumber: r.invoiceNumber,
      totalAmount: r.total,
      status: r.status,
      createdAt: r.createdAt,
    }))
  } catch {
    // Invoice tables not yet migrated — skip
  }

  const totalMenuItems = dishes.length
  const totalPreparations = prepCount

  const avgFoodCostPct =
    dishes.length > 0
      ? dishes.reduce((sum: number, d: DishSelect) => sum + Number(d.foodCostPercentage), 0) / dishes.length
      : 0

  const itemsAbove35 = dishes.filter((d: DishSelect) => Number(d.foodCostPercentage) > 35)

  const topByProfit = [...dishes]
    .sort((a: DishSelect, b: DishSelect) => Number(b.grossProfit) - Number(a.grossProfit))
    .slice(0, 5)

  const worstByCost = dishes
    .filter((d: DishSelect) => Number(d.foodCostPercentage) > 0)
    .slice(0, 5)

  const alerts = priceChanges.map((pc: PriceChangeWithIngredient) => {
    const oldP = Number(pc.oldPrice)
    const newP = Number(pc.newPrice)
    const changePct = oldP > 0 ? ((newP - oldP) / oldP) * 100 : 0
    return {
      id: pc.id,
      ingredientId: pc.ingredient.id,
      ingredientName: pc.ingredient.name,
      oldPrice: oldP,
      newPrice: newP,
      changePercentage: Math.round(changePct * 10) / 10,
      changedAt: pc.changedAt.toISOString(),
    }
  })

  // Full dish list for client-side filtering on dashboard
  const allDishes = dishes.map((d: DishSelect) => ({
    id: d.id,
    name: d.name,
    menuCategory: d.menuCategory,
    venue: d.venue,
    sellingPrice: Number(d.sellingPrice),
    totalCost: Number(d.totalCost),
    foodCostPercentage: Number(d.foodCostPercentage),
    grossProfit: Number(d.grossProfit),
  }))

  return {
    totalMenuItems,
    totalPreparations,
    averageFoodCostPct: Math.round(avgFoodCostPct * 10) / 10,
    itemsAbove35Pct: itemsAbove35.length,
    itemsAbove35: itemsAbove35.map((d: DishSelect) => ({
      id: d.id,
      name: d.name,
      foodCostPercentage: Number(d.foodCostPercentage),
      venue: d.venue,
    })),
    topByProfit: topByProfit.map((d: DishSelect) => ({
      id: d.id,
      name: d.name,
      grossProfit: Number(d.grossProfit),
      foodCostPercentage: Number(d.foodCostPercentage),
    })),
    worstByCost: worstByCost.map((d: DishSelect) => ({
      id: d.id,
      name: d.name,
      foodCostPercentage: Number(d.foodCostPercentage),
      totalCost: Number(d.totalCost),
    })),
    allDishes,
    alerts,
    invoiceAlertCount,
    recentInvoices: recentInvoices.map((inv) => ({
      id: inv.id,
      supplierName: inv.supplier?.name ?? "Unknown",
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount ? Number(inv.totalAmount) : null,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    })),
  }
}
