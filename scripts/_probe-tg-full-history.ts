import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const tg = await pool.query(`
    SELECT "weekStartWed"::date::text AS wk, "revenueExGst"::float AS rev, "grossWages"::float AS wages
    FROM "LabourWeekActual" WHERE venue='TEA_GARDEN' ORDER BY "weekStartWed"`);
  let trev = 0, twages = 0;
  for (const r of tg.rows) { trev += r.rev ?? 0; twages += r.wages ?? 0; }
  console.log(JSON.stringify(tg.rows));
  console.log("weeks:", tg.rows.length, "total rev:", trev.toFixed(2), "total wages:", twages.toFixed(2), "wage%:", (twages/trev*100).toFixed(1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
