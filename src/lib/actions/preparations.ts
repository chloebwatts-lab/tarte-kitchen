"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import {
  costPerBaseUnit,
  toBaseUnits,
  preparationLineCost as calcPrepLineCost,
} from "@/lib/units"
import type { Preparation, PreparationItem, Ingredient } from "@/generated/prisma/client"

type PrepItemWithRefs = PreparationItem & {
  ingredient: Ingredient | null
  subPreparation: Preparation | null
}
type PrepWithItems = Preparation & { items: PrepItemWithRefs[] }

export async function getPreparations(filters?: {
  search?: string
  category?: string
}) {
  const where: Record<string, unknown> = {}

  if (filters?.search) {
    where.name = { contains: filters.search, mode: "insensitive" }
  }

  if (filters?.category && filters.category !== "ALL") {
    where.category = filters.category
  }

  const preparations = await db.preparation.findMany({
    where,
    include: {
      items: {
        include: { ingredient: true, subPreparation: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  }) as PrepWithItems[]

  return preparations.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    method: p.method,
    yieldQuantity: Number(p.yieldQuantity),
    yieldUnit: p.yieldUnit,
    yieldWeightGrams: Number(p.yieldWeightGrams),
    batchCost: Number(p.batchCost),
    costPerGram: Number(p.costPerGram),
    costPerServe: Number(p.costPerServe),
    items: p.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredient: item.ingredient
        ? {
            id: item.ingredient.id,
            name: item.ingredient.name,
            category: item.ingredient.category,
            baseUnitType: item.ingredient.baseUnitType,
            purchasePrice: Number(item.ingredient.purchasePrice),
            baseUnitsPerPurchase: Number(item.ingredient.baseUnitsPerPurchase),
            wastePercentage: Number(item.ingredient.wastePercentage),
          }
        : null,
      subPreparationId: item.subPreparationId,
      subPreparation: item.subPreparation
        ? {
            id: item.subPreparation.id,
            name: item.subPreparation.name,
            category: item.subPreparation.category,
            batchCost: Number(item.subPreparation.batchCost),
            yieldQuantity: Number(item.subPreparation.yieldQuantity),
            yieldUnit: item.subPreparation.yieldUnit,
            yieldWeightGrams: Number(item.subPreparation.yieldWeightGrams),
          }
        : null,
      quantity: Number(item.quantity),
      unit: item.unit,
      lineCost: Number(item.lineCost),
      sortOrder: item.sortOrder,
    })),
  }))
}

export async function getPreparation(id: string) {
  const p = await db.preparation.findUnique({
    where: { id },
    include: {
      items: {
        include: { ingredient: true, subPreparation: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  }) as PrepWithItems | null
  if (!p) return null

  return {
    id: p.id,
    name: p.name,
    category: p.category,
    method: p.method,
    yieldQuantity: Number(p.yieldQuantity),
    yieldUnit: p.yieldUnit,
    yieldWeightGrams: Number(p.yieldWeightGrams),
    batchCost: Number(p.batchCost),
    costPerGram: Number(p.costPerGram),
    costPerServe: Number(p.costPerServe),
    items: p.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredient: item.ingredient
        ? {
            id: item.ingredient.id,
            name: item.ingredient.name,
            category: item.ingredient.category,
            baseUnitType: item.ingredient.baseUnitType,
            purchasePrice: Number(item.ingredient.purchasePrice),
            baseUnitsPerPurchase: Number(item.ingredient.baseUnitsPerPurchase),
            wastePercentage: Number(item.ingredient.wastePercentage),
          }
        : null,
      subPreparationId: item.subPreparationId,
      subPreparation: item.subPreparation
        ? {
            id: item.subPreparation.id,
            name: item.subPreparation.name,
            category: item.subPreparation.category,
            batchCost: Number(item.subPreparation.batchCost),
            yieldQuantity: Number(item.subPreparation.yieldQuantity),
            yieldUnit: item.subPreparation.yieldUnit,
            yieldWeightGrams: Number(item.subPreparation.yieldWeightGrams),
          }
        : null,
      quantity: Number(item.quantity),
      unit: item.unit,
      lineCost: Number(item.lineCost),
      sortOrder: item.sortOrder,
    })),
  }
}

