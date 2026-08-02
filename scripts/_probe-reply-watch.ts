// One-off probe: replicates the digest's new reviews.responseWatch
// query against prod so we can eyeball the numbers before Friday.
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rows = await pool.query(`
    SELECT venue, rating, "authorName", "taggedSummary", sentiment,
           "publishTime"::text,
           ("replyText" IS NOT NULL AND length(trim("replyText")) > 0) AS answered,
           CASE WHEN "replyTime" IS NOT NULL
                THEN EXTRACT(EPOCH FROM ("replyTime" - "publishTime")) / 86400
           END::float AS response_days
    FROM "GoogleReview"
    WHERE "publishTime" >= NOW() - INTERVAL '28 days'
      AND (rating <= 3 OR sentiment IN ('NEGATIVE','MIXED'))
    ORDER BY "publishTime" ASC`);
  console.log(`negatives last 28d: ${rows.rows.length}`);
  for (const r of rows.rows) {
    console.log(
      `  ${r.publishTime.slice(0, 10)} ${r.venue} ${r.rating}★ ${r.authorName ?? "anon"} ` +
        `answered=${r.answered}${r.response_days != null ? ` (${r.response_days.toFixed(1)}d)` : ""} ` +
        `| ${r.taggedSummary ?? ""}`
    );
  }
  const answered = rows.rows.filter((r) => r.answered);
  const days = answered
    .map((r) => r.response_days)
    .filter((d) => d != null && d >= 0)
    .sort((a, b) => a - b);
  console.log(
    `summary: ${answered.length}/${rows.rows.length} answered, median ${days.length ? days[Math.floor(days.length / 2)].toFixed(1) + "d" : "n/a"}`
  );
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
