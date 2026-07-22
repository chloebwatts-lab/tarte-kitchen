/**
 * Rebuild InvoiceLineItem.normalisedUnitPrice for the last 90 days using the
 * CURRENT units.ts logic. Dry-run by default; --write persists.
 * Reports per-ingredient basis consistency (max/min norm ratio) so bad
 * mapping factors stand out before writing.
 */
import "dotenv/config"
import { Pool } from "pg"
import { evaluatePriceChange, effectiveUnitPrice } from "../src/lib/invoices/units"

const WRITE = process.argv.includes("--write")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const PRODUCE = new Set(["VEGETABLE", "FRUIT", "HERB", "MUSHROOM", "SALAD"])

async function main() {
  const c = await pool.connect()
  try {
    const lines = await c.query(
      `SELECT l.id, l.description, l.unit, l."unitPrice"::float up, l.quantity::float qty, l."lineTotal"::float lt, l."normalisedUnitPrice"::float oldnorm,
              l."unitChanged" olduc, i.id iid, i.name, i.category, i."purchaseUnit" pu, i."purchaseQuantity"::float pq,
              i."purchasePrice"::float ppr, m."conversionFactor"::float mf, m."invoiceUnit" miu
       FROM "InvoiceLineItem" l
       JOIN "Ingredient" i ON i.id = l."ingredientId"
       JOIN "Invoice" inv ON inv.id = l."invoiceId"
       LEFT JOIN "SupplierItemMapping" m ON m.id = l."mappingId" AND m.ignored = false
       WHERE inv."invoiceDate" >= NOW() - INTERVAL '90 days' AND l."unitPrice" IS NOT NULL`)
    let changed = 0, cleared = 0, set = 0, same = 0
    const perIng = new Map<string, { name: string; norms: number[] }>()
    const updates: { id: string; norm: number | null; uc: boolean; scf: number | null; pc: boolean }[] = []
    for (const l of lines.rows) {
      const ev = evaluatePriceChange(
        { purchaseUnit: l.pu, purchaseQuantity: l.pq, purchasePrice: l.ppr },
        { unit: l.unit, unitPrice: effectiveUnitPrice(l.up, l.qty ?? null, l.lt ?? null), description: l.description },
        l.mf ?? null,
        l.miu ?? null
      )
      let uc = ev.unitChanged
      let scf = ev.suggestedConversionFactor
      if (uc && PRODUCE.has(l.category)) { uc = false; scf = null }
      updates.push({ id: l.id, norm: ev.normalisedUnitPrice, uc, scf, pc: ev.priceChanged })
      const oldn = l.oldnorm
      const newn = ev.normalisedUnitPrice
      if (newn === null && oldn !== null) cleared++
      else if (newn !== null && oldn === null) set++
      else if (newn !== null && oldn !== null && Math.abs(newn - oldn) / oldn > 0.001) changed++
      else same++
      if (newn !== null) {
        const e = perIng.get(l.iid) ?? { name: l.name, norms: [] }
        e.norms.push(newn)
        perIng.set(l.iid, e)
      }
    }
    console.log(`lines=${lines.rows.length} same=${same} changed=${changed} newly-set=${set} cleared=${cleared}`)
    console.log("\n=== ingredients with inconsistent basis after rebuild (max/min > 3x) ===")
    let bad = 0
    for (const [iid, e] of perIng.entries()) {
      const mx = Math.max(...e.norms), mn = Math.min(...e.norms)
      if (mn > 0 && mx / mn > 3) { bad++; console.log(`  ${e.name} (${iid}): ${mn} .. ${mx} (${(mx/mn).toFixed(1)}x, ${e.norms.length} lines)`) }
    }
    console.log(`inconsistent ingredients: ${bad}`)
    if (WRITE) {
      for (const u of updates) {
        await c.query(
          `UPDATE "InvoiceLineItem" SET "normalisedUnitPrice"=$2, "unitChanged"=$3, "suggestedConversionFactor"=$4, "priceChanged"=$5 WHERE id=$1`,
          [u.id, u.norm, u.uc, u.scf, u.pc])
      }
      console.log(`\nWROTE ${updates.length} lines`)
    } else {
      console.log("\nDRY RUN — nothing written. --write to persist.")
    }
  } finally { c.release(); await pool.end() }
}
main()
