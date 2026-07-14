/**
 * One-off: apply Chris's 2026-07-14 standing venue rules to the invoices
 * already sitting unassigned (the cron applies them automatically from
 * commit e240edf onward).
 */
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const bt = await pool.query(`
    UPDATE "Invoice" SET venue = 'BOTH'
    WHERE "supplierName" = 'Breadtop' AND venue IS NULL
      AND status NOT IN ('ERROR','STATEMENT','DUPLICATE')
    RETURNING "invoiceNumber", total`);
  console.log(`Breadtop → BOTH:`, bt.rows);
  const pr = await pool.query(`
    SELECT id, total::float FROM "Invoice"
    WHERE "supplierName" = 'Parallel Roasters' AND venue IS NULL
      AND status NOT IN ('ERROR','STATEMENT','DUPLICATE') AND total IS NOT NULL
    ORDER BY total DESC`);
  if (pr.rows.length === 2) {
    await pool.query(`UPDATE "Invoice" SET venue='BURLEIGH' WHERE id=$1`, [pr.rows[0].id]);
    await pool.query(`UPDATE "Invoice" SET venue='BEACH_HOUSE' WHERE id=$1`, [pr.rows[1].id]);
    console.log(`Parallel: $${pr.rows[0].total} → BURLEIGH, $${pr.rows[1].total} → BEACH_HOUSE`);
  } else {
    console.log(`Parallel: ${pr.rows.length} unassigned — rule needs exactly 2, skipped`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
