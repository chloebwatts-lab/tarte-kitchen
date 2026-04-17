import { db } from "@/lib/db"
import Fuse from "fuse.js"

interface MatchResult {
  ingredientId: string
  mappingId: string | null
  matched: true
}

interface NoMatch {
  matched: false
}

export async function matchLineItem(
  invoiceDescription: string,
  supplierId: string
): Promise<MatchResult | NoMatch> {
  // 1. Check exact mapping
  const mapping = await db.supplierItemMapping.findUnique({
    where: {
      supplierId_invoiceDescription: {
        supplierId,
        invoiceDescription,
      },
    },
  })

  if (mapping) {
    return {
      matched: true,
      ingredientId: mapping.ingredientId,
      mappingId: mapping.id,
    }
  }

  // 2. Try case-insensitive mapping match
  const fuzzyMapping = await db.supplierItemMapping.findFirst({
    where: {
      supplierId,
      invoiceDescription: { equals: invoiceDescription, mode: "insensitive" },
    },
  })

  if (fuzzyMapping) {
    return {
      matched: true,
      ingredientId: fuzzyMapping.ingredientId,
      mappingId: fuzzyMapping.id,
    }
  }

  // 3. Try fuzzy match against supplier's ingredients
  const supplierIngredients = await db.ingredient.findMany({
    where: { supplierId },
    select: { id: true, name: true, supplierProductCode: true },
  })

  if (supplierIngredients.length === 0) return { matched: false }

  const fuse = new Fuse(supplierIngredients, {
    keys: ["name", "supplierProductCode"],
    threshold: 0.4,
    includeScore: true,
  })

  const results = fuse.search(invoiceDescription)
  if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.4) {
    // Auto-create mapping for future use
    const newMapping = await db.supplierItemMapping.create({
      data: {
        supplierId,
        ingredientId: results[0].item.id,
        invoiceDescription,
      },
    })

    return {
      matched: true,
      ingredientId: results[0].item.id,
      mappingId: newMapping.id,
    }
  }

  return { matched: false }
}

export interface PriceChangeResult {
  changed: boolean
  previousPrice: number
  currentPrice: number
  changeAmount: number
  changePercent: number
}

export async function detectPriceChange(
  ingredientId: string,
  newUnitPrice: number
): Promise<PriceChangeResult> {
  const ingredient = await db.ingredient.findUnique({
    where: { id: ingredientId },
    select: { purchasePrice: true },
  })

  if (!ingredient) {
    return {
      changed: false,
      previousPrice: newUnitPrice,
      currentPrice: newUnitPrice,
      changeAmount: 0,
      changePercent: 0,
    }
  }

  const previousPrice = Number(ingredient.purchasePrice)
  const diff = newUnitPrice - previousPrice
  const pctChange = previousPrice > 0 ? (diff / previousPrice) * 100 : 0

  return {
    changed: Math.abs(diff) >= 0.01,
    previousPrice,
    currentPrice: newUnitPrice,
    changeAmount: diff,
    changePercent: pctChange,
  }
}
