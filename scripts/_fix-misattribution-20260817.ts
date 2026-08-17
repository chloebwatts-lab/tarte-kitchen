// Corrective backfill for the 2026-08-17 mis-attribution audit.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Chloe must sign off first —
// this moves money between suppliers and rewrites price history.
//
//   npx tsx --env-file=.env.local scripts/_fix-misattribution-20260817.ts
//   npx tsx --env-file=.env.local scripts/_fix-misattribution-20260817.ts --apply
//
// Why this is not a one-line UPDATE: SupplierItemMapping is unique on
// (supplierId, invoiceDescription) and IngredientSupplierPrice on
// (ingredientId, supplierId). Repointing Invoice.supplierId alone would
// leave every InvoiceLineItem.mappingId referencing the WRONG supplier's
// mapping and would strand the price history. So each corrected invoice is
// re-run through processInvoice, which deletes and recreates its line items
// transactionally against the new supplier.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { letterheadMatches } from "../src/lib/invoices/supplier-match"
import { processInvoice } from "../src/lib/invoices/processor"
import { writeFile } from "fs/promises"
import path from "path"

const APPLY = process.argv.includes("--apply")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const LIVE = ["EXTRACTED", "MATCHED", "APPROVED", "PENDING", "PROCESSING", "CREDIT_NOTE", "REVIEW"]

// Orphan letterheads that ARE food suppliers — verified from their actual line
// items (chai, filter coffee, seafood), they simply have no Supplier row yet.
// These must NOT be swept out of COGS with the overheads; they need a Supplier
// record created and then reassigning. Left untouched by this script.
const FOOD_ORPHANS = [
  "single origin wholesale", // "Good Chaibrations 500g" — chai
  "limpopo project",         // Colombian / Kenyan filter coffee
  "tasman distribution",     // "Bug Meat Tray", "Barra Sides 1.5kg" — seafood
  "noble & sunday",          // "W930 - Strawberry Plum" — unclear, erring on keep
]

const isFoodOrphan = (letterhead: string) =>
  FOOD_ORPHANS.some((f) => letterhead.toLowerCase().includes(f))

