// READ-ONLY: what's sitting in the unknown-sender review queue?
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT "senderEmail", "senderName", COUNT(*)::int AS msgs, SUM(occurrences)::int AS occurrences,
           MIN("firstSeenAt")::date::text AS first_seen, MAX("lastSeenAt")::date::text AS last_seen,
           BOOL_OR(resolved) AS any_resolved,
           (ARRAY_AGG(subject ORDER BY "lastSeenAt" DESC))[1] AS latest_subject
    FROM "UnknownInvoiceSender"
    GROUP BY "senderEmail", "senderName"
    ORDER BY MAX("lastSeenAt") DESC`);
  console.log(JSON.stringify(q.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
