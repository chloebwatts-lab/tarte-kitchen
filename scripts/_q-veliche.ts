import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 60000,
  query_timeout: 60000,
});

async function main() {
  console.log("=== Target Ingredient (Veliche White) ===");
  const ing = await pool.query(`
    SELECT id, name, category, "baseUnitType", "supplierId",
           "purchaseQuantity", "purchaseUnit", "purchasePrice", "baseUnitsPerPurchase",
           "gramsPerUnit", "wastePercentage"
    FROM "Ingredient"
    WHERE id = 'cmn8ccf7k00h916qz6nh38k3f';
  `);
  console.log(JSON.stringify(ing.rows, null, 2));

  console.log("\n=== All Veliche / white-choc Ingredients ===");
  const ings = await pool.query(`
    SELECT id, name, "purchaseQuantity", "purchaseUnit", "purchasePrice", "baseUnitsPerPurchase", "baseUnitType"
    FROM "Ingredient"
    WHERE name ILIKE '%veliche%' OR name ILIKE '%white choc%' OR (name ILIKE '%white%' AND name ILIKE '%choc%')
    ORDER BY name;
  `);
  console.log(JSON.stringify(ings.rows, null, 2));

  console.log("\n=== ApprovedSupplierItem (veliche / white choc) ===");
  const approved = await pool.query(`
    SELECT a.id, a.name, a."packSize", a."packPrice", a.unit, a.category, a."ingredientId", s.name as supplier
    FROM "ApprovedSupplierItem" a
    LEFT JOIN "Supplier" s ON s.id = a."supplierId"
    WHERE a.name ILIKE '%veliche%' OR (a.name ILIKE '%white%' AND a.name ILIKE '%choc%')
    ORDER BY a.name;
  `);
  console.log(JSON.stringify(approved.rows, null, 2));

  console.log("\n=== InvoiceLineItem (veliche / white choc, last 12 months) ===");
  const lines = await pool.query(`
    SELECT i.description, i.quantity, i."unitPrice", i."lineTotal", i.unit,
           inv."invoiceDate", inv."invoiceNumber", s.name as supplier
    FROM "InvoiceLineItem" i
    JOIN "Invoice" inv ON inv.id = i."invoiceId"
    LEFT JOIN "Supplier" s ON s.id = inv."supplierId"
    WHERE inv."invoiceDate" > NOW() - INTERVAL '12 months'
      AND (i.description ILIKE '%veliche%' OR (i.description ILIKE '%white%' AND i.description ILIKE '%choc%'))
    ORDER BY inv."invoiceDate" DESC
    LIMIT 40;
  `);
  console.log(JSON.stringify(lines.rows, null, 2));

  console.log("\n=== Dark Veliche for reference ===");
  const dark = await pool.query(`
    SELECT id, name, "purchaseQuantity", "purchaseUnit", "purchasePrice", "baseUnitsPerPurchase"
    FROM "Ingredient"
    WHERE name ILIKE '%veliche%dark%' OR name ILIKE '%dark%veliche%' OR name ILIKE '%emotion%';
  `);
  console.log(JSON.stringify(dark.rows, null, 2));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
