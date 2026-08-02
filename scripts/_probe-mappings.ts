// READ-ONLY: are the new SupplierEmail mappings actually in prod?
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rows = await pool.query(`
    SELECT se.email, s.name, se."createdAt"
    FROM "SupplierEmail" se JOIN "Supplier" s ON s.id = se."supplierId"
    ORDER BY se."createdAt" DESC LIMIT 25`);
  console.log(JSON.stringify(rows.rows, null, 1));
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM "SupplierEmail"`);
  const withEmail = await pool.query(`SELECT COUNT(*)::int AS n FROM "Supplier" WHERE email IS NOT NULL`);
  console.log("total SupplierEmail rows:", count.rows[0].n, "| suppliers with direct email:", withEmail.rows[0].n);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
