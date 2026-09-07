"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { MenuCategory } from "@/generated/prisma/client"
import { DEFAULT_TARGET_FOOD_COST_PCT, recommend } from "@/lib/menu-pricing"
import { updateDishQuick } from "./dishes"

export type CategoryTargets = Record<MenuCategory, number>

/** Defaults overlaid with whatever has been saved. */
export async function getCategoryTargets(): Promise<CategoryTargets> {
  const rows = await db.menuCategoryTarget.findMany()
  const out: CategoryTargets = { ...DEFAULT_TARGET_FOOD_COST_PCT }
  for (const r of rows) out[r.category] = Number(r.targetFoodCostPct)
  return out
}

export async function setCategoryTarget(category: MenuCategory, targetFoodCostPct: number) {
  if (!(targetFoodCostPct > 0) || targetFoodCostPct >= 100) {
    return { ok: false as const, reason: "Target must be between 0 and 100" }
  }
  await db.menuCategoryTarget.upsert({
    where: { category },
    create: { category, targetFoodCostPct },
    update: { targetFoodCostPct },
  })
  revalidatePath("/dishes")
  revalidatePath("/menu-engineering")
  return { ok: true as const }
}

/**
 * Write the recommended price onto the dish. Goes through updateDishQuick
 * so food cost % and gross profit are recomputed the same way an inline
 * edit would.
 */
export async function applyRecommendedPrice(dishId: string) {
  const dish = await db.dish.findUnique({
    where: { id: dishId },
    select: { totalCost: true, sellingPrice: true, foodCostPercentage: true, menuCategory: true },
  })
  if (!dish) return { ok: false as const, reason: "Dish not found" }
  const targets = await getCategoryTargets()
  const r = recommend(
    Number(dish.totalCost),
    Number(dish.sellingPrice),
    Number(dish.foodCostPercentage),
    targets[dish.menuCategory]
  )
  if (r.recommendedPrice === null) return { ok: false as const, reason: "Dish has no cost yet" }
  await updateDishQuick(dishId, { sellingPrice: r.recommendedPrice })
  revalidatePath("/menu-engineering")
  return { ok: true as const, price: r.recommendedPrice }
}
