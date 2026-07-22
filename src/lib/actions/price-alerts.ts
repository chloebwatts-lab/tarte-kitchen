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
    orderBy: [{ stream: "asc" }],
  })
  // Sort by |changePct| desc within stream — a −40% drop (Bidfood rebate)
  // matters as much as a +40% rise and must not sink below +5% noise.
  alerts.sort((a, b) => {
    if (a.stream !== b.stream) return a.stream < b.stream ? -1 : 1
    return Math.abs(Number(b.changePct)) - Math.abs(Number(a.changePct))
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
  if (!alert) return { ok: false as const, reason: "Alert no longer exists" }
  // The nightly recompute can flip an alert to DISMISSED between the chef's
  // page load and their tap. That's a stale-close race, not a real refusal —
  // the chef is looking at the numbers and accepting THEM, so honour it.
  // Only a genuinely already-accepted alert is a no-op.
  if (alert.status === "ACCEPTED") return { ok: true as const, reason: "Already accepted" }

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

  // Keep the v1 per-line alert surface (/suppliers) in sync: the pending
  // priceChanged flags for this ingredient are now resolved by this accept,
  // so they must not keep showing as open alerts on the other page.
  await db.invoiceLineItem.updateMany({
    where: { ingredientId: ing.id, priceChanged: true, priceApproved: null },
    data: { priceApproved: true },
  })

  // Cascade to recipes / dishes
  const { recalculateAll } = await import("@/lib/actions/ingredients")
  await recalculateAll()

  revalidatePath("/dashboard")
  revalidatePath("/price-alerts")
  revalidatePath("/ingredients")
  revalidatePath("/dishes")
  revalidatePath("/suppliers")
  return { ok: true as const }
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
