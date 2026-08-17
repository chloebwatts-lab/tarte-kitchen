// READ-ONLY: confirm the corrective run landed.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const rej: any[] = await db.$queryRawUnsafe(`
    SELECT count(*) n, sum(abs(total)) total
    FROM "Invoice" WHERE status = 'REJECTED'`)
  console.log(`■ REJECTED (now excluded from COGS): ${rej[0].n} rows, $${Number(rej[0].total ?? 0).toFixed(2)}`)

  const moved: any[] = await db.$queryRawUnsafe(`
    SELECT "supplierName", count(*) n, sum(abs(total)) total
    FROM "Invoice"
    WHERE "errorMessage" IS NULL AND "supplierName" IN
      ('Breadtop','Eustralis','Cookers','Marrow Meats','Mediterranean Markets','Parallel Roasters','Pixel Bakehouse','Salumi')
    GROUP BY 1 ORDER BY 1`)
  console.log(`\n■ receiving suppliers now hold:`)
  for (const m of moved) console.log(`   ${String(m.n).padStart(4)} rows  $${Number(m.total ?? 0).toFixed(2).padStart(11)}  ${m.supplierName}`)

  const orphanLeft: any[] = await db.$queryRawUnsafe(`
    SELECT "extractedData"->>'supplierName' pdf, "supplierName", count(*) n, sum(abs(total)) total
    FROM "Invoice"
    WHERE status <> 'REJECTED'
      AND "extractedData"->>'supplierName' IN
        ('Single Origin Wholesale Pty Ltd','The Limpopo Project','Tasman Distribution Pty Ltd','Noble & Sunday Ltd','Noble & Sunday LTD')
    GROUP BY 1,2 ORDER BY 1`)
  console.log(`\n■ food suppliers still needing a Supplier row (left alone on purpose):`)
  for (const o of orphanLeft)
    console.log(`   ${String(o.n).padStart(3)} rows  $${Number(o.total ?? 0).toFixed(2).padStart(9)}  "${o.pdf}"  currently filed as ${o.supplierName}`)

  // line items must now point at the NEW supplier's mappings, not the old one
  const bad: any[] = await db.$queryRawUnsafe(`
    SELECT count(*) n FROM "InvoiceLineItem" li
    JOIN "Invoice" i ON i.id = li."invoiceId"
    JOIN "SupplierItemMapping" m ON m.id = li."mappingId"
    WHERE m."supplierId" <> i."supplierId"`)
  console.log(`\n■ line items pointing at another supplier's mapping: ${bad[0].n}  (must be 0)`)

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
