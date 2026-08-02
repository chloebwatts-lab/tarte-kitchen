import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    SELECT "supplierName", "invoiceDate"::date::text, total::float, venue
    FROM "Invoice"
    WHERE venue IS NULL AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
      AND "invoiceDate" >= '2026-07-07T14:00:00Z'
    ORDER BY "invoiceDate" DESC`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
