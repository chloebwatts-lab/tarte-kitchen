import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    WITH wk AS (
      SELECT venue, "weekStartWed"::date AS w, "revenueExGst"::float AS rep_rev,
             "grossWages"::float AS gross, "grossWagesExAdmin"::float AS gross_ex_admin,
             "cogsActual"::float AS cogs
      FROM "LabourWeekActual" WHERE "revenueExGst" IS NOT NULL
    ), pos AS (
      SELECT venue, date::date AS d, "totalRevenueExGst"::float AS ex FROM "DailySalesSummary"
    )
    SELECT wk.venue, wk.w::text AS week_start_wed, wk.rep_rev,
           (SELECT COALESCE(SUM(ex),0) FROM pos WHERE pos.venue = wk.venue AND pos.d >= wk.w AND pos.d < wk.w + 7)::float AS pos_rev,
           (SELECT COUNT(*) FROM pos WHERE pos.venue = wk.venue AND pos.d >= wk.w AND pos.d < wk.w + 7)::int AS pos_days,
           wk.gross, wk.gross_ex_admin, wk.cogs
    FROM wk ORDER BY wk.venue, wk.w`);
  const rows = r.rows.map((x: any) => ({
    venue: x.venue, week: x.week_start_wed, posDays: x.pos_days,
    reportRev: x.rep_rev, posRev: Math.round(x.pos_rev * 100) / 100,
    gapDollars: Math.round((x.rep_rev - x.pos_rev) * 100) / 100,
    gapPct: x.pos_rev ? Math.round((x.rep_rev - x.pos_rev) / x.pos_rev * 1000) / 10 : null,
    wagePctOfReport: x.gross ? Math.round(x.gross / x.rep_rev * 1000) / 10 : null,
    wageExAdminPct: x.gross_ex_admin ? Math.round(x.gross_ex_admin / x.rep_rev * 1000) / 10 : null,
    cogsPct: x.cogs ? Math.round(x.cogs / x.rep_rev * 1000) / 10 : null,
  }));
  console.log(JSON.stringify(rows, null, 0).replace(/},/g, "},\n"));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
