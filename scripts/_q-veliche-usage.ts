import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ID = "cmn8ccf7k00h916qz6nh38k3f";

async function main() {
  console.log("=== Supplier on the Veliche-white record ===");
  const sup = await pool.query(`
    SELECT i.id, i.name as ingredient, s.name as supplier
    FROM "Ingredient" i LEFT JOIN "Supplier" s ON s.id = i."supplierId"
    WHERE i.id = $1;`, [ID]);
  console.log(JSON.stringify(sup.rows, null, 2));

  console.log("\n=== PreparationItems using it ===");
  const preps = await pool.query(`
    SELECT pi.id, p.name as prep, pi.quantity, pi.unit, pi."lineCost"
    FROM "PreparationItem" pi JOIN "Preparation" p ON p.id = pi."preparationId"
    WHERE pi."ingredientId" = $1;`, [ID]);
  console.log(JSON.stringify(preps.rows, null, 2));

  console.log("\n=== DishComponents using it ===");
  const dishes = await pool.query(`
    SELECT dc.id, d.name as dish, dc.quantity, dc.unit, dc."lineCost"
    FROM "DishComponent" dc JOIN "Dish" d ON d.id = dc."dishId"
    WHERE dc."ingredientId" = $1;`, [ID]);
  console.log(JSON.stringify(dishes.rows, null, 2));

  console.log("\n=== ApprovedSupplierItem linked to it ===");
  const asi = await pool.query(`
    SELECT a.name, a."packSize", a."packPrice", s.name as supplier
    FROM "ApprovedSupplierItem" a LEFT JOIN "Supplier" s ON s.id = a."supplierId"
    WHERE a."ingredientId" = $1;`, [ID]);
  console.log(JSON.stringify(asi.rows, null, 2));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
