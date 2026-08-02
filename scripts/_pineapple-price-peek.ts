// READ-ONLY: recent pineapple invoice lines with unit prices, newest first.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const rows = await db.invoiceLineItem.findMany({
    where: { description: { contains: "pineapple", mode: "insensitive" } },
    include: { invoice: { select: { supplierName: true, invoiceDate: true, venue: true } } },
    orderBy: { invoice: { invoiceDate: "desc" } },
    take: 30,
  })
  for (const r of rows) {
    const d = r.invoice?.invoiceDate?.toISOString().slice(0, 10) ?? "?"
    console.log(
      `${d} | ${r.invoice?.supplierName ?? "?"} | ${r.invoice?.venue ?? ""} | ${r.description} | qty=${r.quantity} unit=$${r.unitPrice} total=$${r.lineTotal}`
    )
  }
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
