import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const inv = await pool.query(`
    SELECT "supplierName", status, COUNT(*)::int n, SUM(total)::float total
    FROM "Invoice"
    WHERE "supplierName" IN ('El Chori','Gold Coast Premium Foods','Parallel Roasters')
    GROUP BY 1,2 ORDER BY 1,2`);
  console.log("xero trio:", JSON.stringify(inv.rows));
  const un = await pool.query(`
    SELECT COUNT(*)::int n, SUM(total)::float total FROM "Invoice"
    WHERE venue IS NULL AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
      AND "createdAt" > NOW() - INTERVAL '3 hours'`);
  console.log("new unassigned (3h):", JSON.stringify(un.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
