import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    SELECT date::text, venue, "totalRevenueExGst"::float ex, "createdAt"
    FROM "DailySalesSummary" WHERE date >= '2026-07-12' ORDER BY date, venue`);
  console.log(JSON.stringify(r.rows, null, 1));
  const imp = await pool.query(`
    SELECT "reportDate"::text, venue, "createdAt" FROM "LightspeedReportImport"
    ORDER BY "createdAt" DESC LIMIT 6`);
  console.log("imports:", JSON.stringify(imp.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
