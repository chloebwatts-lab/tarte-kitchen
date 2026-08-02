// READ-ONLY: list unassigned/BOTH invoices for week 2026-07-08
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) })
async function main() {
  const rows = await db.invoice.findMany({
    where: {
      invoiceDate: { gte: new Date("2026-07-08"), lt: new Date("2026-07-15") },
      OR: [{ venue: null }, { venue: "BOTH" as any }],
    },
    select: { supplierName: true, invoiceNumber: true, invoiceDate: true, subtotal: true, total: true, venue: true },
    orderBy: { subtotal: "desc" },
  })
  for (const r of rows)
    console.log(
      `${r.invoiceDate?.toISOString().slice(0, 10)} ${r.supplierName} #${r.invoiceNumber} $${Number(r.subtotal ?? r.total).toFixed(0)} venue=${r.venue}`
    )
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
