"use server"

import { db } from "@/lib/db"
import type { Ingredient, Preparation } from "@/generated/prisma/client"

type IngredientSearchResult = Pick<Ingredient, "id" | "name" | "category" | "baseUnitType" | "purchasePrice" | "baseUnitsPerPurchase" | "wastePercentage">
type PrepSearchResult = Pick<Preparation, "id" | "name" | "category" | "batchCost" | "yieldQuantity" | "yieldUnit" | "yieldWeightGrams">

export async function globalSearch(query: string) {
  if (!query || query.length < 2) return { ingredients: [], preparations: [] }

  const [ingredients, preparations] = await Promise.all([
    db.ingredient.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        category: true,
        baseUnitType: true,
        purchasePrice: true,
        baseUnitsPerPurchase: true,
        wastePercentage: true,
      },
      take: 10,
      orderBy: { name: "asc" },
    }) as Promise<IngredientSearchResult[]>,
    db.preparation.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        category: true,
        batchCost: true,
        yieldQuantity: true,
        yieldUnit: true,
        yieldWeightGrams: true,
      },
      take: 10,
      orderBy: { name: "asc" },
    }) as Promise<PrepSearchResult[]>,
  ])

  return {
    ingredients: ingredients.map((i: IngredientSearchResult) => ({
      ...i,
      purchasePrice: Number(i.purchasePrice),
      baseUnitsPerPurchase: Number(i.baseUnitsPerPurchase),
      wastePercentage: Number(i.wastePercentage),
    })),
    preparations: preparations.map((p: PrepSearchResult) => ({
      ...p,
      batchCost: Number(p.batchCost),
      yieldQuantity: Number(p.yieldQuantity),
      yieldWeightGrams: Number(p.yieldWeightGrams),
    })),
  }
}
