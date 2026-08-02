import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rent = await pool.query(`
    SELECT "supplierName", "invoiceNumber", "invoiceDate"::date::text AS d, total::float, venue, status
    FROM "Invoice"
    WHERE ("supplierName" ILIKE '%rent%' OR "supplierName" ILIKE '%realty%' OR "supplierName" ILIKE '%property%'
        OR "supplierName" ILIKE '%lease%' OR "supplierName" ILIKE '%walden%' OR "supplierName" ILIKE '%estate%'
        OR "supplierName" ILIKE '%invest%' OR "supplierName" ILIKE '%holdings%' OR "supplierName" ILIKE '%body corp%')
    ORDER BY "invoiceDate" DESC LIMIT 20`);
  console.log("rent-ish suppliers:", JSON.stringify(rent.rows, null, 1));
  const july = await pool.query(`
    SELECT "supplierName", COUNT(*)::int n, SUM(total)::float t
    FROM "Invoice"
    WHERE "invoiceDate" >= '2026-06-30T14:00:00Z' AND status NOT IN ('ERROR','DUPLICATE')
    GROUP BY "supplierName" HAVING SUM(total) > 3000 ORDER BY t DESC LIMIT 25`);
  console.log("july suppliers >$3k:", JSON.stringify(july.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
