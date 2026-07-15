"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import type { PriceAlert, PriceAlertStream } from "@/generated/prisma/client"

export interface PriceAlertWithIngredient extends PriceAlert {
  ingredient: {
    id: string
    name: string
    category: string
    purchaseUnit: string
    purchaseQuantity: Decimal
    purchasePrice: Decimal
  }
}

export async function listOpenAlerts(
  stream?: PriceAlertStream
): Promise<PriceAlertWithIngredient[]> {
  const alerts = await db.priceAlert.findMany({
    where: {
      status: "OPEN",
      ...(stream ? { stream } : {}),
    },
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          category: true,
          purchaseUnit: true,
          purchaseQuantity: true,
          purchasePrice: true,
        },
      },
    },
    orderBy: [{ stream: "asc" }, { changePct: "desc" }],
  })
  return alerts as PriceAlertWithIngredient[]
}

/**
 * Accept the new price — flow it into Ingredient.purchasePrice and trigger
 * the recipe cost recalculation cascade. Logs the change to PriceHistory.
 */
export async function acceptAlert(alertId: string) {
  const alert = await db.priceAlert.findUnique({
    where: { id: alertId },
    include: { ingredient: true },
  })
  if (!alert || alert.status !== "OPEN") return

  const ing = alert.ingredient
  // New purchasePrice = currentPrice (per-unit) × purchaseQuantity
  const newPrice = new Decimal(alert.currentPrice.toString())
    .mul(new Decimal(ing.purchaseQuantity.toString()))
    .toDecimalPlaces(4)
  const oldPrice = new Decimal(ing.purchasePrice.toString())

  await db.$transaction([
    db.priceHistory.create({
      data: {
        ingredientId: ing.id,
        oldPrice: oldPrice.toNumber(),
        newPrice: newPrice.toNumber(),
        oldUnit: ing.purchaseUnit,
        oldQuantity: ing.purchaseQuantity.toNumber(),
      },
    }),
    db.ingredient.update({
      where: { id: ing.id },
      data: { purchasePrice: newPrice.toNumber() },
    }),
    db.priceAlert.update({
      where: { id: alertId },
      data: { status: "ACCEPTED", resolvedAt: new Date() },
    }),
  ])

  // Cascade to recipes / dishes
  const { recalculateAll } = await import("@/lib/actions/ingredients")
  await recalculateAll()

  revalidatePath("/dashboard")
  revalidatePath("/price-alerts")
  revalidatePath("/ingredients")
  revalidatePath("/dishes")
}

export async function dismissAlert(alertId: string) {
  await db.priceAlert.update({
    where: { id: alertId },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  })
  revalidatePath("/dashboard")
  revalidatePath("/price-alerts")
}

export async function recomputeAllAlerts() {
  const { computePriceAlerts } = await import("@/lib/price-alerts/compute")
  const result = await computePriceAlerts()
  revalidatePath("/price-alerts")
  revalidatePath("/dashboard")
  return result
}
