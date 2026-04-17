"use server"

import { db } from "@/lib/db"
import type { Dish, PriceHistory, Ingredient } from "@/generated/prisma/client"

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
      supplierName: inv.supplier.name,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount ? Number(inv.totalAmount) : null,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    })),
  }
}
