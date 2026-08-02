// READ-ONLY probe: current-week spend + revenue + missing-supplier state.
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function tarteWeekStart(now: Date): Date {
  // Wed 00:00 AEST expressed in UTC (Wed 00:00 AEST = Tue 14:00 UTC)
  const AEST = 10 * 60 * 60 * 1000;
  const aest = new Date(now.getTime() + AEST);
  const dow = aest.getUTCDay(); // 0 Sun ... 3 Wed
  const daysBack = (dow - 3 + 7) % 7;
  const startAest = new Date(Date.UTC(aest.getUTCFullYear(), aest.getUTCMonth(), aest.getUTCDate() - daysBack));
  return new Date(startAest.getTime() - AEST);
}

async function main() {
  const now = new Date();
  const start = tarteWeekStart(now);
  const end = new Date(start.getTime() + 7 * 86400000);
  console.log("week start (UTC):", start.toISOString(), "end:", end.toISOString());

  const inv = await pool.query(
    `SELECT venue, COUNT(*)::int AS n, SUM(total)::float AS total
     FROM "Invoice"
     WHERE "invoiceDate" >= $1 AND "invoiceDate" < $2
       AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
     GROUP BY venue ORDER BY venue`, [start, end]);
  console.log("this-week invoices by venue:", JSON.stringify(inv.rows, null, 1));

  const sales = await pool.query(
    `SELECT date::text, venue, "totalRevenue"::float AS inc, "totalRevenueExGst"::float AS ex, source
     FROM "DailySalesSummary"
     WHERE date >= (CURRENT_DATE - 14)
     ORDER BY date DESC, venue`, []);
  console.log("DailySalesSummary last 14d:", JSON.stringify(sales.rows, null, 1));

  const fc = await pool.query(
    `SELECT "weekStartWed"::text, venue, amount::float
     FROM "ManagerSalesForecast"
     WHERE "weekStartWed" >= $1::timestamp - interval '7 days'
     ORDER BY "weekStartWed" DESC, venue`, [start]);
  console.log("forecasts:", JSON.stringify(fc.rows, null, 1));

  const latest = await pool.query(
    `SELECT "supplierName", MAX("invoiceDate")::date::text AS last_seen, COUNT(*)::int AS n
     FROM "Invoice"
     WHERE status NOT IN ('ERROR','STATEMENT','DUPLICATE')
     GROUP BY "supplierName" ORDER BY MAX("invoiceDate") DESC NULLS LAST LIMIT 40`, []);
  console.log("latest invoice per supplier:", JSON.stringify(latest.rows, null, 1));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
