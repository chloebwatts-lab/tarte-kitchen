import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const cov = await pool.query(`
    SELECT MIN(date)::date::text AS from, MAX(date)::date::text AS to, COUNT(DISTINCT date)::int AS days
    FROM "DailySales" WHERE venue='TEA_GARDEN'`);
  console.log("TG item-sales coverage:", JSON.stringify(cov.rows));
  const items = await pool.query(`
    SELECT "menuItemName", SUM("quantitySold")::int AS qty, SUM("revenueExGst")::float AS rev
    FROM "DailySales" WHERE venue='TEA_GARDEN' AND date >= '2026-04-29'
    GROUP BY "menuItemName" ORDER BY rev DESC LIMIT 30`);
  console.log("TG top items since 29 Apr:", JSON.stringify(items.rows));
  const dow = await pool.query(`
    SELECT TRIM(TO_CHAR(date, 'Day')) AS dow, COUNT(DISTINCT date)::int AS days,
           SUM("totalRevenueExGst")::float AS rev, AVG("totalRevenueExGst")::float AS avg_rev,
           AVG("totalCovers")::float AS avg_covers, AVG("averageSpend")::float AS avg_spend
    FROM "DailySalesSummary" WHERE venue='TEA_GARDEN' AND date >= '2026-04-29'
    GROUP BY TRIM(TO_CHAR(date, 'Day')), EXTRACT(DOW FROM date) ORDER BY EXTRACT(DOW FROM date)`);
  console.log("TG by day of week:", JSON.stringify(dow.rows));
  const theo = await pool.query(`
    SELECT COUNT(*)::int AS n, COUNT("theoreticalCogs")::int AS with_theo,
           SUM("theoreticalCogs")::float AS theo, SUM("totalRevenueExGst")::float AS rev
    FROM "DailySalesSummary" WHERE venue='TEA_GARDEN' AND date >= '2026-04-29'`);
  console.log("TG theoretical COGS:", JSON.stringify(theo.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
