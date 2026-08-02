import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const tg = await pool.query(`
    SELECT "weekStartWed"::date::text AS wk, "revenueExGst"::float, "grossWages"::float, "cogsActual"::float, "cogsPct"::float
    FROM "LabourWeekActual" WHERE venue='TEA_GARDEN' ORDER BY "weekStartWed" DESC LIMIT 8`);
  console.log("TG history:", JSON.stringify(tg.rows));
  const inv = await pool.query(`
    SELECT venue, SUM(CASE WHEN venue='BOTH' THEN total/2 ELSE total END)::float AS t, COUNT(*)::int n
    FROM "Invoice"
    WHERE "invoiceDate" >= '2026-07-14T14:00:00Z' AND "invoiceDate" < '2026-07-21T14:00:00Z'
      AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
      AND venue IN ('BEACH_HOUSE','TEA_GARDEN','BOTH')
    GROUP BY venue`);
  console.log("Currumbin invoices wk 15-21 Jul by venue:", JSON.stringify(inv.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