async function main() {
  console.log(APPLY ? "‼  APPLY MODE — writing changes\n" : "◦ DRY RUN — nothing will be written (pass --apply to write)\n")

  const suppliers: any[] = await db.$queryRawUnsafe(`SELECT id, name FROM "Supplier" ORDER BY name`)
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "supplierId", "supplierName", status::text, total, "invoiceDate", "invoiceNumber",
           "pdfUrl", "extractedData", "extractedData"->>'supplierName' pdf
    FROM "Invoice" WHERE "extractedData"->>'supplierName' IS NOT NULL
    ORDER BY "invoiceDate"`)

  const reassign: any[] = []   // letterhead names a supplier we already have
  const orphan: any[] = []     // non-food third party → out of COGS
  const foodOrphan: any[] = [] // food supplier with no Supplier row → needs one

  for (const r of rows) {
    if (letterheadMatches(r.supplierName, r.pdf) !== "mismatch") continue
    const target = suppliers.find(
      (s) => s.id !== r.supplierId && letterheadMatches(s.name, r.pdf) === "match"
    )
    if (target) reassign.push({ ...r, target })
    else if (isFoodOrphan(r.pdf)) foodOrphan.push(r)
    else orphan.push(r)
  }

  // ── 1. reassignable ────────────────────────────────────────────────────
  console.log(`■ REASSIGN — letterhead matches an existing Supplier (${reassign.length} rows)`)
  const byMove: Record<string, { n: number; $: number }> = {}
  for (const r of reassign) {
    const k = `${r.supplierName} → ${r.target.name}`
    byMove[k] = byMove[k] ?? { n: 0, $: 0 }
    byMove[k].n++
    if (LIVE.includes(r.status)) byMove[k].$ += Math.abs(Number(r.total ?? 0))
  }
  for (const [k, v] of Object.entries(byMove).sort((a, b) => b[1].$ - a[1].$))
    console.log(`   ${String(v.n).padStart(3)} rows  $${v.$.toFixed(2).padStart(11)}  ${k}`)

  // ── 2. orphans — a business decision, never automatic ──────────────────
  console.log(`\n■ NO MATCHING SUPPLIER — needs a human call (${orphan.length} rows)`)
  const byOrphan: Record<string, { n: number; $: number; filed: Set<string> }> = {}
  for (const r of orphan) {
    const k = r.pdf
    byOrphan[k] = byOrphan[k] ?? { n: 0, $: 0, filed: new Set() }
    byOrphan[k].n++
    byOrphan[k].filed.add(r.supplierName)
    if (LIVE.includes(r.status)) byOrphan[k].$ += Math.abs(Number(r.total ?? 0))
  }
  for (const [k, v] of Object.entries(byOrphan).sort((a, b) => b[1].$ - a[1].$))
    console.log(`   ${String(v.n).padStart(3)} rows  $${v.$.toFixed(2).padStart(11)}  "${k}"  (filed as ${[...v.filed].join(", ")})`)
  console.log(`\n   → non-food overheads. Marked REJECTED so they leave COGS; rows and PDFs kept for audit.`)

  console.log(`\n■ FOOD suppliers with no Supplier row — LEFT ALONE (${foodOrphan.length} rows)`)
  const byFood: Record<string, { n: number; $: number; filed: Set<string> }> = {}
  for (const r of foodOrphan) {
    byFood[r.pdf] = byFood[r.pdf] ?? { n: 0, $: 0, filed: new Set() }
    byFood[r.pdf].n++
    byFood[r.pdf].filed.add(r.supplierName)
    if (LIVE.includes(r.status)) byFood[r.pdf].$ += Math.abs(Number(r.total ?? 0))
  }
  for (const [k, v] of Object.entries(byFood).sort((a, b) => b[1].$ - a[1].$))
    console.log(`   ${String(v.n).padStart(3)} rows  $${v.$.toFixed(2).padStart(11)}  "${k}"  (filed as ${[...v.filed].join(", ")})`)
  console.log(`   → real food spend. Create a Supplier row for each, then re-run to reassign.`)

  // ── 3. COGS impact by month ───────────────────────────────────────────
  const impact: Record<string, number> = {}
  for (const r of [...reassign, ...orphan, ...foodOrphan]) {
    if (!LIVE.includes(r.status) || !r.invoiceDate) continue
    const m = new Date(r.invoiceDate).toISOString().slice(0, 7)
    impact[m] = (impact[m] ?? 0) + Math.abs(Number(r.total ?? 0))
  }
  console.log(`\n■ spend currently on the wrong supplier, by month:`)
  for (const [m, v] of Object.entries(impact).sort())
    console.log(`   ${m}  $${v.toFixed(2).padStart(11)}`)

  if (!APPLY) {
    console.log(`\n◦ dry run complete — ${reassign.length} reassignable, ${orphan.length} to mark REJECTED, ${foodOrphan.length} left for a supplier record. Nothing written.`)
    await db.$disconnect(); await pool.end(); return
  }

  // ── 4. rollback file, written BEFORE anything changes ─────────────────
  const backup = [...reassign, ...orphan].map((r) => ({
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    status: r.status,
  }))
  const backupPath = path.resolve(process.cwd(), "scripts/_misattribution-rollback-20260817.json")
  await writeFile(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\n■ rollback snapshot written: ${backupPath} (${backup.length} rows)\n`)

  // ── 5. apply: reassign + reprocess ────────────────────────────────────
  let ok = 0
  const failed: string[] = []
  for (const r of reassign) {
    try {
      await db.invoice.update({
        where: { id: r.id },
        data: { supplierId: r.target.id, supplierName: r.target.name },
      })
      // Re-run the processor so line items, mappings and price history are
      // rebuilt against the correct supplier.
      //
      // Feeds back the STORED extractedData rather than re-parsing the PDF:
      // the PDFs only exist on the droplet, and extractedData is already the
      // serialised ParsedInvoice from the original run. Re-parsing would also
      // re-run the LLM extraction — billable, and not guaranteed to reproduce
      // the same result, which is the last thing you want in a correction.
      if (r.extractedData) {
        await processInvoice(r.id, r.target.id, r.extractedData)
      } else {
        failed.push(`${r.id}: reassigned but no extractedData — line items still map to ${r.supplierName}`)
      }
      ok++
      console.log(`   ✓ ${r.id}  ${r.supplierName} → ${r.target.name}`)
    } catch (e) {
      failed.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`\n■ reassigned: ${ok}/${reassign.length}`)

  // ── 6. non-food overheads out of COGS ─────────────────────────────────
  // REJECTED is now in the exclusion list of every spend/variance/par-level
  // query, so this removes them from food costs while keeping the row and
  // its PDF for audit. Reversible via the rollback snapshot above.
  let rejected = 0
  for (const r of orphan) {
    try {
      await db.invoice.update({
        where: { id: r.id },
        data: {
          status: "REJECTED",
          errorMessage: `Not a food-supplier invoice — letterhead reads "${r.pdf}", was mis-filed as "${r.supplierName}". Excluded from COGS 2026-08-17.`,
        },
      })
      rejected++
    } catch (e) {
      failed.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`■ marked REJECTED (out of COGS): ${rejected}/${orphan.length}`)

  if (failed.length) {
    console.log(`\n■ ${failed.length} failure(s):`)
    for (const f of failed) console.log(`   ✗ ${f}`)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
