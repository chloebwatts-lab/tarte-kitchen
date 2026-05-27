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
  // Data quality
  unmatchedProductCount: number // products in category report with no dish cost match
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

  const venueFilter =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: venue as Venue }

  // DailySales (per-item POS sync) is often empty; use DailyCategoryTopItem
  // which is populated from the daily Lightspeed PDF email reports.
  const [topItemRows, allDishes] = await Promise.all([
    db.dailyCategoryTopItem.findMany({
      where: { ...venueFilter, date: { gte: start } },
      select: { productName: true, quantity: true },
    }),
    db.dish.findMany({
      where: { isActive: true },
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
    }),
  ])

  // Aggregate quantity by normalised product name across all matched rows
  const qtyByName = new Map<string, number>()
  for (const row of topItemRows) {
    const key = row.productName.toLowerCase().trim()
    qtyByName.set(key, (qtyByName.get(key) ?? 0) + row.quantity)
  }

  const emptyQuadrants = (): MenuEngineeringData["quadrants"] => ({
    STAR: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    PLOWHORSE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    PUZZLE: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
    DOG: { count: 0, unitsSold: 0, revenueExGst: 0, profitContribution: 0 },
  })

  if (qtyByName.size === 0) {
    return {
      rangeDays, venue,
      popularityThreshold: 0, profitThreshold: 0,
      quadrants: emptyQuadrants(),
      totalUnitsSold: 0, totalRevenueExGst: 0, totalProfitContribution: 0,
      items: [], unmatchedProductCount: 0,
    }
  }

  // Build name → dish map; for a specific venue, prefer that venue's dish entry
  const dishByNormName = new Map<string, typeof allDishes[0]>()
  for (const dish of allDishes) {
    const key = dish.name.toLowerCase().trim()
    const existing = dishByNormName.get(key)
    if (!existing || (venue !== "ALL" && dish.venue === venue)) {
      dishByNormName.set(key, dish)
    }
  }

  // Match product names → dishes; track unmatched for data-quality display
  let unmatchedProductCount = 0
  const rawItems = []
  for (const [nameKey, qty] of qtyByName) {
    if (qty <= 0) continue
    const dish = dishByNormName.get(nameKey)
    if (!dish || Number(dish.sellingPriceExGst) === 0) {
      unmatchedProductCount++
      continue
    }
    const grossProfitPerUnit = Number(dish.grossProfit)
    // Revenue estimated from dish selling price × units sold (no line-item revenue in source)
    const revenueExGst = Number(dish.sellingPriceExGst) * qty
    rawItems.push({
      dishId: dish.id,
      name: dish.name,
      menuCategory: dish.menuCategory,
      venue: dish.venue,
      sellingPrice: Number(dish.sellingPrice),
      sellingPriceExGst: Number(dish.sellingPriceExGst),
      totalCost: Number(dish.totalCost),
      foodCostPct: Number(dish.foodCostPercentage),
      grossProfitPerUnit,
      unitsSold: qty,
      revenueExGst: Math.round(revenueExGst * 100) / 100,
      profitContribution: Math.round(grossProfitPerUnit * qty * 100) / 100,
    })
  }

  if (rawItems.length === 0) {
    return {
      rangeDays, venue,
      popularityThreshold: 0, profitThreshold: 0,
      quadrants: emptyQuadrants(),
      totalUnitsSold: 0, totalRevenueExGst: 0, totalProfitContribution: 0,
      items: [], unmatchedProductCount,
    }
  }

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
    unmatchedProductCount,
  }
}
