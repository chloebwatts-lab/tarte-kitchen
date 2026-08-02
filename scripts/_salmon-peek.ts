// READ-ONLY: find salmon line items on invoices to identify brand/origin.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const lines = await db.invoiceLineItem.findMany({
    where: { description: { contains: "salmon", mode: "insensitive" } },
    select: { description: true, invoice: { select: { supplierName: true, invoiceDate: true } } },
    orderBy: { id: "desc" }, take: 200,
  })
  const seen = new Map<string, { n: number; sup: string; last: string }>()
  for (const l of lines) {
    const k = l.description.trim()
    const e = seen.get(k) ?? { n: 0, sup: l.invoice?.supplierName ?? "-", last: "" }
    e.n++; e.last ||= l.invoice?.invoiceDate?.toISOString().slice(0, 10) ?? ""
    seen.set(k, e)
  }
  for (const [d, e] of seen) console.log(`${e.n}x | ${d} | ${e.sup} | last ${e.last}`)
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
