import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    SELECT "weekStartWed"::date::text wk, "revenueExGst"::float rev, "grossWages"::float wages,
           "cogsActual"::float cogs
    FROM "LabourWeekActual" WHERE venue='BEACH_HOUSE' ORDER BY "weekStartWed"`);
  let trev=0,tw=0,tc=0,n=0;
  for (const x of r.rows){ if(x.rev){trev+=x.rev;tw+=x.wages??0;tc+=x.cogs??0;n++;} }
  console.log(JSON.stringify(r.rows));
  console.log({weeks:n, totRev:+trev.toFixed(0), totWages:+tw.toFixed(0), totCogs:+tc.toFixed(0),
    wagePct:+(tw/trev*100).toFixed(1), cogsPct:+(tc/trev*100).toFixed(1), avgWeekRev:+(trev/n).toFixed(0)});
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