export async function createPreparation(data: {
  name: string
  category: string
  method?: string
  yieldQuantity: number
  yieldUnit: string
  yieldWeightGrams: number
  items: Array<{
    ingredientId?: string | null
    subPreparationId?: string | null
    quantity: number
    unit: string
    sortOrder: number
  }>
}) {
  const ingredientIds = data.items.filter((i) => i.ingredientId).map((i) => i.ingredientId!)
  const prepIds = data.items.filter((i) => i.subPreparationId).map((i) => i.subPreparationId!)

  const [ingredients, subPreps] = await Promise.all([
    ingredientIds.length > 0
      ? db.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : Promise.resolve([]),
    prepIds.length > 0
      ? db.preparation.findMany({ where: { id: { in: prepIds } } })
      : Promise.resolve([]),
  ]) as [Ingredient[], Preparation[]]

  const ingredientMap = new Map(ingredients.map((i: Ingredient) => [i.id, i]))
  const prepMap = new Map(subPreps.map((p: Preparation) => [p.id, p]))

  let batchCost = new Decimal(0)

  const itemsWithCost = data.items.map((item) => {
    let lineCost = new Decimal(0)

    if (item.ingredientId) {
      const ing = ingredientMap.get(item.ingredientId)
      if (ing) {
        const cpbu = costPerBaseUnit({
          purchasePrice: new Decimal(String(ing.purchasePrice)),
          baseUnitsPerPurchase: new Decimal(String(ing.baseUnitsPerPurchase)),
          wastePercentage: new Decimal(String(ing.wastePercentage)),
        })
        const baseQty = toBaseUnits(item.quantity, item.unit)
        lineCost = baseQty.mul(cpbu).toDecimalPlaces(4)
      }
    } else if (item.subPreparationId) {
      const prep = prepMap.get(item.subPreparationId)
      if (prep) {
        lineCost = calcPrepLineCost(
          item.quantity,
          item.unit,
          Number(prep.batchCost),
          Number(prep.yieldQuantity),
          prep.yieldUnit,
          Number(prep.yieldWeightGrams)
        ).toDecimalPlaces(4)
      }
    }

    batchCost = batchCost.plus(lineCost)

    return {
      ingredientId: item.ingredientId || undefined,
      subPreparationId: item.subPreparationId || undefined,
      quantity: item.quantity,
      unit: item.unit,
      sortOrder: item.sortOrder,
      lineCost: Number(lineCost),
    }
  })

  const yieldGrams = new Decimal(data.yieldWeightGrams)
  const yieldQty = new Decimal(data.yieldQuantity)
  const costPerGram = yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)
  const costPerServe = yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)

  const preparation = await db.preparation.create({
    data: {
      name: data.name,
      category: data.category as "SAUCE",
      method: data.method || null,
      yieldQuantity: data.yieldQuantity,
      yieldUnit: data.yieldUnit,
      yieldWeightGrams: data.yieldWeightGrams,
      batchCost: Number(batchCost.toDecimalPlaces(2)),
      costPerGram: Number(costPerGram.toDecimalPlaces(4)),
      costPerServe: Number(costPerServe.toDecimalPlaces(2)),
      items: {
        create: itemsWithCost,
      },
    },
  })

  revalidatePath("/preparations")
  revalidatePath("/dashboard")
  return preparation.id
}

export async function updatePreparation(
  id: string,
  data: {
    name: string
    category: string
    method?: string
    yieldQuantity: number
    yieldUnit: string
    yieldWeightGrams: number
    items: Array<{
      ingredientId?: string | null
      subPreparationId?: string | null
      quantity: number
      unit: string
      sortOrder: number
    }>
  }
) {
  await db.preparationItem.deleteMany({ where: { preparationId: id } })

  const ingredientIds = data.items.filter((i) => i.ingredientId).map((i) => i.ingredientId!)
  const prepIds = data.items.filter((i) => i.subPreparationId).map((i) => i.subPreparationId!)

  const [ingredients, subPreps] = await Promise.all([
    ingredientIds.length > 0
      ? db.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : Promise.resolve([]),
    prepIds.length > 0
      ? db.preparation.findMany({ where: { id: { in: prepIds } } })
      : Promise.resolve([]),
  ]) as [Ingredient[], Preparation[]]

  const ingredientMap = new Map(ingredients.map((i: Ingredient) => [i.id, i]))
  const prepMap = new Map(subPreps.map((p: Preparation) => [p.id, p]))

  let batchCost = new Decimal(0)

  const itemsWithCost = data.items.map((item) => {
    let lineCost = new Decimal(0)

    if (item.ingredientId) {
      const ing = ingredientMap.get(item.ingredientId)
      if (ing) {
        const cpbu = costPerBaseUnit({
          purchasePrice: new Decimal(String(ing.purchasePrice)),
          baseUnitsPerPurchase: new Decimal(String(ing.baseUnitsPerPurchase)),
          wastePercentage: new Decimal(String(ing.wastePercentage)),
        })
        const baseQty = toBaseUnits(item.quantity, item.unit)
        lineCost = baseQty.mul(cpbu).toDecimalPlaces(4)
      }
    } else if (item.subPreparationId) {
      const prep = prepMap.get(item.subPreparationId)
      if (prep) {
        lineCost = calcPrepLineCost(
          item.quantity,
          item.unit,
          Number(prep.batchCost),
          Number(prep.yieldQuantity),
          prep.yieldUnit,
          Number(prep.yieldWeightGrams)
        ).toDecimalPlaces(4)
      }
    }

    batchCost = batchCost.plus(lineCost)

    return {
      preparationId: id,
      ingredientId: item.ingredientId || undefined,
      subPreparationId: item.subPreparationId || undefined,
      quantity: item.quantity,
      unit: item.unit,
      sortOrder: item.sortOrder,
      lineCost: Number(lineCost),
    }
  })

  const yieldGrams = new Decimal(data.yieldWeightGrams)
  const yieldQty = new Decimal(data.yieldQuantity)
  const cPerGram = yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)
  const cPerServe = yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)

  await db.preparation.update({
    where: { id },
    data: {
      name: data.name,
      category: data.category as "SAUCE",
      method: data.method || null,
      yieldQuantity: data.yieldQuantity,
      yieldUnit: data.yieldUnit,
      yieldWeightGrams: data.yieldWeightGrams,
      batchCost: Number(batchCost.toDecimalPlaces(2)),
      costPerGram: Number(cPerGram.toDecimalPlaces(4)),
      costPerServe: Number(cPerServe.toDecimalPlaces(2)),
      items: {
        create: itemsWithCost,
      },
    },
  })

  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return id
}

export async function deletePreparation(id: string) {
  await db.preparation.delete({ where: { id } })
  revalidatePath("/preparations")
  revalidatePath("/dashboard")
  return true
}
