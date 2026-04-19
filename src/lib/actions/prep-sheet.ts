"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

export interface PrepSheetLine {
  preparationId: string
  preparationName: string
  category: string
  // How many base-unit grams/ml/ea of this preparation the kitchen needs
  // for the forecast period, after aggregating every dish that uses it
  // (including sub-preparation cascades).
  requiredBaseQty: number
  baseUnit: string // "g" or "ml" or "ea"
  // Number of batches, rounded up — one row of the print-out should say
  // "make 2 batches of caramel (yields 750 g)"
  batchesNeeded: number
  yieldPerBatch: number
  yieldUnit: string
  batchCost: number
  totalCost: number
  // Driving dishes so the chef can see *why* this prep is on the list
  drivers: {
    dishName: string
    forecastQty: number
    venue: string
  }[]
}

export interface PrepSheet {
  forDate: string // ISO date of the day being prepped for
  venue: Venue | "ALL"
  lookbackWeeks: number
  totalCost: number
  lines: PrepSheetLine[]
  unmatchedForecast: {
    menuItemName: string
    forecastQty: number
    venue: string
  }[]
}

interface DishDemand {
  dishId: string
  dishName: string
  venue: Venue
  forecastQty: number
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  aestNow.setUTCHours(0, 0, 0, 0)
  aestNow.setUTCDate(aestNow.getUTCDate() - offsetDays)
  return new Date(aestNow.toISOString().split("T")[0])
}

/**
 * Build tomorrow's prep list from recent same-day-of-week sales.
 *
 * Approach — we look at the last N weeks on the same weekday at the same
 * venue and take the median quantity sold per dish. That's our forecast.
 * Then we walk each dish's component tree: each DishComponent that's a
 * preparation adds demand = forecast × recipeQty (converted to the prep's
 * base unit). Sub-preparations cascade the same way, so a caramel that's
 * used inside the dulce-de-leche prep shows up correctly.
 *
 * Output is sorted by prep category (makes for a logical prep list) then
 * by required quantity descending.
 */
