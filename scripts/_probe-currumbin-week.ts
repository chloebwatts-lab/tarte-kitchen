import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const bySupplier = await pool.query(`
    SELECT "supplierName", COUNT(*)::int n, SUM(CASE WHEN venue='BOTH' THEN total/2 ELSE total END)::float AS bucket_total,
           MAX(total)::float AS biggest
    FROM "Invoice"
    WHERE "invoiceDate" >= '2026-07-07T14:00:00Z' AND "invoiceDate" < '2026-07-14T14:00:00Z'
      AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
      AND (venue IN ('BEACH_HOUSE','TEA_GARDEN','BOTH'))
    GROUP BY "supplierName" ORDER BY bucket_total DESC`);
  console.log("Currumbin bucket by supplier:", JSON.stringify(bySupplier.rows, null, 1));
  const today = await pool.query(`
    SELECT "supplierName", "invoiceNumber", "invoiceDate"::date::text, total::float, venue, "createdAt"::text
    FROM "Invoice"
    WHERE "createdAt" > NOW() - INTERVAL '20 hours'
      AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
      AND venue IN ('BEACH_HOUSE','TEA_GARDEN','BOTH')
    ORDER BY total DESC LIMIT 12`);
  console.log("ingested last 20h (Currumbin):", JSON.stringify(today.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
