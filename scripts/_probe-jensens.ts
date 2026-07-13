import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`SELECT se.email, s.name FROM "SupplierEmail" se JOIN "Supplier" s ON s.id=se."supplierId" WHERE se.email ILIKE '%jensen%' OR s.name ILIKE '%jensen%' OR s.name ILIKE '%produce oz%'`);
  console.log(JSON.stringify(r.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