export async function getPrepSheet(params: {
  venue: Venue | "ALL"
  forDate?: string // defaults to tomorrow AEST
  lookbackWeeks?: number
}): Promise<PrepSheet> {
  const { venue, lookbackWeeks = 4 } = params
  const forDate =
    params.forDate ?? ymd(new Date(startOfAestDay(-1))) // tomorrow AEST
  const forDateObj = new Date(forDate)
  const dow = forDateObj.getUTCDay()

  // Window: up to 8 weeks back, we filter to matching DoW only
  const start = startOfAestDay(7 * 8)
  const venueFilter =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: { in: [venue as Venue] } }

  const rawSales = await db.dailySales.findMany({
    where: { ...venueFilter, date: { gte: start } },
    select: {
      date: true,
      venue: true,
      menuItemName: true,
      dishId: true,
      quantitySold: true,
    },
  })

  // Bucket by (venue, menuItemName) → array of qty for matching DoW
  const bucket = new Map<string, { dishId: string | null; venue: Venue; qtys: number[]; name: string }>()
  for (const row of rawSales) {
    if (row.date.getUTCDay() !== dow) continue
    const key = `${row.venue}|${row.menuItemName}`
    const entry = bucket.get(key) ?? {
      dishId: row.dishId,
      venue: row.venue,
      qtys: [],
      name: row.menuItemName,
    }
    entry.qtys.push(row.quantitySold)
    entry.dishId = entry.dishId ?? row.dishId
    bucket.set(key, entry)
  }

  // Forecast = median of last N same-DoW samples (falls back to first
  // sample's qty if fewer than N) — median is robust against public
  // holidays and freak days.
  function median(ns: number[]) {
    if (ns.length === 0) return 0
    const sorted = [...ns].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid]
  }

  const demands: DishDemand[] = []
  const unmatched: PrepSheet["unmatchedForecast"] = []
  for (const b of bucket.values()) {
    const recent = b.qtys.slice(0, lookbackWeeks)
    const forecastQty = median(recent)
    if (forecastQty === 0) continue
    if (b.dishId) {
      demands.push({
        dishId: b.dishId,
        dishName: b.name,
        venue: b.venue,
        forecastQty,
      })
    } else {
      unmatched.push({
        menuItemName: b.name,
        forecastQty,
        venue: b.venue,
      })
    }
  }

  if (demands.length === 0) {
    return {
      forDate,
      venue,
      lookbackWeeks,
      totalCost: 0,
      lines: [],
      unmatchedForecast: unmatched,
    }
  }

  // Pull every dish with its components (ingredient + preparation),
  // then recursively walk preparation → preparationItem → subPreparation
  // so nested preps get the right demand.
  const dishes = await db.dish.findMany({
    where: { id: { in: demands.map((d) => d.dishId) } },
    include: {
      components: {
        include: {
          preparation: {
            include: {
              items: {
                include: { subPreparation: true },
              },
            },
          },
        },
      },
    },
  })
  const dishMap = new Map(dishes.map((d) => [d.id, d]))

  // Map of preparationId → required base-unit quantity accumulator
  const prepDemand = new Map<string, number>()
  const prepDrivers = new Map<string, PrepSheetLine["drivers"]>()

  function addPrepDemand(
    prepId: string,
    baseQty: number,
    driver: PrepSheetLine["drivers"][number]
  ) {
    prepDemand.set(prepId, (prepDemand.get(prepId) ?? 0) + baseQty)
    const arr = prepDrivers.get(prepId) ?? []
    arr.push(driver)
    prepDrivers.set(prepId, arr)
  }

  // Direct demand from dish components (preparation rows)
  for (const d of demands) {
    const dish = dishMap.get(d.dishId)
    if (!dish) continue
    for (const c of dish.components) {
      if (!c.preparation) continue
      const qtyPerDish = Number(c.quantity)
      const baseQty = convertToPrepBase(
        qtyPerDish,
        c.unit,
        c.preparation.yieldUnit,
        Number(c.preparation.yieldWeightGrams),
        Number(c.preparation.yieldQuantity)
      )
      addPrepDemand(c.preparation.id, baseQty * d.forecastQty, {
        dishName: d.dishName,
        forecastQty: d.forecastQty,
        venue: d.venue,
      })
    }
  }

  // Cascade: any preparation that has sub-preparations contributes demand
  // to those sub-preps proportional to its own required quantity. We load
  // prep trees iteratively until the queue drains.
  const preparationsById = new Map<string, typeof dishes[number]["components"][number]["preparation"]>()
  for (const d of dishes) {
    for (const c of d.components) {
      if (c.preparation) preparationsById.set(c.preparation.id, c.preparation)
    }
  }
  const queue = [...prepDemand.keys()]
  while (queue.length > 0) {
    const prepId = queue.shift()!
    const prep = preparationsById.get(prepId)
    if (!prep) {
      // Load on demand for nested sub-preps we didn't pull earlier
      const loaded = await db.preparation.findUnique({
        where: { id: prepId },
        include: { items: { include: { subPreparation: true } } },
      })
      if (!loaded) continue
      preparationsById.set(prepId, loaded as typeof prep)
    }
    const full = preparationsById.get(prepId)!
    const parentDemandBase = prepDemand.get(prepId) ?? 0
    const parentYieldBase = Number(full.yieldWeightGrams) || Number(full.yieldQuantity)
    if (parentYieldBase === 0) continue
    for (const item of full.items) {
      if (!item.subPreparation) continue
      const perBatchBase = convertToPrepBase(
        Number(item.quantity),
        item.unit,
        item.subPreparation.yieldUnit,
        Number(item.subPreparation.yieldWeightGrams),
        Number(item.subPreparation.yieldQuantity)
      )
      const cascadeBatches = parentDemandBase / parentYieldBase
      const addBase = perBatchBase * cascadeBatches
      if (addBase <= 0) continue
      const existed = prepDemand.has(item.subPreparation.id)
      prepDemand.set(
        item.subPreparation.id,
        (prepDemand.get(item.subPreparation.id) ?? 0) + addBase
      )
      // Inherit driver list for traceability
      const parentDrivers = prepDrivers.get(prepId) ?? []
      prepDrivers.set(item.subPreparation.id, [
        ...(prepDrivers.get(item.subPreparation.id) ?? []),
        ...parentDrivers,
      ])
      if (!existed) queue.push(item.subPreparation.id)
    }
  }

  // Materialise lines — need preparation metadata for yieldWeightGrams etc.
  const prepIds = Array.from(prepDemand.keys())
  const preps = await db.preparation.findMany({
    where: { id: { in: prepIds } },
  })
  const prepMeta = new Map(preps.map((p) => [p.id, p]))

  const lines: PrepSheetLine[] = []
  for (const [prepId, required] of prepDemand.entries()) {
    const p = prepMeta.get(prepId)
    if (!p) continue
    const baseUnit = baseUnitOf(p.yieldUnit, Number(p.yieldWeightGrams), Number(p.yieldQuantity))
    const yieldBase =
      baseUnit === "g"
        ? Number(p.yieldWeightGrams)
        : Number(p.yieldQuantity)
    const batches = yieldBase > 0 ? Math.ceil(required / yieldBase) : 0
    const batchCost = Number(p.batchCost)
    // Collapse duplicate drivers
    const drivers = (prepDrivers.get(prepId) ?? []).slice(0, 8)

    lines.push({
      preparationId: prepId,
      preparationName: p.name,
      category: p.category,
      requiredBaseQty: Math.round(required * 100) / 100,
      baseUnit,
      batchesNeeded: batches,
      yieldPerBatch: Number(p.yieldQuantity),
      yieldUnit: p.yieldUnit,
      batchCost: Math.round(batchCost * 100) / 100,
      totalCost: Math.round(batches * batchCost * 100) / 100,
      drivers,
    })
  }

  // Sort by category then required qty desc
  lines.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      b.requiredBaseQty - a.requiredBaseQty
  )

  const totalCost = lines.reduce((s, l) => s + l.totalCost, 0)

  return {
    forDate,
    venue,
    lookbackWeeks,
    totalCost: Math.round(totalCost * 100) / 100,
    lines,
    unmatchedForecast: unmatched.slice(0, 20),
  }
}

