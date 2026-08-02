import { readFileSync } from "fs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const classification: Record<
    string,
    { file: string; orderConfirmation: boolean; pages: number }
  > = JSON.parse(readFileSync(process.argv[2], "utf8"))

  const dups = await db.invoice.findMany({
    where: {
      supplierName: { in: ["Coastal Fresh", "Marrow Meats"] },
      status: "DUPLICATE",
    },
    select: {
      id: true,
      gmailMessageId: true,
      supplierName: true,
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
      errorMessage: true,
    },
    orderBy: { invoiceDate: "asc" },
  })

  console.log(`DUPLICATE rows for Fresho suppliers: ${dups.length}\n`)
  let realDupedAgainstConf = 0
  let lostActual = 0
  let keptIndicative = 0
  for (const d of dups) {
    const isConf = classification[d.gmailMessageId]?.orderConfirmation ?? null
    const dupOfId = d.errorMessage?.match(/Duplicate of invoice (\S+)/)?.[1]
    let keptIsConf: boolean | null = null
    let keptTotal: string | null = null
    if (dupOfId) {
      const kept = await db.invoice.findUnique({
        where: { id: dupOfId },
        select: { gmailMessageId: true, total: true, status: true },
      })
      if (kept) {
        keptIsConf = classification[kept.gmailMessageId]?.orderConfirmation ?? null
        keptTotal = `${kept.total} (${kept.status})`
      }
    }
    console.log(
      `${d.invoiceDate?.toISOString().slice(0, 10)} ${d.supplierName.padEnd(14)} ${String(
        d.invoiceNumber
      ).padEnd(12)} $${String(d.total).padEnd(8)} thisIsConf=${isConf} keptIsConf=${keptIsConf} keptTotal=${keptTotal}`
    )
    if (isConf === false && keptIsConf === true) {
      realDupedAgainstConf++
      lostActual += Number(d.total ?? 0)
      keptIndicative += Number(keptTotal?.split(" ")[0] ?? 0)
    }
  }
  console.log(
    `\nREAL invoices wrongly duplicated against a confirmation: ${realDupedAgainstConf}`
  )
  console.log(
    `actual spend discarded: $${lostActual.toFixed(2)}; indicative kept: $${keptIndicative.toFixed(2)}`
  )
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
