"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import {
  costPerBaseUnit,
  toBaseUnits,
  preparationLineCost as calcPrepLineCost,
  exGst,
  foodCostPercentage,
} from "@/lib/units"
import type { Dish, DishComponent, Ingredient, Preparation } from "@/generated/prisma/client"

type DishComponentWithRefs = DishComponent & {
  ingredient: Ingredient | null
  preparation: Preparation | null
}
type DishWithComponents = Dish & { components: DishComponentWithRefs[] }

function serializeDish(d: DishWithComponents) {
  return {
    id: d.id,
    name: d.name,
    menuCategory: d.menuCategory,
    venue: d.venue,
    sellingPrice: Number(d.sellingPrice),
    sellingPriceExGst: Number(d.sellingPriceExGst),
    totalCost: Number(d.totalCost),
    foodCostPercentage: Number(d.foodCostPercentage),
    grossProfit: Number(d.grossProfit),
    popularity: d.popularity,
    notes: d.notes,
    isActive: d.isActive,
    components: d.components.map((c) => ({
      id: c.id,
      ingredientId: c.ingredientId,
      ingredient: c.ingredient
        ? {
            id: c.ingredient.id,
            name: c.ingredient.name,
            category: c.ingredient.category,
            baseUnitType: c.ingredient.baseUnitType,
            purchasePrice: Number(c.ingredient.purchasePrice),
            baseUnitsPerPurchase: Number(c.ingredient.baseUnitsPerPurchase),
            wastePercentage: Number(c.ingredient.wastePercentage),
          }
        : null,
      preparationId: c.preparationId,
      preparation: c.preparation
        ? {
            id: c.preparation.id,
            name: c.preparation.name,
            category: c.preparation.category,
            batchCost: Number(c.preparation.batchCost),
            yieldQuantity: Number(c.preparation.yieldQuantity),
            yieldUnit: c.preparation.yieldUnit,
            yieldWeightGrams: Number(c.preparation.yieldWeightGrams),
          }
        : null,
      quantity: Number(c.quantity),
      unit: c.unit,
      lineCost: Number(c.lineCost),
      sortOrder: c.sortOrder,
    })),
  }
}

