/**
 * Repair Ingredient.purchasePrice values corrupted by past bad conversion
 * applies (e.g. oats $6,900 for 1000 g — a per-pack price multiplied through
 * a wrong factor).
 *
 * Rule: with >=3 rebuilt normalised prices in 90 days, if the stored
 * reference (purchasePrice/purchaseQuantity) is more than 2.5x off the
 * MEDIAN normalised price, reset purchasePrice to median x purchaseQuantity.
 * Every change logs a PriceHistory row (mandatory per standing safety rule).
 *
 * Dry-run by default; --write persists.
 */
import "dotenv/config"
import { Pool } from "pg"
const WRITE = process.argv.includes("--write")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
async function main() {
  const c = await pool.connect()
  try {
    const r = await c.query(
      `SELECT i.id, i.name, i."purchaseUnit" pu, i."purchaseQuantity"::float pq, i."purchasePrice"::float ppr,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l."normalisedUnitPrice"::float) med,
              PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY l."normalisedUnitPrice"::float) p10,
              PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY l."normalisedUnitPrice"::float) p90,
              i.category IN ('VEGETABLE','FRUIT','HERB','MUSHROOM','SALAD') produce,
              COUNT(*)::int n
       FROM "Ingredient" i
       JOIN "InvoiceLineItem" l ON l."ingredientId" = i.id AND l."normalisedUnitPrice" IS NOT NULL
       JOIN "Invoice" inv ON inv.id = l."invoiceId" AND inv."invoiceDate" >= NOW() - INTERVAL '90 days'
       GROUP BY i.id HAVING COUNT(*) >= 3`)
    let repaired = 0
    // GF spaghetti is mis-mapped onto the plain Spaghetti ingredient — its
    // median is a different product's price, not a corrupted reference.
    // Needs an ingredient split, not a repair (flagged in backlog).
    const SKIP = new Set(["Spaghetti"])
    for (const row of r.rows) {
      if (SKIP.has(row.name)) continue
      const ref = row.ppr / row.pq
      if (ref <= 0 || row.med <= 0) continue
      const ratio = ref / row.med
      if (ratio < 2.5 && ratio > 0.4) continue
      // Produce prices swing with the market — only repair produce when the
      // invoice series itself is steady (obvious data corruption, not a
      // seasonal move the trailing-median alert stream already handles).
      if (row.produce && row.p10 > 0 && row.p90 / row.p10 > 1.8) {
        console.log(`skip produce (volatile series): ${row.name} ref ${ref.toFixed(4)} vs median ${row.med.toFixed(4)}`)
        continue
      }
      const newPrice = Math.round(row.med * row.pq * 10000) / 10000
      repaired++
      console.log(`${WRITE ? "REPAIR" : "would repair"} ${row.name}: $${row.ppr}/${row.pq} ${row.pu} (ref ${ref.toFixed(4)}/u) -> $${newPrice} (median ${row.med.toFixed(4)}/u x${row.n} lines, ratio ${ratio.toFixed(1)})`)
      if (WRITE) {
        await c.query(
          `INSERT INTO "PriceHistory" (id, "ingredientId", "oldPrice", "newPrice", "oldUnit", "oldQuantity", "changedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
          [row.id, row.ppr, newPrice, row.pu, row.pq])
        await c.query(
          `UPDATE "Ingredient" SET "purchasePrice"=$2, "updatedAt"=NOW() WHERE id=$1`,
          [row.id, newPrice])
      }
    }
    console.log(`\n${repaired} ingredients ${WRITE ? "repaired" : "flagged"} of ${r.rows.length} with >=3 datapoints`)
  } finally { c.release(); await pool.end() }
}
main()
