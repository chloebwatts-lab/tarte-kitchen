// READ-ONLY: error details from the last sweep + gmail watermark.
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const runs = await pool.query(`
    SELECT mode, "startedAt", errors, "errorSummary"
    FROM "InvoiceSyncRun" WHERE mode='sweep' ORDER BY "startedAt" DESC LIMIT 1`);
  console.log(JSON.stringify(runs.rows, null, 1));
  const g = await pool.query(`SELECT "lastScanAt" FROM "GmailConnection" LIMIT 2`);
  console.log("lastScanAt:", JSON.stringify(g.rows));
  const inv = await pool.query(`
    SELECT "supplierName", status, COUNT(*)::int n
    FROM "Invoice"
    WHERE "supplierName" IN ('Gold Coast Eggs','Fermex','Made Brands','PE Foods','Parallel Roasters','Mediterranean Markets','Salumi','Cookers','Moet Hennessy','Breadtop')
    GROUP BY 1,2 ORDER BY 1,2`);
  console.log("new-supplier invoice rows (all time):", JSON.stringify(inv.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
