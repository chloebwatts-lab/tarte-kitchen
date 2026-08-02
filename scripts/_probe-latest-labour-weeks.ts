import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rows = await pool.query(`
    SELECT venue, "weekStartWed"::date::text AS wk,
           "revenueExGst"::float, "grossWages"::float,
           "grossWagesExAdmin"::float, "grossWagesLessLeaveBackpay"::float,
           "wagesBarista"::float, "wagesChef"::float, "wagesFoh"::float,
           "wagesKp"::float, "wagesPastry"::float, "wagesAdmin"::float,
           "cogsActual"::float, "cogsPct"::float, source, notes
    FROM "LabourWeekActual"
    WHERE "weekStartWed" >= '2026-07-01'
    ORDER BY "weekStartWed" DESC, venue`);
  console.log(JSON.stringify(rows.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
