// READ-ONLY: did the sweep ingest the newly-mapped suppliers?
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const runs = await pool.query(`
    SELECT mode, "startedAt", "finishedAt", "messagesFound", "invoicesIngested",
           duplicates, statements, healthy, LEFT(COALESCE(errors::text,''),400) AS errors
    FROM "InvoiceSyncRun" ORDER BY "startedAt" DESC LIMIT 8`);
  console.log("sync runs:", JSON.stringify(runs.rows, null, 1));
  const inv = await pool.query(`
    SELECT "supplierName", COUNT(*)::int n, MIN("invoiceDate")::date::text oldest,
           MAX("invoiceDate")::date::text newest, SUM(total)::float total,
           ARRAY_AGG(DISTINCT status) statuses
    FROM "Invoice"
    WHERE "createdAt" > NOW() - INTERVAL '26 hours'
    GROUP BY "supplierName" ORDER BY n DESC`);
  console.log("invoices created last 26h:", JSON.stringify(inv.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
