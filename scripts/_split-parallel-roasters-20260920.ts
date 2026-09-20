// Parallel Roasters single weekly invoices: apply Chloe's 55% Burleigh, 45%
// Currumbin rule (2026-09-20) to the ones that landed with no venue since
// 12 Aug 2026, so coffee counts in both venues' spend.
//
// Mechanism: the invoice gets venue BOTH (the existing shared-spend marker)
// and the spend tracker reads the 55/45 ratio from src/lib/spend/shared-split.ts.
// Only ever touches rows whose venue is still empty, so it is safe to re-run
// and never overrides a venue someone tapped. Nothing is deleted. Writes a
// before snapshot to scripts/_split-parallel-roasters-rollback-20260920.json.
//
// DRY RUN BY DEFAULT, pass --apply to write.
//   npx tsx --env-file=.env.local scripts/_split-parallel-roasters-20260920.ts
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { writeFile } from "fs/promises"
import path from "path"
import { PARALLEL_SINGLE_INVOICE_FROM, sharedSplit } from "../src/lib/spend/shared-split"

const APPLY = process.argv.includes("--apply")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
const LIVE = { notIn: ["ERROR", "STATEMENT", "DUPLICATE", "ORDER_CONFIRMATION", "REJECTED"] as never[] }

async function main() {
  console.log(APPLY ? "APPLY MODE, writing changes\n" : "DRY RUN, nothing will be written (pass --apply)\n")
  const split = sharedSplit("Parallel Roasters")
  const rows = await db.invoice.findMany({
    where: {
      supplierName: "Parallel Roasters",
      venue: null,
      status: LIVE,
      invoiceDate: { gte: PARALLEL_SINGLE_INVOICE_FROM },
    },
    select: { id: true, invoiceNumber: true, invoiceDate: true, total: true, subtotal: true, gst: true, venue: true, status: true },
    orderBy: { invoiceDate: "asc" },
  })
  let sum = 0
  for (const r of rows) {
    const total = Number(r.total ?? 0)
    sum += total
    console.log(
      `  ${r.invoiceDate?.toISOString().slice(0, 10)} ${r.invoiceNumber} $${total.toFixed(2)} inc GST: venue none -> BOTH ` +
        `(Burleigh $${(total * split.BURLEIGH).toFixed(2)}, Currumbin $${(total * split.CURRUMBIN).toFixed(2)})`
    )
  }
  console.log(`\n${rows.length} invoice(s), $${sum.toFixed(2)} inc GST: Burleigh $${(sum * split.BURLEIGH).toFixed(2)}, Currumbin $${(sum * split.CURRUMBIN).toFixed(2)}`)
  if (!APPLY || rows.length === 0) return

  const backupPath = path.resolve(process.cwd(), "scripts/_split-parallel-roasters-rollback-20260920.json")
  await writeFile(backupPath, JSON.stringify(rows.map((r) => ({ id: r.id, invoiceNumber: r.invoiceNumber, venueBefore: r.venue, venueAfter: "BOTH" })), null, 2))
  console.log(`before snapshot: ${backupPath}`)
  const res = await db.invoice.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, venue: null },
    data: { venue: "BOTH" },
  })
  console.log(`updated: ${res.count}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect(); await pool.end() })
