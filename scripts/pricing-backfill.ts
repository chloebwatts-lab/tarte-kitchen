/**
 * Pricing rebuild backfill: build SupplierProducts and PriceObservations
 * from existing invoices, then compute product alerts, then print how the
 * new engine disagrees with the live v2 PriceAlert table.
 *
 * Dry-run by default: prints what it WOULD create per supplier and the
 * products that would need a human pack answer. --apply writes.
 *
 *   npx tsx scripts/pricing-backfill.ts            # dry run, last 120 days
 *   npx tsx scripts/pricing-backfill.ts --days 365
 *   npx tsx scripts/pricing-backfill.ts --apply
 */
import "dotenv/config"
import { db } from "../src/lib/db"
import { productKey, resolvePack } from "../src/lib/pricing/pack"
import { deriveObservation } from "../src/lib/pricing/observation"
import {
  ingestInvoiceObservations,
  computeProductAlerts,
  ingredientPerBase,
} from "../src/lib/pricing/service"

const APPLY = process.argv.includes("--apply")
const daysIdx = process.argv.indexOf("--days")
const DAYS = daysIdx > -1 ? Number(process.argv[daysIdx + 1]) : 120

async function main() {
  const from = new Date(Date.now() - DAYS * 86_400_000)
  const invoices = await db.invoice.findMany({
    where: {
      invoiceDate: { gte: from },
      supplierId: { not: null },
      status: { in: ["MATCHED", "EXTRACTED", "APPROVED", "CREDIT_NOTE"] },
    },
    orderBy: { invoiceDate: "asc" },
    select: { id: true, supplierId: true, supplierName: true, invoiceDate: true },
  })
  console.log(`${invoices.length} invoices since ${from.toISOString().slice(0, 10)} (${APPLY ? "APPLY" : "dry run"})`)

  if (APPLY) {
    let valid = 0, suspect = 0, excluded = 0, skipped = 0, products = 0
    for (const inv of invoices) {
      const s = await ingestInvoiceObservations(inv.id)
      valid += s.observations.valid
      suspect += s.observations.suspect
      excluded += s.observations.excluded
      skipped += s.observations.skipped
      products += s.productsCreated
    }
    console.log({ products, valid, suspect, excluded, skipped })
    const r = await computeProductAlerts()
    console.log("compute:", r)
    await compareWithV2()
    return
  }

  // Dry run: simulate product creation and pack resolution in memory.
  const seen = new Map<string, { supplier: string; desc: string; unit: string | null; pack: ReturnType<typeof resolvePack>; lines: number; suspect: number }>()
  for (const inv of invoices) {
    const lines = await db.invoiceLineItem.findMany({
      where: { invoiceId: inv.id, ingredientId: { not: null } },
      include: { ingredient: true },
    })
    for (const l of lines) {
      if (!l.ingredient) continue
      const key = `${inv.supplierId}|${productKey(l.productCode, l.description, l.unit)}`
      const ingInfo = {
        baseUnitType: l.ingredient.baseUnitType,
        purchaseUnit: l.ingredient.purchaseUnit,
        purchaseQuantity: Number(l.ingredient.purchaseQuantity),
        baseUnitsPerPurchase: Number(l.ingredient.baseUnitsPerPurchase),
        gramsPerUnit: l.ingredient.gramsPerUnit ? Number(l.ingredient.gramsPerUnit) : null,
      }
      let entry = seen.get(key)
      if (!entry) {
        entry = { supplier: inv.supplierName, desc: l.description, unit: l.unit, pack: resolvePack(l.description, l.unit, ingInfo), lines: 0, suspect: 0 }
        seen.set(key, entry)
      }
      entry.lines++
      const obs = deriveObservation(
        {
          description: l.description, unit: l.unit,
          quantity: l.quantity ? Number(l.quantity) : null,
          unitPrice: l.unitPrice ? Number(l.unitPrice) : null,
          lineTotal: l.lineTotal ? Number(l.lineTotal) : null,
          isCreditNote: false,
        },
        entry.pack?.packBaseUnits ?? null,
        entry.pack?.confidence ?? null,
        ingredientPerBase(l.ingredient)
      )
      if (obs.status === "SUSPECT") entry.suspect++
    }
  }
  const all = [...seen.values()]
  const bySource = new Map<string, number>()
  for (const e of all) bySource.set(e.pack?.source ?? "NONE", (bySource.get(e.pack?.source ?? "NONE") ?? 0) + 1)
  console.log(`\n${all.length} supplier products`)
  console.log("pack source:", Object.fromEntries(bySource))
  const needs = all.filter((e) => !e.pack || e.suspect > 0)
  console.log(`\n${needs.length} would need a human pack answer (one question each):`)
  for (const e of needs.sort((a, b) => b.lines - a.lines).slice(0, 60)) {
    console.log(`  ${e.supplier.padEnd(22)} ${String(e.lines).padStart(3)} lines  ${e.unit ?? "-"}  ${e.desc}${e.pack ? `  [${e.pack.source}/${e.pack.confidence} ${e.pack.packBaseUnits}]` : ""}${e.suspect ? `  suspect x${e.suspect}` : ""}`)
  }
  if (needs.length > 60) console.log(`  ... and ${needs.length - 60} more`)
}

async function compareWithV2() {
  const v2 = await db.priceAlert.findMany({ where: { status: "OPEN" }, select: { ingredientId: true, changePct: true } })
  const v3 = await db.productPriceAlert.findMany({ where: { status: "OPEN" }, select: { ingredientId: true, changePct: true } })
  const v2Ings = new Set(v2.map((a) => a.ingredientId))
  const v3Ings = new Set(v3.map((a) => a.ingredientId))
  const onlyV2 = [...v2Ings].filter((i) => !v3Ings.has(i))
  const onlyV3 = [...v3Ings].filter((i) => !v2Ings.has(i))
  console.log(`\nv2 open alerts: ${v2.length} (${v2Ings.size} ingredients); rebuild open alerts: ${v3.length} (${v3Ings.size} ingredients)`)
  console.log(`only in v2: ${onlyV2.length}, only in rebuild: ${onlyV3.length}, both: ${[...v2Ings].filter((i) => v3Ings.has(i)).length}`)
  const names = await db.ingredient.findMany({ where: { id: { in: [...onlyV2, ...onlyV3].slice(0, 80) } }, select: { id: true, name: true } })
  const nm = new Map(names.map((n) => [n.id, n.name]))
  if (onlyV2.length) console.log("only v2 (likely ghosts or pack issues):", onlyV2.slice(0, 40).map((i) => nm.get(i) ?? i).join("; "))
  if (onlyV3.length) console.log("only rebuild (v2 missed or suppressed):", onlyV3.slice(0, 40).map((i) => nm.get(i) ?? i).join("; "))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
