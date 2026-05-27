import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 60000,
  query_timeout: 60000,
});

async function main() {
  console.log("=== SupplierItemMapping ===");
  const mappings = await pool.query(`
    SELECT m.id, m."supplierName", m."normalizedName", m."unitPrice", m.unit, m.quantity, s.name as supplier
    FROM "SupplierItemMapping" m
    LEFT JOIN "Supplier" s ON s.id = m."supplierId"
    WHERE m."supplierName" ILIKE '%kecap%' OR m."supplierName" ILIKE '%polpa%'
       OR m."normalizedName" ILIKE '%kecap%' OR m."normalizedName" ILIKE '%polpa%'
    ORDER BY m.id DESC
    LIMIT 20;
  `);
  console.log(JSON.stringify(mappings.rows, null, 2));

  console.log("\n=== ApprovedSupplierItem ===");
  const approved = await pool.query(`
    SELECT name, "packSize", "packPrice", unit, category
    FROM "ApprovedSupplierItem"
    WHERE name ILIKE '%kecap%' OR name ILIKE '%polpa%' OR name ILIKE '%ketjap%'
    LIMIT 20;
  `);
  console.log(JSON.stringify(approved.rows, null, 2));

  console.log("\n=== InvoiceLineItem (recent) ===");
  const lines = await pool.query(`
    SELECT i.description, i.quantity, i."unitPrice", i."lineTotal", i.unit,
           inv."invoiceDate", s.name as supplier
    FROM "InvoiceLineItem" i
    JOIN "Invoice" inv ON inv.id = i."invoiceId"
    LEFT JOIN "Supplier" s ON s.id = inv."supplierId"
    WHERE inv."invoiceDate" > NOW() - INTERVAL '6 months'
      AND (i.description ILIKE '%kecap%' OR i.description ILIKE '%polpa%' OR i.description ILIKE '%ketjap%')
    ORDER BY inv."invoiceDate" DESC
    LIMIT 30;
  `);
  console.log(JSON.stringify(lines.rows, null, 2));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
