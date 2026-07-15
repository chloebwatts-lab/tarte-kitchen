/**
 * Derive SupplierItemMapping.conversionFactor for pending unit-changed
 * invoice lines using sibling-line evidence: other invoice lines on the
 * SAME supplier-item mapping whose descriptions carry a parseable pack
 * size ("850g", "10lt", "2 kg (4)"). If every parseable sibling agrees on
 * one pack size, that pack defines the factor.
 *
 * Writes ONLY where conversionFactor is currently NULL (chef-confirmed
 * factors are never touched). Purely additive config; invoice rows are
 * untouched — run recompute-price-flags.ts afterwards to convert the
 * pending lines through the new factors.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/derive-conversion-factors.ts           # dry run
 *   npx tsx --env-file=.env.local scripts/derive-conversion-factors.ts --apply   # write
 */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { parsePackSize, inferConversionFromPack, normaliseUnit } from "../src/lib/invoices/units"
import Fuse from "fuse.js"

// Descriptions with MORE than one number+unit token are ambiguous for
// factor derivation (e.g. "Slipper Bug Meat Raw [50g+] 500g" — the 50g is
// a size grade, not the pack). Only single-match descriptions count as
// evidence.
const ANY_PACK = /(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|grms?|gms?|gr|g|ml|millilitres?|milliliters?|litres?|liters?|ltrs?|lt|l|ea|each|pcs?|pieces?|dz|dozen)\b/gi
function unambiguousPack(description: string) {
  const matches = [...description.matchAll(ANY_PACK)]
  if (matches.length !== 1) return null
  return parsePackSize(description)
}

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})
const APPLY = process.argv.includes("--apply")

async function main() {
  // Distinct mappings behind pending unit-changed lines
  const pending = await db.invoiceLineItem.findMany({
    where: { unitChanged: true, priceApproved: null, mappingId: { not: null }, ingredientId: { not: null } },
    select: { mappingId: true, ingredientId: true },
    distinct: ["mappingId"],
  })
  console.log(`${pending.length} distinct mappings with pending unit-changed lines`)
  console.log(APPLY ? "APPLY mode — writing." : "DRY RUN — pass --apply to write.")

  // Secondary evidence: ApprovedSupplierItem packSize (pasted from real
  // order forms). Fuzzy-match by name within the same supplier.
  const approved = await db.approvedSupplierItem.findMany({
    select: { name: true, packSize: true, supplierId: true },
  })
  const approvedBySupplier = new Map<string, { name: string; packSize: string | null }[]>()
  for (const a of approved) {
    const arr = approvedBySupplier.get(a.supplierId) ?? []
    arr.push({ name: a.name, packSize: a.packSize })
    approvedBySupplier.set(a.supplierId, arr)
  }

  let set = 0
  let ambiguous = 0
  let noEvidence = 0
  let alreadySet = 0
  const portalList: Array<{ ingredient: string; supplier: string | null; sample: string }> = []

  for (const p of pending) {
    const mapping = await db.supplierItemMapping.findUnique({
      where: { id: p.mappingId! },
      select: { id: true, conversionFactor: true, supplierId: true },
    })
    if (!mapping) continue
    if (mapping.conversionFactor != null) { alreadySet++; continue }

    const ing = await db.ingredient.findUnique({
      where: { id: p.ingredientId! },
      select: { name: true, purchaseUnit: true, purchaseQuantity: true, supplier: { select: { name: true } } },
    })
    if (!ing) continue

    // Evidence: every line ever recorded against this mapping
    const lines = await db.invoiceLineItem.findMany({
      where: { mappingId: mapping.id },
      select: { description: true },
    })

    const factors = new Set<string>()
    let factor: number | null = null
    for (const l of lines) {
      const pack = unambiguousPack(l.description)
      if (!pack) continue
      const f = inferConversionFromPack(pack, ing.purchaseUnit, Number(ing.purchaseQuantity))
      if (f && f > 0) {
        factors.add(f.toPrecision(6))
        factor = f
      }
    }

    // Fallback: approved order-form pack size for this supplier + name
    if (factors.size === 0 && mapping.supplierId) {
      const pool = approvedBySupplier.get(mapping.supplierId) ?? []
      if (pool.length > 0) {
        const fuse = new Fuse(pool, { keys: ["name"], threshold: 0.3, includeScore: true })
        const hit = fuse.search(ing.name)[0]
        if (hit && hit.score !== undefined && hit.score < 0.25 && hit.item.packSize) {
          const pack = unambiguousPack(hit.item.packSize)
          if (pack) {
            const f = inferConversionFromPack(pack, ing.purchaseUnit, Number(ing.purchaseQuantity))
            if (f && f > 0) {
              factors.add(f.toPrecision(6))
              factor = f
              console.log(
                `  (order-form evidence: "${hit.item.name}" pack "${hit.item.packSize}" for ${ing.name})`
              )
            }
          }
        }
      }
    }

    if (factors.size === 1 && factor) {
      set++
      if (APPLY) {
        await db.supplierItemMapping.update({
          where: { id: mapping.id },
          data: { conversionFactor: factor },
        })
      }
      console.log(
        `  SET ${ing.name} (${ing.supplier?.name ?? "?"}): factor ${factor.toPrecision(6)} → 1 invoice unit = ${(1 / factor).toFixed(0)} ${normaliseUnit(ing.purchaseUnit)}`
      )
    } else if (factors.size > 1) {
      ambiguous++
      portalList.push({
        ingredient: ing.name,
        supplier: ing.supplier?.name ?? null,
        sample: `AMBIGUOUS: ${[...factors].map((f) => (1 / Number(f)).toFixed(0)).join(" vs ")} ${normaliseUnit(ing.purchaseUnit)}/unit seen`,
      })
    } else {
      noEvidence++
      portalList.push({
        ingredient: ing.name,
        supplier: ing.supplier?.name ?? null,
        sample: lines[0]?.description ?? "",
      })
    }
  }

  console.log({ set, ambiguous, noEvidence, alreadySet })
  console.log("\nNeeds portal / human check:")
  console.table(portalList.slice(0, 40))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
