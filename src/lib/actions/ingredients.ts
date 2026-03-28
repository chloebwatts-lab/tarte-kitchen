"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import type { Ingredient, Supplier, PriceHistory, SupplierPrice, PreparationItem, DishComponent, Preparation, Dish } from "@/generated/prisma/client"

type IngredientWithSupplier = Ingredient & { supplier: Supplier | null }
type IngredientFull = Ingredient & {
  supplier: Supplier | null
  priceHistory: PriceHistory[]
  supplierPrices: (SupplierPrice & { supplier: Supplier })[]
}

export async function getIngredients(filters?: {
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

  const ingredients = await db.ingredient.findMany({
    where,
    include: { supplier: true },
    orderBy: { name: "asc" },
  }) as IngredientWithSupplier[]

  return ingredients.map((i) => ({
    ...i,
    purchaseQuantity: Number(i.purchaseQuantity),
    purchasePrice: Number(i.purchasePrice),
    baseUnitsPerPurchase: Number(i.baseUnitsPerPurchase),
    gramsPerUnit: i.gramsPerUnit ? Number(i.gramsPerUnit) : null,
    wastePercentage: Number(i.wastePercentage),
    parLevel: i.parLevel ? Number(i.parLevel) : null,
  }))
}

export async function getIngredient(id: string) {
  const i = await db.ingredient.findUnique({
    where: { id },
    include: {
      supplier: true,
      priceHistory: { orderBy: { changedAt: "desc" }, take: 20 },
      supplierPrices: { include: { supplier: true } },
    },
  }) as IngredientFull | null
  if (!i) return null

  return {
    ...i,
    purchaseQuantity: Number(i.purchaseQuantity),
    purchasePrice: Number(i.purchasePrice),
    baseUnitsPerPurchase: Number(i.baseUnitsPerPurchase),
    gramsPerUnit: i.gramsPerUnit ? Number(i.gramsPerUnit) : null,
    wastePercentage: Number(i.wastePercentage),
    parLevel: i.parLevel ? Number(i.parLevel) : null,
    priceHistory: i.priceHistory.map((ph: PriceHistory) => ({
      ...ph,
      oldPrice: Number(ph.oldPrice),
      newPrice: Number(ph.newPrice),
      oldQuantity: ph.oldQuantity ? Number(ph.oldQuantity) : null,
    })),
    supplierPrices: i.supplierPrices.map((sp: SupplierPrice & { supplier: Supplier }) => ({
      ...sp,
      price: Number(sp.price),
      quantity: Number(sp.quantity),
    })),
  }
}

export async function createIngredient(data: {
  name: string
  category: string
  baseUnitType: string
  supplierId?: string | null
  supplierProductCode?: string | null
  purchaseQuantity: number
  purchaseUnit: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  gramsPerUnit?: number | null
  wastePercentage?: number
  parLevel?: number | null
  parUnit?: string | null
  notes?: string | null
}) {
  const ingredient = await db.ingredient.create({
    data: {
      name: data.name,
      category: data.category as "MEAT",
      baseUnitType: data.baseUnitType as "WEIGHT",
      supplierId: data.supplierId || null,
      supplierProductCode: data.supplierProductCode || null,
      purchaseQuantity: data.purchaseQuantity,
      purchaseUnit: data.purchaseUnit,
      purchasePrice: data.purchasePrice,
      baseUnitsPerPurchase: data.baseUnitsPerPurchase,
      gramsPerUnit: data.gramsPerUnit ?? null,
      wastePercentage: data.wastePercentage ?? 0,
      parLevel: data.parLevel ?? null,
      parUnit: data.parUnit || null,
      notes: data.notes || null,
    },
  })

  revalidatePath("/ingredients")
  revalidatePath("/dashboard")
  return ingredient.id
}

export async function updateIngredient(
  id: string,
  data: {
    name: string
    category: string
    baseUnitType: string
    supplierId?: string | null
    supplierProductCode?: string | null
    purchaseQuantity: number
    purchaseUnit: string
    purchasePrice: number
    baseUnitsPerPurchase: number
    gramsPerUnit?: number | null
    wastePercentage?: number
    parLevel?: number | null
    parUnit?: string | null
    notes?: string | null
  }
) {
  const current = await db.ingredient.findUnique({ where: { id } })
  if (!current) throw new Error("Ingredient not found")

  const oldPrice = Number(current.purchasePrice)
  const newPrice = data.purchasePrice

  if (oldPrice !== newPrice) {
    await db.priceHistory.create({
      data: {
        ingredientId: id,
        oldPrice: oldPrice,
        newPrice: newPrice,
        oldUnit: current.purchaseUnit,
        oldQuantity: Number(current.purchaseQuantity),
      },
    })
  }

  await db.ingredient.update({
    where: { id },
    data: {
      name: data.name,
      category: data.category as "MEAT",
      baseUnitType: data.baseUnitType as "WEIGHT",
      supplierId: data.supplierId || null,
      supplierProductCode: data.supplierProductCode || null,
      purchaseQuantity: data.purchaseQuantity,
      purchaseUnit: data.purchaseUnit,
      purchasePrice: data.purchasePrice,
      baseUnitsPerPurchase: data.baseUnitsPerPurchase,
      gramsPerUnit: data.gramsPerUnit ?? null,
      wastePercentage: data.wastePercentage ?? 0,
      parLevel: data.parLevel ?? null,
      parUnit: data.parUnit || null,
      notes: data.notes || null,
    },
  })

  await recalculateCascade(id)

  revalidatePath("/ingredients")
  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
  return id
}

export async function deleteIngredient(id: string) {
  await db.ingredient.delete({ where: { id } })
  revalidatePath("/ingredients")
  revalidatePath("/dashboard")
  return true
}

export async function bulkUpdatePrices(
  updates: Array<{ id: string; purchasePrice: number }>
) {
  for (const update of updates) {
    const current = await db.ingredient.findUnique({ where: { id: update.id } })
    if (!current) continue

    const oldPrice = Number(current.purchasePrice)
    if (oldPrice !== update.purchasePrice) {
      await db.priceHistory.create({
        data: {
          ingredientId: update.id,
          oldPrice: oldPrice,
          newPrice: update.purchasePrice,
          oldUnit: current.purchaseUnit,
          oldQuantity: Number(current.purchaseQuantity),
        },
      })

      await db.ingredient.update({
        where: { id: update.id },
        data: { purchasePrice: update.purchasePrice },
      })
    }
  }

  for (const update of updates) {
    await recalculateCascade(update.id)
  }

  revalidatePath("/ingredients")
  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
}

async function recalculateCascade(ingredientId: string) {
  const prepItems = await db.preparationItem.findMany({
    where: { ingredientId },
    select: { preparationId: true },
  }) as Pick<PreparationItem, "preparationId">[]

  const prepIds = [...new Set(prepItems.map((pi) => pi.preparationId))]

  for (const prepId of prepIds) {
    await recalculatePreparationCost(prepId)
  }

  const dishComps = await db.dishComponent.findMany({
    where: { ingredientId },
    select: { dishId: true },
  }) as Pick<DishComponent, "dishId">[]

  const dishCompsFromPreps = await db.dishComponent.findMany({
    where: { preparationId: { in: prepIds } },
    select: { dishId: true },
  }) as Pick<DishComponent, "dishId">[]

  const dishIds = [...new Set([
    ...dishComps.map((dc) => dc.dishId),
    ...dishCompsFromPreps.map((dc) => dc.dishId),
  ])]

  for (const dishId of dishIds) {
    await recalculateDishCost(dishId)
  }
}

const UNIT_MULT: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, oz: 28.3495, lb: 453.592 }
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])

