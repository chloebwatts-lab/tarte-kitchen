// READ-ONLY: when/how were the WRONG_SUPPLIER clusters ingested?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const q: any[] = await db.$queryRawUnsafe(`
    SELECT "supplierName", "extractedData"->>'supplierName' pdf,
           min("createdAt")::date first_ingest, max("createdAt")::date last_ingest,
           min("invoiceDate")::date first_inv, max("invoiceDate")::date last_inv,
           count(*) n, count("rawEmailFrom") with_from,
           count(*) FILTER (WHERE "gmailMessageId" ~ '^[0-9a-f]{16}$') gmail_native,
           min("gmailMessageId") sample_gid
    FROM "Invoice"
    WHERE "supplierName" IN ('Pixel Bread','Paramount Liquor','Cheese Time','Son Of A Bunn','EasyVend')
      AND "extractedData"->>'supplierName' IS NOT NULL
    GROUP BY 1,2 HAVING count(*) > 0 ORDER BY 1, count(*) DESC`)
  console.log("■ ingestion fingerprint per (stored supplier, PDF letterhead)")
  let cur = ""
  for (const r of q) {
    if (r.supplierName !== cur) { cur = r.supplierName; console.log(`\n  ── ${cur} ──`) }
    console.log(`   ${String(r.n).padStart(3)}  pdf="${r.pdf}"`)
    console.log(`        ingested ${r.first_ingest?.toISOString?.().slice(0,10) ?? r.first_ingest} … ${r.last_ingest?.toISOString?.().slice(0,10) ?? r.last_ingest}   invoiceDate ${r.first_inv?.toISOString?.().slice(0,10) ?? r.first_inv} … ${r.last_inv?.toISOString?.().slice(0,10) ?? r.last_inv}`)
    console.log(`        rawEmailFrom set on ${r.with_from}/${r.n}   gmail-native ids ${r.gmail_native}/${r.n}   sample "${r.sample_gid}"`)
  }

  // Distinct gmailMessageId shapes across the whole table = ingestion paths
  const shapes: any[] = await db.$queryRawUnsafe(`
    SELECT CASE
             WHEN "gmailMessageId" ~ '^[0-9a-f]{16}$' THEN 'gmail native'
             WHEN "gmailMessageId" ~ '^[0-9a-f]{16}-a[0-9]+$' THEN 'gmail native + attachment suffix'
             ELSE 'OTHER: ' || left("gmailMessageId", 24)
           END shape, count(*) n, min("createdAt")::date first, max("createdAt")::date last
    FROM "Invoice" GROUP BY 1 ORDER BY count(*) DESC LIMIT 25`)
  console.log("\n■ gmailMessageId shapes (= ingestion paths)")
  for (const s of shapes)
    console.log(`   ${String(s.n).padStart(4)}  ${String(s.shape).padEnd(45)} ${s.first?.toISOString?.().slice(0,10) ?? s.first} … ${s.last?.toISOString?.().slice(0,10) ?? s.last}`)

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
