import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const asi = await pool.query(`
    SELECT name, "packSize", "packPrice", unit, category,
           (SELECT s.name FROM "Supplier" s WHERE s.id = a."supplierId") AS supplier
    FROM "ApprovedSupplierItem" a
    WHERE name ILIKE '%buffalo%' OR name ILIKE '%byron%' OR name ILIKE '%bufala%' OR name ILIKE '%mozzarella%';`);
  console.log("approved items:", JSON.stringify(asi.rows, null, 2));
  const pol = await pool.query(`
    SELECT pol.description, pol.quantity, pol.unit, pol."unitPrice", po."createdAt",
           (SELECT s.name FROM "Supplier" s WHERE s.id = po."supplierId") AS supplier
    FROM "PurchaseOrderLine" pol JOIN "PurchaseOrder" po ON po.id = pol."purchaseOrderId"
    WHERE pol.description ILIKE '%buffalo%' OR pol.description ILIKE '%byron%' OR pol.description ILIKE '%bufala%'
    ORDER BY po."createdAt" DESC LIMIT 10;`);
  console.log("purchase orders:", JSON.stringify(pol.rows, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