type PrepWithItems = Preparation & {
  items: (PreparationItem & { ingredient: Ingredient | null; subPreparation: Preparation | null })[]
}

async function recalculatePreparationCost(prepId: string) {
  const prep = await db.preparation.findUnique({
    where: { id: prepId },
    include: {
      items: { include: { ingredient: true, subPreparation: true } },
    },
  }) as PrepWithItems | null
  if (!prep) return

  let batchCost = new Decimal(0)

  for (const item of prep.items) {
    let lineCost = new Decimal(0)

    if (item.ingredientId && item.ingredient) {
      const ing = item.ingredient
      const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
      const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
      const cpbu = usable.gt(0) ? new Decimal(String(ing.purchasePrice)).div(usable) : new Decimal(0)
      const unit = item.unit.toLowerCase()
      // Cross-unit: COUNT ingredient (ea/bunch) used by weight (g/kg) in the recipe
      if (ing.baseUnitType === "COUNT" && WEIGHT_UNITS.has(unit) && ing.gramsPerUnit) {
        const gramsInRecipe = new Decimal(String(item.quantity)).mul(UNIT_MULT[unit] ?? 1)
        const easUsed = gramsInRecipe.div(new Decimal(String(ing.gramsPerUnit)))
        lineCost = easUsed.mul(cpbu)
      } else {
        const baseQty = new Decimal(String(item.quantity)).mul(UNIT_MULT[unit] ?? 1)
        lineCost = baseQty.mul(cpbu)
      }
    } else if (item.subPreparationId && item.subPreparation) {
      const sub = item.subPreparation
      const q = new Decimal(String(item.quantity))
      const batch = new Decimal(String(sub.batchCost))

      if (item.unit.toLowerCase() === "serve") {
        const yieldQty = new Decimal(String(sub.yieldQuantity))
        lineCost = yieldQty.gt(0) ? q.div(yieldQty).mul(batch) : new Decimal(0)
      } else {
        const baseQty = q.mul(UNIT_MULT[item.unit.toLowerCase()] ?? 1)
        const yieldGrams = new Decimal(String(sub.yieldWeightGrams))
        lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(batch) : new Decimal(0)
      }
    }

    lineCost = lineCost.toDecimalPlaces(4)
    batchCost = batchCost.plus(lineCost)

    await db.preparationItem.update({
      where: { id: item.id },
      data: { lineCost: Number(lineCost) },
    })
  }

  const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
  const yieldQty = new Decimal(String(prep.yieldQuantity))
  const costPerGram = yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)
  const costPerServe = yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)

  await db.preparation.update({
    where: { id: prepId },
    data: {
      batchCost: Number(batchCost.toDecimalPlaces(2)),
      costPerGram: Number(costPerGram.toDecimalPlaces(4)),
      costPerServe: Number(costPerServe.toDecimalPlaces(2)),
    },
  })
}

