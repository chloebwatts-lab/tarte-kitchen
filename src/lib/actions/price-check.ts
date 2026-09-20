"use server"

import { assertManager } from "@/lib/manager-auth"
import { db } from "@/lib/db"

/**
 * Price check for the staff area. Answers "what do we pay for X, and is it
 * different across the venues?" straight off the invoices we've already
 * ingested. One row per ingredient + venue + supplier, showing the most
 * recent price we were actually charged and when.
 *
 * Prices here are supplier buy prices, which Chloe is fine having on the
 * open staff tier (2026-09-18). No sell prices, margins or totals.
 */

export type VenuePriceRow = {
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
  supplier: string | null
  unitPrice: number
  unit: string | null
  lastSeen: string // ISO date
  lastDescription: string // exact line as it read on the invoice
}

export type IngredientPrices = {
  ingredientId: string
  name: string
  rows: VenuePriceRow[]
  /** True when two venues' latest like-for-like price differs. */
  varies: boolean
  cheapest: VenuePriceRow | null
  dearest: VenuePriceRow | null
}

type Raw = {
  ingredientId: string
  ingredientName: string
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
  supplier: string | null
  unitPrice: string
  unit: string | null
  lastSeen: Date
  lastDescription: string
}

/**
 * Latest charged price per (ingredient, venue, supplier). Real venues only
 * (BOTH/legacy rows are folded in by mapping, but we filter to the three
 * trading venues here). Matches on the mapped ingredient name so the many
 * raw spellings ("Avocados", "AVOCADO HASS #20 TRAY") collapse to one item.
 */
export async function searchPrices(query: string): Promise<IngredientPrices[]> {
  await assertManager()
  const q = query.trim()
  if (q.length < 2) return []

  const rows = await db.$queryRawUnsafe<Raw[]>(
    `
    SELECT DISTINCT ON (li."ingredientId", inv.venue, s.name)
      li."ingredientId"        AS "ingredientId",
      ing.name                 AS "ingredientName",
      inv.venue                AS venue,
      s.name                   AS supplier,
      li."unitPrice"           AS "unitPrice",
      li.unit                  AS unit,
      inv."invoiceDate"        AS "lastSeen",
      li.description           AS "lastDescription"
    FROM "InvoiceLineItem" li
    JOIN "Invoice" inv ON inv.id = li."invoiceId"
    JOIN "Ingredient" ing ON ing.id = li."ingredientId"
    LEFT JOIN "Supplier" s ON s.id = inv."supplierId"
    WHERE li."ingredientId" IS NOT NULL
      AND li."unitPrice" IS NOT NULL
      AND inv.venue IN ('BURLEIGH','BEACH_HOUSE','TEA_GARDEN')
      AND (ing.name ILIKE $1 OR li.description ILIKE $1)
    ORDER BY li."ingredientId", inv.venue, s.name, inv."invoiceDate" DESC NULLS LAST
    `,
    `%${q}%`
  )

  const byIngredient = new Map<string, IngredientPrices>()
  for (const r of rows) {
    let item = byIngredient.get(r.ingredientId)
    if (!item) {
      item = {
        ingredientId: r.ingredientId,
        name: r.ingredientName,
        rows: [],
        varies: false,
        cheapest: null,
        dearest: null,
      }
      byIngredient.set(r.ingredientId, item)
    }
    item.rows.push({
      venue: r.venue,
      supplier: r.supplier,
      unitPrice: Number(r.unitPrice),
      unit: r.unit,
      lastSeen: new Date(r.lastSeen).toISOString(),
      lastDescription: r.lastDescription,
    })
  }

  const items = [...byIngredient.values()]
  for (const item of items) {
    item.rows.sort(
      (a, b) => a.unitPrice - b.unitPrice || a.venue.localeCompare(b.venue)
    )
    item.cheapest = item.rows[0] ?? null
    item.dearest = item.rows[item.rows.length - 1] ?? null
    // "Varies" only when the same unit is being compared, so we don't flag a
    // per-kg line against a per-tray line as a difference.
    const byUnit = new Map<string, number[]>()
    for (const row of item.rows) {
      const key = (row.unit ?? "").toLowerCase()
      const list = byUnit.get(key) ?? []
      list.push(row.unitPrice)
      byUnit.set(key, list)
    }
    item.varies = [...byUnit.values()].some(
      (prices) => Math.max(...prices) - Math.min(...prices) > 0.01
    )
  }

  // Best matches first: exact-ish name hits, then by how many venues we have.
  const ql = q.toLowerCase()
  items.sort((a, b) => {
    const aExact = a.name.toLowerCase().includes(ql) ? 0 : 1
    const bExact = b.name.toLowerCase().includes(ql) ? 0 : 1
    return aExact - bExact || b.rows.length - a.rows.length
  })

  return items.slice(0, 40)
}
