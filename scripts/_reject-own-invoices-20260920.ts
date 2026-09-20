// Tail of the 2026-08-17 mis-attribution repair: six documents that the
// letterhead check could not catch are still counted as Paramount Liquor
// spend at Beach House.
//
//   - five of OUR OWN function invoices (Hideout and Tea Garden events, late
//     May 2026, $8,103.00) forwarded from a staff mailbox. The letterhead is
//     Tarte's own entity, which the check treats as "unverifiable".
//   - the Office of Liquor and Gaming Regulation licence fee ($833.10,
//     2 Jul 2026), which shares the word "liquor" with Paramount Liquor.
//
// Same treatment as the 17 Aug repair: status REJECTED (already excluded from
// every spend / variance / par query), row, lines and PDF kept for audit.
// None of the lines is mapped to an ingredient, so no price history moves.
//
// DRY RUN BY DEFAULT. Pass --apply to write.
//   npx tsx --env-file=.env.local scripts/_reject-own-invoices-20260920.ts
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { writeFile } from "fs/promises"
import path from "path"

const APPLY = process.argv.includes("--apply")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const TARGETS: Array<{ id: string; total: number; why: string }> = [
  { id: "cmpnry1fs046q01pk7iksfszs", total: 1335.0, why: "our own function invoice (Baby Shower, The Hideout)" },
  { id: "cmpoq8dz21eni01mcay80jjfp", total: 1513.0, why: "our own function invoice (80th Birthday Lunch, The Hideout)" },
  { id: "cmppbnrn22dk401mcmway23f1", total: 1068.0, why: "our own function invoice (Hens Party high tea, The Hideout)" },
  { id: "cmppbnw602dk601mcjwy1dutj", total: 1602.0, why: "our own function invoice (Bridal Shower high tea, The Hideout)" },
  { id: "cmpxs0yks0paf01nvr63ceqb3", total: 2585.0, why: "our own function invoice (Baby Shower, Tea Garden private hire)" },
  { id: "cmr2ojv5xow3u01mo91qhnhsi", total: 833.1, why: "Office of Liquor and Gaming Regulation licence fee 2026/2027, an overhead" },
]

async function main() {
  console.log(APPLY ? "APPLY MODE, writing changes\n" : "DRY RUN, nothing will be written (pass --apply)\n")
  const rows = await db.invoice.findMany({
    where: { id: { in: TARGETS.map((t) => t.id) } },
    select: {
      id: true, supplierName: true, status: true, total: true, venue: true,
      invoiceDate: true, errorMessage: true,
      lineItems: { select: { ingredientId: true, mappingId: true } },
    },
  })
  const todo: typeof rows = []
  for (const t of TARGETS) {
    const r = rows.find((x) => x.id === t.id)
    if (!r) { console.log(`  missing ${t.id}, skipped`); continue }
    const mapped = r.lineItems.some((l) => l.ingredientId || l.mappingId)
    const totalOk = Math.abs(Number(r.total ?? 0) - t.total) < 0.01
    const ok = r.supplierName === "Paramount Liquor" && r.status === "EXTRACTED" && totalOk && !mapped
    console.log(
      `  ${ok ? "->" : "SKIP"} ${r.id} ${r.invoiceDate?.toISOString().slice(0, 10)} $${Number(r.total).toFixed(2)} ${r.status} ${r.venue} : ${t.why}`
    )
    if (ok) todo.push(r)
  }
  const sum = todo.reduce((s, r) => s + Number(r.total ?? 0), 0)
  console.log(`\n${todo.length} row(s), $${sum.toFixed(2)} to leave Paramount Liquor spend.`)
  if (!APPLY || todo.length === 0) { await db.$disconnect(); await pool.end(); return }

  const backupPath = path.resolve(process.cwd(), "scripts/_reject-own-invoices-rollback-20260920.json")
  await writeFile(
    backupPath,
    JSON.stringify(todo.map((r) => ({ id: r.id, status: r.status, errorMessage: r.errorMessage })), null, 2)
  )
  console.log(`rollback snapshot: ${backupPath}`)

  for (const r of todo) {
    const t = TARGETS.find((x) => x.id === r.id)!
    await db.invoice.update({
      where: { id: r.id },
      data: {
        status: "REJECTED",
        errorMessage: `Not a food-supplier invoice: ${t.why}, was mis-filed as "Paramount Liquor". Excluded from COGS 2026-09-20.`,
      },
    })
  }
  console.log(`marked REJECTED: ${todo.length}`)
  await db.$disconnect(); await pool.end()
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1) })