type DishWithComps = Dish & {
  components: (DishComponent & { ingredient: Ingredient | null; preparation: Preparation | null })[]
}

async function recalculateDishCost(dishId: string) {
  const dish = await db.dish.findUnique({
    where: { id: dishId },
    include: {
      components: { include: { ingredient: true, preparation: true } },
    },
  }) as DishWithComps | null
  if (!dish) return

  let totalCost = new Decimal(0)

  for (const comp of dish.components) {
    let lineCost = new Decimal(0)

    if (comp.ingredientId && comp.ingredient) {
      const ing = comp.ingredient
      const wasteFactor = new Decimal(1).minus(new Decimal(String(ing.wastePercentage)).div(100))
      const usable = new Decimal(String(ing.baseUnitsPerPurchase)).mul(wasteFactor)
      const cpbu = usable.gt(0) ? new Decimal(String(ing.purchasePrice)).div(usable) : new Decimal(0)
      const unit = comp.unit.toLowerCase()
      // Cross-unit: COUNT ingredient (ea/bunch) used by weight (g/kg) in the recipe
      if (ing.baseUnitType === "COUNT" && WEIGHT_UNITS.has(unit) && ing.gramsPerUnit) {
        const gramsInRecipe = new Decimal(String(comp.quantity)).mul(UNIT_MULT[unit] ?? 1)
        const easUsed = gramsInRecipe.div(new Decimal(String(ing.gramsPerUnit)))
        lineCost = easUsed.mul(cpbu)
      } else {
        const baseQty = new Decimal(String(comp.quantity)).mul(UNIT_MULT[unit] ?? 1)
        lineCost = baseQty.mul(cpbu)
      }
    } else if (comp.preparationId && comp.preparation) {
      const prep = comp.preparation
      const q = new Decimal(String(comp.quantity))
      const batch = new Decimal(String(prep.batchCost))

      if (comp.unit.toLowerCase() === "serve") {
        const yieldQty = new Decimal(String(prep.yieldQuantity))
        lineCost = yieldQty.gt(0) ? q.div(yieldQty).mul(batch) : new Decimal(0)
      } else {
        const baseQty = q.mul(UNIT_MULT[comp.unit.toLowerCase()] ?? 1)
        const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
        lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(batch) : new Decimal(0)
      }
    }

    lineCost = lineCost.toDecimalPlaces(4)
    totalCost = totalCost.plus(lineCost)

    await db.dishComponent.update({
      where: { id: comp.id },
      data: { lineCost: Number(lineCost) },
    })
  }

  const sellingPriceExGst = new Decimal(String(dish.sellingPrice)).div(1.1)
  const fcPct = sellingPriceExGst.gt(0) ? totalCost.div(sellingPriceExGst).mul(100) : new Decimal(0)
  const gp = sellingPriceExGst.minus(totalCost)

  await db.dish.update({
    where: { id: dishId },
    data: {
      totalCost: Number(totalCost.toDecimalPlaces(2)),
      foodCostPercentage: Number(fcPct.toDecimalPlaces(1)),
      grossProfit: Number(gp.toDecimalPlaces(2)),
    },
  })
}

/**
 * Recalculate costs for every preparation and dish in the database.
 * Run this after setting gramsPerUnit values on COUNT ingredients to
 * propagate the corrected costs through all recipes.
 */
export async function recalculateAll() {
  const preps = await db.preparation.findMany({ select: { id: true } })
  for (const prep of preps) {
    await recalculatePreparationCost(prep.id)
  }

  const dishes = await db.dish.findMany({ select: { id: true } })
  for (const dish of dishes) {
    await recalculateDishCost(dish.id)
  }

  revalidatePath("/preparations")
  revalidatePath("/dishes")
  revalidatePath("/dashboard")
}
