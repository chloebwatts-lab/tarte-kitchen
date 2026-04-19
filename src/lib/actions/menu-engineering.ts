"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

export type MenuQuadrant = "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG"

export interface MenuEngineeringItem {
  dishId: string
  name: string
  menuCategory: string
  venue: string
  sellingPrice: number
  sellingPriceExGst: number
  totalCost: number
  foodCostPct: number
  grossProfitPerUnit: number
  unitsSold: number
  revenueExGst: number
  profitContribution: number
  quadrant: MenuQuadrant
}

export interface MenuEngineeringData {
  rangeDays: number
  venue: Venue | "ALL"
  // Classification thresholds (medians)
  popularityThreshold: number
  profitThreshold: number
  // Per-quadrant summaries
  quadrants: Record<
    MenuQuadrant,
    {
      count: number
      unitsSold: number
      revenueExGst: number
      profitContribution: number
    }
  >
  // Rollups
  totalUnitsSold: number
  totalRevenueExGst: number
  totalProfitContribution: number
  // Every dish with sales in range
  items: MenuEngineeringItem[]
}

const QUADRANT_ORDER: MenuQuadrant[] = ["STAR", "PLOWHORSE", "PUZZLE", "DOG"]

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  aestNow.setUTCHours(0, 0, 0, 0)
  aestNow.setUTCDate(aestNow.getUTCDate() - offsetDays)
  return new Date(aestNow.toISOString().split("T")[0])
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export async function getMenuEngineeringData(params: {
  venue: Venue | "ALL"
  rangeDays: number
}): Promise<MenuEngineeringData> {
  const { venue, rangeDays } = params
  const start = startOfAestDay(rangeDays)

  const venueFilter: { venue?: { in: Venue[] } } =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: { in: [venue] } }

  // Only dishes that have been sold in the range are classified. Unsold
  // dishes have no popularity signal and would bias the medians toward zero.
  const salesRows = await db.dailySales.groupBy({
    by: ["dishId"],
    where: {
      ...venueFilter,
      date: { gte: start },
      dishId: { not: null },
    },
    _sum: { quantitySold: true, revenueExGst: true },
  })

  const dishIds = salesRows
    .map((r) => r.dishId)
    .filter((id): id is string => !!id)

  if (dishIds.length === 0) {
    const empty: MenuEngineeringData["quadrants"] = {
      STAR: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
      PLOWHORSE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
      PUZZLE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
      DOG: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    }
    return {
      rangeDays,
      venue,
      popularityThreshold: 0,
      profitThreshold: 0,
      quadrants: empty,
      totalUnitsSold: 0,
      totalRevenueExGst: 0,
      totalProfitContribution: 0,
      items: [],
    }
  }

  const dishes = await db.dish.findMany({
    where: { id: { in: dishIds }, isActive: true },
    select: {
      id: true,
      name: true,
      menuCategory: true,
      venue: true,
      sellingPrice: true,
      sellingPriceExGst: true,
      totalCost: true,
      foodCostPercentage: true,
      grossProfit: true,
    },
  })
  const dishMap = new Map(dishes.map((d) => [d.id, d]))

  // First pass: build per-dish aggregate (units sold + revenue + profit contribution)
  const rawItems = salesRows
    .map((r) => {
      if (!r.dishId) return null
      const dish = dishMap.get(r.dishId)
      if (!dish) return null

      const unitsSold = r._sum.quantitySold ?? 0
      const revenueExGst = Number(r._sum.revenueExGst ?? 0)
      const grossProfitPerUnit = Number(dish.grossProfit)
      const profitContribution = grossProfitPerUnit * unitsSold

      return {
        dishId: dish.id,
        name: dish.name,
        menuCategory: dish.menuCategory,
        venue: dish.venue,
        sellingPrice: Number(dish.sellingPrice),
        sellingPriceExGst: Number(dish.sellingPriceExGst),
        totalCost: Number(dish.totalCost),
        foodCostPct: Number(dish.foodCostPercentage),
        grossProfitPerUnit,
        unitsSold,
        revenueExGst: Math.round(revenueExGst * 100) / 100,
        profitContribution: Math.round(profitContribution * 100) / 100,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => x.unitsSold > 0)

  // Compute medians for the two axes:
  //   X axis — popularity (unitsSold)
  //   Y axis — contribution margin (grossProfitPerUnit)
  // Using medians is the standard menu-engineering approach (Kasavana &
  // Smith, 1982) because it splits the menu into equal-sized quadrants and
  // is robust against outliers.
  const popularityThreshold = median(rawItems.map((i) => i.unitsSold))
  const profitThreshold = median(rawItems.map((i) => i.grossProfitPerUnit))

  const items: MenuEngineeringItem[] = rawItems.map((i) => {
    const highPop = i.unitsSold >= popularityThreshold
    const highProfit = i.grossProfitPerUnit >= profitThreshold
    let quadrant: MenuQuadrant
    if (highPop && highProfit) quadrant = "STAR"
    else if (highPop && !highProfit) quadrant = "PLOWHORSE"
    else if (!highPop && highProfit) quadrant = "PUZZLE"
    else quadrant = "DOG"
    return { ...i, quadrant }
  })

  const quadrants: MenuEngineeringData["quadrants"] = {
    STAR: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    PLOWHORSE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    PUZZLE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    DOG: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
  }
  for (const q of QUADRANT_ORDER) {
    const group = items.filter((i) => i.quadrant === q)
    quadrants[q] = {
      count: group.length,
      unitsSold: group.reduce((s, i) => s + i.unitsSold, 0),
      revenueExGst:
        Math.round(group.reduce((s, i) => s + i.revenueExGst, 0) * 100) / 100,
      profitContribution:
        Math.round(
          group.reduce((s, i) => s + i.profitContribution, 0) * 100
        ) / 100,
    }
  }

  return {
    rangeDays,
    venue,
    popularityThreshold: Math.round(popularityThreshold * 100) / 100,
    profitThreshold: Math.round(profitThreshold * 100) / 100,
    quadrants,
    totalUnitsSold: items.reduce((s, i) => s + i.unitsSold, 0),
    totalRevenueExGst:
      Math.round(items.reduce((s, i) => s + i.revenueExGst, 0) * 100) / 100,
    totalProfitContribution:
      Math.round(items.reduce((s, i) => s + i.profitContribution, 0) * 100) /
      100,
    items: items.sort((a, b) => b.profitContribution - a.profitContribution),
  }
}
