// READ-ONLY: what did each orphan letterhead actually sell? Food or overhead?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { letterheadMatches } from "../src/lib/invoices/supplier-match"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const suppliers: any[] = await db.$queryRawUnsafe(`SELECT id, name FROM "Supplier"`)
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "supplierId", "supplierName", "extractedData"->>'supplierName' pdf
    FROM "Invoice" WHERE "extractedData"->>'supplierName' IS NOT NULL`)

  const orphanIds: Record<string, string[]> = {}
  for (const r of rows) {
    if (letterheadMatches(r.supplierName, r.pdf) !== "mismatch") continue
    if (suppliers.some((s) => s.id !== r.supplierId && letterheadMatches(s.name, r.pdf) === "match")) continue
    ;(orphanIds[r.pdf] = orphanIds[r.pdf] ?? []).push(r.id)
  }

  console.log("■ sample line items per orphan letterhead (food vs overhead)\n")
  for (const [name, ids] of Object.entries(orphanIds).sort()) {
    const li: any[] = await db.$queryRawUnsafe(
      `SELECT description FROM "InvoiceLineItem" WHERE "invoiceId" = ANY($1) LIMIT 6`, ids)
    console.log(`   ${name}  (${ids.length} invoice${ids.length > 1 ? "s" : ""})`)
    if (li.length === 0) console.log(`      (no line items stored)`)
    for (const l of li) console.log(`      · ${String(l.description).slice(0, 80)}`)
    console.log()
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
