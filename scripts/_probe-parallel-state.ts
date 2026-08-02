import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    SELECT id, "supplierName", "invoiceDate"::date::text, total::float, venue, "invoiceNumber"
    FROM "Invoice"
    WHERE "supplierName" IN ('Parallel Roasters','Breadtop') AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
    ORDER BY "invoiceDate" DESC`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
