// READ-ONLY: which sender addresses feed the mis-attributing suppliers?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const focus = ["Cheese Time", "Paramount Liquor", "Pixel Bread", "EasyVend", "Son Of A Bunn", "Eustralis", "Breadtop", "Coastal Fresh"]

  const emails: any[] = await db.$queryRawUnsafe(`
    SELECT s.name, s.email AS primary_email,
           coalesce(array_agg(lower(se.email)) FILTER (WHERE se.email IS NOT NULL), '{}') AS extra
    FROM "Supplier" s LEFT JOIN "SupplierEmail" se ON se."supplierId" = s.id
    WHERE s.name = ANY($1)
    GROUP BY s.id, s.name, s.email ORDER BY s.name`, focus)
  console.log("■ email map for the mis-attributing suppliers")
  for (const e of emails) {
    console.log(`   ${e.name}`)
    console.log(`      Supplier.email : ${e.primary_email ?? "(none)"}`)
    console.log(`      SupplierEmail  : ${e.extra.length ? e.extra.join(", ") : "(none)"}`)
  }

  // every address and how many suppliers it maps to (full picture)
  const all: any[] = await db.$queryRawUnsafe(`
    SELECT email, count(*) n, array_agg(name ORDER BY name) suppliers FROM (
      SELECT lower(se.email) email, s.name FROM "SupplierEmail" se JOIN "Supplier" s ON s.id = se."supplierId"
      UNION
      SELECT lower(s.email), s.name FROM "Supplier" s WHERE s.email IS NOT NULL
    ) x GROUP BY email ORDER BY count(*) DESC, email`)
  console.log(`\n■ full sender map (${all.length} addresses)`)
  for (const r of all) console.log(`   ${String(r.n).padStart(2)}  ${r.email.padEnd(42)} ${r.suppliers.join(" | ")}`)

  // is rawEmailFrom ever populated?
  const raw: any[] = await db.$queryRawUnsafe(`
    SELECT count(*) total, count("rawEmailFrom") with_from FROM "Invoice"`)
  console.log(`\n■ Invoice.rawEmailFrom populated on ${raw[0].with_from} of ${raw[0].total} rows`)

  // per-supplier mismatch rate, to separate "shared inbox" from "parser noise"
  const rate: any[] = await db.$queryRawUnsafe(`
    SELECT "supplierName", count(*) n,
           count(*) FILTER (WHERE "extractedData"->>'supplierName' IS NOT NULL) with_pdf
    FROM "Invoice" GROUP BY 1 ORDER BY count(*) DESC LIMIT 40`)
  console.log(`\n■ invoice volume by stored supplierName (top 40)`)
  for (const r of rate) console.log(`   ${String(r.n).padStart(4)}  ${r.supplierName}`)

  // the Cheese Time mis-attributions in full, with dates + gmail ids
  const ct: any[] = await db.$queryRawUnsafe(`
    SELECT id, "invoiceNumber", "invoiceDate", total, status::text, "gmailMessageId", "pdfUrl",
           "extractedData"->>'supplierName' pdf_supplier
    FROM "Invoice" WHERE "supplierName" = 'Cheese Time' ORDER BY "invoiceDate" DESC NULLS LAST`)
  const bad = ct.filter((r) => {
    const p = (r.pdf_supplier ?? "").toLowerCase()
    return p && !p.includes("cheese")
  })
  console.log(`\n■ Cheese Time: ${ct.length} invoices, ${bad.length} whose PDF letterhead is not "Cheese*"`)
  for (const r of bad)
    console.log(`   ${r.invoiceDate ? new Date(r.invoiceDate).toISOString().slice(0,10) : "????"}  ${r.invoiceNumber}  $${r.total}  ${r.status}  pdf="${r.pdf_supplier}"  ${r.gmailMessageId}`)

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
