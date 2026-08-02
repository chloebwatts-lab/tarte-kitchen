import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const nbi = await pool.query(`
    SELECT DATE_TRUNC('month', booking_date)::date::text AS mo, COUNT(*)::int n,
           SUM(total_amount)::float paid, SUM(pax)::int pax
    FROM inbox_nbi_bookings
    WHERE service ILIKE '%tea%' AND status NOT IN ('Cancelled')
    GROUP BY 1 ORDER BY 1`);
  console.log("NBI tea bookings by month:", JSON.stringify(nbi.rows));
  const pos = await pool.query(`
    SELECT SUM("totalRevenueExGst")::float FROM "DailySalesSummary"
    WHERE venue='TEA_GARDEN' AND date >= '2026-06-01' AND date < '2026-07-01'`);
  console.log("TG POS-import June ex GST:", JSON.stringify(pos.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
