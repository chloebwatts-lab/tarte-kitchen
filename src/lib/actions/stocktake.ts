"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"

export interface StocktakeListRow {
  id: string
  date: string
  venue: Venue
  status: "DRAFT" | "SUBMITTED"
  totalValue: number
  lineCount: number
  negativeVarianceValue: number
}

export interface StocktakeIngredient {
  id: string
  name: string
  category: string
  baseUnitType: "WEIGHT" | "VOLUME" | "COUNT"
  baseUnitLabel: string
  purchaseUnit: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  currentCountedQty: number | null
  currentCountedUnit: string | null
  currentNote: string | null
}

export interface StocktakeDetail {
  id: string
  date: string
  venue: Venue
  status: "DRAFT" | "SUBMITTED"
  totalValue: number
  notes: string | null
  items: {
    id: string
    ingredientId: string
    ingredientName: string
    category: string
    countedQty: number
    countedUnit: string
    unitCost: number
    lineValue: number
    expectedBaseQty: number | null
    varianceBaseQty: number | null
    varianceValue: number | null
    baseUnit: string
    note: string | null
  }[]
}

function baseUnitLabel(t: "WEIGHT" | "VOLUME" | "COUNT") {
  return t === "WEIGHT" ? "g" : t === "VOLUME" ? "ml" : "ea"
}

function normaliseToBaseUnits(
  qty: number,
  unit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT"
): number {
  const u = unit.toLowerCase()
  if (baseType === "WEIGHT") {
    if (u === "g") return qty
    if (u === "kg") return qty * 1000
  }
  if (baseType === "VOLUME") {
    if (u === "ml") return qty
    if (u === "l") return qty * 1000
  }
  // COUNT-like units
  return qty
}

export async function listStocktakes(): Promise<StocktakeListRow[]> {
  const rows = await db.stocktake.findMany({
    orderBy: [{ date: "desc" }, { venue: "asc" }],
    include: { _count: { select: { items: true } }, items: { select: { varianceValue: true } } },
    take: 50,
  })
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().split("T")[0],
    venue: r.venue,
    status: r.status,
    totalValue: Number(r.totalValue),
    lineCount: r._count.items,
    negativeVarianceValue: r.items.reduce((s, i) => {
      const v = Number(i.varianceValue ?? 0)
      return v < 0 ? s + v : s
    }, 0),
  }))
}

/**
 * Build the "count screen" — for the given venue, every active ingredient
 * with current count state (if this stocktake is a draft).
 */
export async function getIngredientsForCount(
  stocktakeId: string | null
): Promise<StocktakeIngredient[]> {
  const ingredients = await db.ingredient.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      baseUnitType: true,
      purchaseUnit: true,
      purchasePrice: true,
      purchaseQuantity: true,
      baseUnitsPerPurchase: true,
    },
  })
  const existing = stocktakeId
    ? await db.stocktakeItem.findMany({
        where: { stocktakeId },
        select: {
          ingredientId: true,
          countedQty: true,
          countedUnit: true,
          note: true,
        },
      })
    : []
  const existingMap = new Map(existing.map((x) => [x.ingredientId, x]))

  return ingredients.map((i) => {
    const x = existingMap.get(i.id)
    const baseType = i.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      baseUnitType: baseType,
      baseUnitLabel: baseUnitLabel(baseType),
      purchaseUnit: i.purchaseUnit,
      purchasePrice: Number(i.purchasePrice),
      baseUnitsPerPurchase: Number(i.baseUnitsPerPurchase),
      currentCountedQty: x ? Number(x.countedQty) : null,
      currentCountedUnit: x?.countedUnit ?? null,
      currentNote: x?.note ?? null,
    }
  })
}

export async function getStocktake(id: string): Promise<StocktakeDetail | null> {
  const s = await db.stocktake.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          ingredient: {
            select: { name: true, category: true, baseUnitType: true },
          },
        },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  })
  if (!s) return null
  return {
    id: s.id,
    date: s.date.toISOString().split("T")[0],
    venue: s.venue,
    status: s.status,
    totalValue: Number(s.totalValue),
    notes: s.notes,
    items: s.items.map((it) => ({
      id: it.id,
      ingredientId: it.ingredientId,
      ingredientName: it.ingredient.name,
      category: it.ingredient.category,
      baseUnit: baseUnitLabel(
        it.ingredient.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
      ),
      countedQty: Number(it.countedQty),
      countedUnit: it.countedUnit,
      unitCost: Number(it.unitCost),
      lineValue: Number(it.lineValue),
      expectedBaseQty:
        it.expectedBaseQty !== null ? Number(it.expectedBaseQty) : null,
      varianceBaseQty:
        it.varianceBaseQty !== null ? Number(it.varianceBaseQty) : null,
      varianceValue:
        it.varianceValue !== null ? Number(it.varianceValue) : null,
      note: it.note,
    })),
  }
}

/**
 * Create an empty draft stocktake for a venue+date (or return the existing
 * draft for that pair). Idempotent per (date, venue).
 */
export async function createStocktakeDraft(params: {
  date: string
  venue: Venue
}) {
  const existing = await db.stocktake.findUnique({
    where: { date_venue: { date: new Date(params.date), venue: params.venue } },
  })
  if (existing) {
    revalidatePath("/stocktake")
    return existing.id
  }
  const created = await db.stocktake.create({
    data: { date: new Date(params.date), venue: params.venue, status: "DRAFT" },
  })
  revalidatePath("/stocktake")
  return created.id
}

