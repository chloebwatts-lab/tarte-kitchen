"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import {
  ingredientLineCost,
  preparationLineCost as calcPrepLineCost,
} from "@/lib/units"
import type { BaseUnitType } from "@/lib/units"
import { recalculateFromPreparation, recalculateDishesById } from "@/lib/actions/ingredients"
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
            gramsPerUnit: item.ingredient.gramsPerUnit != null ? Number(item.ingredient.gramsPerUnit) : null,
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
            gramsPerUnit: item.ingredient.gramsPerUnit != null ? Number(item.ingredient.gramsPerUnit) : null,
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
        lineCost = ingredientLineCost(item.quantity, item.unit, {
          purchasePrice: new Decimal(String(ing.purchasePrice)),
          baseUnitsPerPurchase: new Decimal(String(ing.baseUnitsPerPurchase)),
          wastePercentage: new Decimal(String(ing.wastePercentage)),
          baseUnitType: ing.baseUnitType as BaseUnitType,
          gramsPerUnit: ing.gramsPerUnit ? new Decimal(String(ing.gramsPerUnit)) : null,
        }).toDecimalPlaces(4)
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
    },
  })

  if (itemsWithCost.length > 0) {
    await db.preparationItem.createMany({
      data: itemsWithCost.map((item) => ({ ...item, preparationId: preparation.id })),
    })
  }

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
        lineCost = ingredientLineCost(item.quantity, item.unit, {
          purchasePrice: new Decimal(String(ing.purchasePrice)),
          baseUnitsPerPurchase: new Decimal(String(ing.baseUnitsPerPurchase)),
          wastePercentage: new Decimal(String(ing.wastePercentage)),
          baseUnitType: ing.baseUnitType as BaseUnitType,
          gramsPerUnit: ing.gramsPerUnit ? new Decimal(String(ing.gramsPerUnit)) : null,
        }).toDecimalPlaces(4)
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

  // One transaction: a failure after deleteMany used to permanently wipe
  // the recipe's line items.
  await db.$transaction(async (tx) => {
    await tx.preparationItem.deleteMany({ where: { preparationId: id } })
    await tx.preparation.update({
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
      },
    })
    if (itemsWithCost.length > 0) {
      await tx.preparationItem.createMany({ data: itemsWithCost })
    }
  })

  // Cascade: parent preps that contain this prep, and every dish that
  // plates it, all depend on the new batchCost/yield fields.
  await recalculateFromPreparation(id)

  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return id
}

/**
 * Lightweight update for yield fields, recalculates costPerGram/costPerServe
 * and cascades to downstream dishes.
 */
export async function updatePreparationQuick(
  id: string,
  data: {
    yieldQuantity?: number
    yieldUnit?: string
    yieldWeightGrams?: number
  }
) {
  const current = await db.preparation.findUnique({ where: { id } })
  if (!current) throw new Error("Preparation not found")

  const updateData: Record<string, unknown> = {}
  const batchCost = new Decimal(String(current.batchCost))

  const yieldQty = data.yieldQuantity !== undefined ? data.yieldQuantity : Number(current.yieldQuantity)
  const yieldGrams = data.yieldWeightGrams !== undefined ? data.yieldWeightGrams : Number(current.yieldWeightGrams)

  if (data.yieldQuantity !== undefined) updateData.yieldQuantity = data.yieldQuantity
  if (data.yieldUnit !== undefined) updateData.yieldUnit = data.yieldUnit
  if (data.yieldWeightGrams !== undefined) updateData.yieldWeightGrams = data.yieldWeightGrams

  // Recalculate derived fields
  const costPerGram = yieldGrams > 0 ? batchCost.div(yieldGrams) : new Decimal(0)
  const costPerServe = yieldQty > 0 ? batchCost.div(yieldQty) : new Decimal(0)
  updateData.costPerGram = Number(costPerGram.toDecimalPlaces(4))
  updateData.costPerServe = Number(costPerServe.toDecimalPlaces(2))

  await db.preparation.update({ where: { id }, data: updateData })

  // Canonical cascade: recosts this prep's lines, parent preps that
  // contain it, and every affected dish via the shared units.ts math.
  // (The old hand-rolled version here skipped parent preps entirely.)
  await recalculateFromPreparation(id)

  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return id
}

export async function deletePreparation(id: string) {
  // Capture referencing lines before delete: SetNull would leave orphan
  // rows whose cached lineCost stays inside parent batch/dish totals.
  const parentItems = await db.preparationItem.findMany({
    where: { subPreparationId: id },
    select: { id: true, preparationId: true },
  })
  const dishComps = await db.dishComponent.findMany({
    where: { preparationId: id },
    select: { id: true, dishId: true },
  })

  await db.preparation.delete({ where: { id } })

  if (parentItems.length > 0) {
    await db.preparationItem.deleteMany({
      where: { id: { in: parentItems.map((pi) => pi.id) } },
    })
  }
  if (dishComps.length > 0) {
    await db.dishComponent.deleteMany({
      where: { id: { in: dishComps.map((dc) => dc.id) } },
    })
  }

  const parentPrepIds = [...new Set(parentItems.map((pi) => pi.preparationId))]
  for (const prepId of parentPrepIds) {
    await recalculateFromPreparation(prepId)
  }
  const dishIds = [...new Set(dishComps.map((dc) => dc.dishId))]
  if (dishIds.length > 0) {
    await recalculateDishesById(dishIds)
  }

  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return true
}
