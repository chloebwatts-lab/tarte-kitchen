import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
async function main() {
  const a = await pool.query(`
    SELECT "supplierName", venue, COUNT(*)::int AS invoices, SUM(COALESCE(subtotal, total))::float AS spend,
           MIN("invoiceDate")::text AS first, MAX("invoiceDate")::text AS last
    FROM "Invoice"
    WHERE "invoiceDate" >= '2026-07-06' AND "invoiceDate" <= '2026-08-02' AND status <> 'DISCARDED'
    GROUP BY 1,2 ORDER BY spend DESC NULLS LAST`);
  console.table(a.rows);
  const st = await pool.query(`SELECT status, COUNT(*)::int FROM "Invoice" WHERE "invoiceDate" >= '2026-07-06' GROUP BY 1`);
  console.table(st.rows);
  const li = await pool.query(`
    SELECT i."supplierName", COUNT(li.*)::int AS lines, SUM(li."totalPrice")::float AS linetotal
    FROM "Invoice" i LEFT JOIN "InvoiceLineItem" li ON li."invoiceId"=i.id
    WHERE i."invoiceDate" >= '2026-07-06' AND i."invoiceDate" <= '2026-08-02' AND i.status <> 'DISCARDED'
    GROUP BY 1 ORDER BY 3 DESC NULLS LAST`);
  console.table(li.rows);
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
