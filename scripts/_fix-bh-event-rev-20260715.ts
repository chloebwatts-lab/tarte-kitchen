import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    UPDATE "LabourWeekActual"
    SET "revenueExGst" = 85094.46,
        "cogsPct" = 33.70,
        notes = COALESCE(notes || ' | ', '') || 'Rev adjusted +$2090.91 ex GST (event $2300 inc GST missing from Mge PDF; was $83003.55, cogsPct was 34.55) per Chloe 2026-07-23'
    WHERE venue = 'BEACH_HOUSE' AND "weekStartWed" = '2026-07-15'
      AND "revenueExGst" = 83003.55
    RETURNING venue, "weekStartWed"::date::text, "revenueExGst"::float, "cogsPct"::float, notes`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