/**
 * Convert a dish-component quantity into the preparation's "base" unit.
 * - If the preparation yields in "serves", we treat it as units (ea).
 * - If it yields in g/kg/ml/l, we normalise to g or ml.
 */
function convertToPrepBase(
  qty: number,
  unit: string,
  yieldUnit: string,
  yieldWeightGrams: number,
  yieldQuantity: number
): number {
  const u = unit.toLowerCase()
  const yu = yieldUnit.toLowerCase()
  // Weight mass
  if (u === "kg") return qty * 1000
  if (u === "g") return qty
  if (u === "l") return qty * 1000
  if (u === "ml") return qty
  // Portion counts
  if (u === "serve" || u === "serves" || u === "portion" || u === "portions") {
    // If the prep yields servings, we need count; if it yields mass, we
    // can approximate by using weight per serve.
    if (yu === "serves" || yu === "serve" || yu === "ea") return qty
    const perServe = yieldWeightGrams / Math.max(yieldQuantity, 1)
    return qty * perServe
  }
  if (u === "ea" || u === "each" || u === "piece" || u === "pieces") {
    return qty
  }
  return qty // last-resort
}

function baseUnitOf(
  yieldUnit: string,
  yieldWeightGrams: number,
  _yieldQuantity: number
): string {
  const yu = yieldUnit.toLowerCase()
  if (yu === "serve" || yu === "serves" || yu === "ea") {
    return yieldWeightGrams > 0 ? "g" : "ea"
  }
  if (yu === "ml" || yu === "l") return "ml"
  if (yu === "g" || yu === "kg") return "g"
  return yieldUnit
}
