import { readFileSync } from "fs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

// pdf_classification.json from scan_confirmations.py — gmailMessageId →
// { orderConfirmation, file, pages }
const CLASSIFICATION_PATH = process.argv[2]

async function main() {
  const classification: Record<
    string,
    { file: string; orderConfirmation: boolean; pages: number }
  > = JSON.parse(readFileSync(CLASSIFICATION_PATH, "utf8"))

  const keys = Object.keys(classification)
  const invoices = await db.invoice.findMany({
    where: { gmailMessageId: { in: keys } },
    select: {
      id: true,
      gmailMessageId: true,
      supplierName: true,
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
      status: true,
    },
  })
  const byKey = new Map(invoices.map((i) => [i.gmailMessageId, i]))

  let activeConfTotal = 0
  const activeConf: typeof invoices = []
  const statusCounts: Record<string, number> = {}
  let noRow = 0
  for (const key of keys) {
    if (!classification[key].orderConfirmation) continue
    const inv = byKey.get(key)
    if (!inv) {
      noRow++
      continue
    }
    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1
    if (!["DUPLICATE", "ERROR", "STATEMENT"].includes(inv.status)) {
      activeConf.push(inv)
      activeConfTotal += Number(inv.total ?? 0)
    }
  }

  console.log(`confirmation PDFs with a DB row, by status:`, statusCounts)
  console.log(`confirmation PDFs with no DB row: ${noRow}`)
  console.log(
    `\nACTIVE (spend-counted) order confirmations: ${activeConf.length}, total $${activeConfTotal.toFixed(2)}\n`
  )
  for (const inv of activeConf.sort(
    (a, b) => (a.invoiceDate?.getTime() ?? 0) - (b.invoiceDate?.getTime() ?? 0)
  )) {
    console.log(
      `${inv.id} ${inv.supplierName.padEnd(14)} ${String(inv.invoiceNumber).padEnd(12)} ${
        inv.invoiceDate?.toISOString().slice(0, 10) ?? "null      "
      } $${inv.total} ${inv.status}`
    )
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
