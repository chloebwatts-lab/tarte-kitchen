import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    SELECT b.id, b.customer_name, b.event_date::text, b.state, i.invoice_number
      FROM inbox_bookings b
      LEFT JOIN LATERAL (SELECT invoice_number FROM inbox_invoices
        WHERE thread_id = b.thread_id AND thread_id <> '' ORDER BY id DESC LIMIT 1) i ON TRUE
     WHERE b.event_date IS NOT NULL
       AND b.event_date < (now() AT TIME ZONE 'Australia/Brisbane')::date
       AND b.state NOT IN ('cancelled','paid')
       AND b.post_event_flagged_at IS NULL
     ORDER BY b.event_date`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
