import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const pairs = await db.$queryRaw<
    Array<{ supplierName: string; invoiceNumber: string; n: bigint }>
  >`SELECT "supplierName", "invoiceNumber", COUNT(*) AS n
    FROM "Invoice"
    WHERE status NOT IN ('DUPLICATE','ERROR','STATEMENT','ORDER_CONFIRMATION')
      AND "invoiceNumber" IS NOT NULL
    GROUP BY 1,2 HAVING COUNT(*) > 1
    ORDER BY 1,2`

  console.log(`=== ${pairs.length} duplicated (supplier, invoiceNumber) pairs ===\n`)

  for (const p of pairs) {
    const rows = await db.invoice.findMany({
      where: {
        supplierName: p.supplierName,
        invoiceNumber: p.invoiceNumber,
        status: { notIn: ["DUPLICATE", "ERROR", "STATEMENT", "ORDER_CONFIRMATION"] },
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "asc" },
    })
    console.log(`--- ${p.supplierName} | ${p.invoiceNumber} | ${rows.length} rows ---`)
    for (const r of rows) {
      console.log(
        `  id=${r.id} status=${r.status} gmailMsg=${r.gmailMessageId} created=${r.createdAt.toISOString().slice(0, 16)}`
      )
      console.log(
        `    invoiceDate=${r.invoiceDate?.toISOString().slice(0, 10) ?? "null"} total=${r.total} subtotal=${r.subtotal} lines=${r.lineItems.length} venue=${r.venue} pdf=${r.pdfUrl}`
      )
      const preview = r.lineItems
        .slice(0, 4)
        .map((li) => `${li.description} x${li.quantity} @${li.unitPrice} = ${li.lineTotal}`)
        .join(" | ")
      console.log(`    lines: ${preview}${r.lineItems.length > 4 ? " …" : ""}`)
      const ed = r.extractedData as Record<string, unknown> | null
      if (ed) {
        console.log(
          `    parsed: docType=${ed.documentType} invNum=${ed.invoiceNumber} date=${ed.invoiceDate} billTo=${String(ed.billTo ?? "").slice(0, 60)}`
        )
      }
    }
    console.log()
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