/**
 * Persist a batch of counts. Each entry is upserted per ingredient.
 * Value is computed from the ingredient's current purchase price and
 * variance is computed against the previous submitted stocktake.
 */
export async function saveStocktakeCounts(params: {
  stocktakeId: string
  counts: {
    ingredientId: string
    qty: number
    unit: string
    note?: string
  }[]
  submit?: boolean
}) {
  const stocktake = await db.stocktake.findUnique({
    where: { id: params.stocktakeId },
  })
  if (!stocktake) throw new Error("Stocktake not found")

  const ingredients = await db.ingredient.findMany({
    where: { id: { in: params.counts.map((c) => c.ingredientId) } },
    select: {
      id: true,
      baseUnitType: true,
      purchasePrice: true,
      purchaseQuantity: true,
      baseUnitsPerPurchase: true,
    },
  })
  const ingMap = new Map(ingredients.map((i) => [i.id, i]))

  // Previous submitted stocktake for this venue, any older date
  const prev = await db.stocktake.findFirst({
    where: {
      venue: stocktake.venue,
      status: "SUBMITTED",
      date: { lt: stocktake.date },
    },
    orderBy: { date: "desc" },
    select: {
      date: true,
      items: {
        select: { ingredientId: true, countedBaseQty: true },
      },
    },
  })
  const prevMap = new Map(
    prev ? prev.items.map((i) => [i.ingredientId, Number(i.countedBaseQty)]) : []
  )

  // Theoretical usage since prev date — subtract from prev stock to get expected
  let usageMap = new Map<string, number>()
  if (prev) {
    const usage = await db.theoreticalUsage.groupBy({
      by: ["ingredientId"],
      where: {
        venue: stocktake.venue,
        date: { gt: prev.date, lte: stocktake.date },
        ingredientId: { in: params.counts.map((c) => c.ingredientId) },
      },
      _sum: { theoreticalQty: true },
    })
    usageMap = new Map(
      usage.map((u) => [u.ingredientId, Number(u._sum.theoreticalQty ?? 0)])
    )
  }

  let runningTotal = 0
  for (const c of params.counts) {
    const ing = ingMap.get(c.ingredientId)
    if (!ing) continue
    const baseType = ing.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
    const countedBase = normaliseToBaseUnits(c.qty, c.unit, baseType)
    // Cost per base unit = (purchasePrice) / (purchaseQuantity * baseUnitsPerPurchase-per-purchase)
    // Ingredient stores baseUnitsPerPurchase as total across purchaseQuantity,
    // so unitCost = purchasePrice / baseUnitsPerPurchase.
    const baseUnitsPerPurchase = Number(ing.baseUnitsPerPurchase)
    const unitCost =
      baseUnitsPerPurchase > 0
        ? Number(ing.purchasePrice) / baseUnitsPerPurchase
        : 0
    const lineValue = countedBase * unitCost

    const prevStock = prevMap.get(c.ingredientId) ?? null
    const usageSince = usageMap.get(c.ingredientId) ?? 0
    const expected =
      prevStock !== null ? Math.max(prevStock - usageSince, 0) : null
    const varianceBase = expected !== null ? countedBase - expected : null
    const varianceValue =
      varianceBase !== null ? varianceBase * unitCost : null

    await db.stocktakeItem.upsert({
      where: {
        stocktakeId_ingredientId: {
          stocktakeId: params.stocktakeId,
          ingredientId: c.ingredientId,
        },
      },
      create: {
        stocktakeId: params.stocktakeId,
        ingredientId: c.ingredientId,
        countedQty: new Decimal(c.qty),
        countedUnit: c.unit,
        countedBaseQty: new Decimal(countedBase),
        unitCost: new Decimal(unitCost),
        lineValue: new Decimal(lineValue),
        expectedBaseQty:
          expected !== null ? new Decimal(expected) : null,
        varianceBaseQty:
          varianceBase !== null ? new Decimal(varianceBase) : null,
        varianceValue:
          varianceValue !== null ? new Decimal(varianceValue) : null,
        note: c.note ?? null,
      },
      update: {
        countedQty: new Decimal(c.qty),
        countedUnit: c.unit,
        countedBaseQty: new Decimal(countedBase),
        unitCost: new Decimal(unitCost),
        lineValue: new Decimal(lineValue),
        expectedBaseQty:
          expected !== null ? new Decimal(expected) : null,
        varianceBaseQty:
          varianceBase !== null ? new Decimal(varianceBase) : null,
        varianceValue:
          varianceValue !== null ? new Decimal(varianceValue) : null,
        note: c.note ?? null,
      },
    })
    runningTotal += lineValue
  }

  // Recompute total value from all lines (not just the ones just saved)
  const all = await db.stocktakeItem.findMany({
    where: { stocktakeId: params.stocktakeId },
    select: { lineValue: true },
  })
  const total = all.reduce((s, i) => s + Number(i.lineValue), 0)

  await db.stocktake.update({
    where: { id: params.stocktakeId },
    data: {
      totalValue: new Decimal(total),
      status: params.submit ? "SUBMITTED" : undefined,
    },
  })

  revalidatePath("/stocktake")
  revalidatePath(`/stocktake/${params.stocktakeId}`)
  return { total: Math.round(total * 100) / 100 }
}