export async function getDishes(filters?: {
  search?: string
  menuCategory?: string
  venue?: string
}) {
  const where: Record<string, unknown> = {}

  if (filters?.search) {
    where.name = { contains: filters.search, mode: "insensitive" }
  }

  if (filters?.menuCategory && filters.menuCategory !== "ALL") {
    where.menuCategory = filters.menuCategory
  }

  if (filters?.venue && filters.venue !== "ALL") {
    where.venue = filters.venue
  }

  const dishes = await db.dish.findMany({
    where,
    include: {
      components: {
        include: { ingredient: true, preparation: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  }) as DishWithComponents[]

  return dishes.map(serializeDish)
}

export async function getDish(id: string) {
  const d = await db.dish.findUnique({
    where: { id },
    include: {
      components: {
        include: { ingredient: true, preparation: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  }) as DishWithComponents | null
  if (!d) return null
  return serializeDish(d)
}

function computeComponentCosts(
  components: Array<{
    ingredientId?: string | null
    preparationId?: string | null
    quantity: number
    unit: string
    sortOrder: number
  }>,
  ingredientMap: Map<string, Ingredient>,
  prepMap: Map<string, Preparation>
) {
  let totalCost = new Decimal(0)

  const compsWithCost = components.map((comp) => {
    let lineCost = new Decimal(0)

    if (comp.ingredientId) {
      const ing = ingredientMap.get(comp.ingredientId)
      if (ing) {
        const cpbu = costPerBaseUnit({
          purchasePrice: new Decimal(String(ing.purchasePrice)),
          baseUnitsPerPurchase: new Decimal(String(ing.baseUnitsPerPurchase)),
          wastePercentage: new Decimal(String(ing.wastePercentage)),
        })
        const baseQty = toBaseUnits(comp.quantity, comp.unit)
        lineCost = baseQty.mul(cpbu).toDecimalPlaces(4)
      }
    } else if (comp.preparationId) {
      const prep = prepMap.get(comp.preparationId)
      if (prep) {
        lineCost = calcPrepLineCost(
          comp.quantity,
          comp.unit,
          Number(prep.batchCost),
          Number(prep.yieldQuantity),
          prep.yieldUnit,
          Number(prep.yieldWeightGrams)
        ).toDecimalPlaces(4)
      }
    }

    totalCost = totalCost.plus(lineCost)

    return {
      ingredientId: comp.ingredientId || undefined,
      preparationId: comp.preparationId || undefined,
      quantity: comp.quantity,
      unit: comp.unit,
      sortOrder: comp.sortOrder,
      lineCost: Number(lineCost),
    }
  })

  return { compsWithCost, totalCost }
}

async function fetchMaps(components: Array<{ ingredientId?: string | null; preparationId?: string | null }>) {
  const ingredientIds = components.filter((c) => c.ingredientId).map((c) => c.ingredientId!)
  const prepIds = components.filter((c) => c.preparationId).map((c) => c.preparationId!)

  const [ingredients, preparations] = await Promise.all([
    ingredientIds.length > 0
      ? db.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : Promise.resolve([]),
    prepIds.length > 0
      ? db.preparation.findMany({ where: { id: { in: prepIds } } })
      : Promise.resolve([]),
  ]) as [Ingredient[], Preparation[]]

  return {
    ingredientMap: new Map(ingredients.map((i: Ingredient) => [i.id, i])),
    prepMap: new Map(preparations.map((p: Preparation) => [p.id, p])),
  }
}

export async function createDish(data: {
  name: string
  menuCategory: string
  venue: string
  sellingPrice: number
  notes?: string
  components: Array<{
    ingredientId?: string | null
    preparationId?: string | null
    quantity: number
    unit: string
    sortOrder: number
  }>
}) {
  const { ingredientMap, prepMap } = await fetchMaps(data.components)
  const { compsWithCost, totalCost } = computeComponentCosts(data.components, ingredientMap, prepMap)

  const sellingPriceExGst = exGst(data.sellingPrice)
  const fcPct = foodCostPercentage(totalCost, data.sellingPrice)
  const gp = sellingPriceExGst.minus(totalCost)

  const dish = await db.dish.create({
    data: {
      name: data.name,
      menuCategory: data.menuCategory as "BREAKFAST",
      venue: data.venue as "BOTH",
      sellingPrice: data.sellingPrice,
      sellingPriceExGst: Number(sellingPriceExGst.toDecimalPlaces(2)),
      totalCost: Number(totalCost.toDecimalPlaces(2)),
      foodCostPercentage: Number(fcPct.toDecimalPlaces(1)),
      grossProfit: Number(gp.toDecimalPlaces(2)),
      notes: data.notes || null,
      components: {
        create: compsWithCost,
      },
    },
  })

  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return dish.id
}

export async function updateDish(
  id: string,
  data: {
    name: string
    menuCategory: string
    venue: string
    sellingPrice: number
    notes?: string
    components: Array<{
      ingredientId?: string | null
      preparationId?: string | null
      quantity: number
      unit: string
      sortOrder: number
    }>
  }
) {
  await db.dishComponent.deleteMany({ where: { dishId: id } })

  const { ingredientMap, prepMap } = await fetchMaps(data.components)
  const { compsWithCost, totalCost } = computeComponentCosts(data.components, ingredientMap, prepMap)

  const sellingPriceExGst = exGst(data.sellingPrice)
  const fcPct = foodCostPercentage(totalCost, data.sellingPrice)
  const gp = sellingPriceExGst.minus(totalCost)

  const compsWithDishId = compsWithCost.map((c) => ({ ...c, dishId: id }))

  await db.dish.update({
    where: { id },
    data: {
      name: data.name,
      menuCategory: data.menuCategory as "BREAKFAST",
      venue: data.venue as "BOTH",
      sellingPrice: data.sellingPrice,
      sellingPriceExGst: Number(sellingPriceExGst.toDecimalPlaces(2)),
      totalCost: Number(totalCost.toDecimalPlaces(2)),
      foodCostPercentage: Number(fcPct.toDecimalPlaces(1)),
      grossProfit: Number(gp.toDecimalPlaces(2)),
      notes: data.notes || null,
      components: {
        create: compsWithDishId,
      },
    },
  })

  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return id
}

export async function deleteDish(id: string) {
  await db.dish.delete({ where: { id } })
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return true
}
