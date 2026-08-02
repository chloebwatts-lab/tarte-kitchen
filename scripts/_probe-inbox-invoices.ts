import { Pool } from "pg";
const base = process.env.DATABASE_URL!;
async function tryDb(url: string, label: string) {
  const pool = new Pool({ connectionString: url });
  try {
    const inv = await pool.query(`
      SELECT i.invoice_number, i.amount::float, i.customer_name, i.created_at::date::text, b.venue, b.state, b.event_date::text, b.pax
      FROM inbox_invoices i LEFT JOIN inbox_bookings b ON b.id = i.booking_id
      ORDER BY i.created_at`);
    console.log(label, "invoices:", JSON.stringify(inv.rows, null, 1));
    const nbi = await pool.query(`
      SELECT COUNT(*)::int n, SUM(total_amount)::float total, MIN(booking_date)::text mn, MAX(booking_date)::text mx
      FROM inbox_nbi_bookings WHERE service ILIKE '%tea%'`);
    console.log(label, "nbi tea bookings:", JSON.stringify(nbi.rows));
  } catch (e: any) {
    console.log(label, "ERR:", e.message);
  } finally { await pool.end(); }
}
async function main() {
  await tryDb(base, "tk-db");
  const alt = base.replace(/\/[a-zA-Z_]+(\?|$)/, "/tarte_inbox$1");
  if (alt !== base) await tryDb(alt, "tarte_inbox-db");
}
main();
