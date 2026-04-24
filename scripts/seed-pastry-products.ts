/**
 * Seed the 17 pastry products from the paper Pastry Rotation Log
 * (Burleigh + Currumbin share the same product list).
 *
 * Safe to re-run: checks (venue, name) before inserting.
 *
 * Run (on the droplet):
 *   docker compose --profile tools run --rm \
 *     -v /root/tarte-kitchen/scripts:/app/scripts \
 *     migrate npx tsx scripts/seed-pastry-products.ts
 */
import "dotenv/config"
import { Pool } from "pg"

const useSSL = process.env.DATABASE_URL?.includes("sslmode=require")
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
})

const PRODUCTS = [
  "Strawberry tarte",
  "Blueberry tarte",
  "Raspberry tarte",
  "Rhubarb tarte",
  "Passionfruit tarte",
  "Cheesecake",
  "Lemon butter cake",
  "Pecan pie",
  "Pistachio cookie",
  "Choc chip cookie",
  "Plain croissant",
  "Cinnamon scroll",
  "Kouign amann",
  "Vanilla crueller",
  "Dulce crueller",
  "Muffin top",
  "Friand",
]

async function main() {
  const client = await pool.connect()
  let created = 0
  let skipped = 0
  try {
    for (let i = 0; i < PRODUCTS.length; i++) {
      const name = PRODUCTS[i]
      const exists = await client.query(
        `SELECT id FROM "PastryProduct" WHERE name = $1 AND venue = 'BOTH'`,
        [name]
      )
      if (exists.rows.length > 0) {
        console.log(`  SKIP  ${name}`)
        skipped++
        continue
      }
      await client.query(
        `INSERT INTO "PastryProduct"
          (id, name, venue, "sortOrder", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'BOTH', $2, true, NOW(), NOW())`,
        [name, i]
      )
      console.log(`  CREATE ${name}`)
      created++
    }
  } finally {
    client.release()
    await pool.end()
  }
  console.log(`\nDone — ${created} created, ${skipped} skipped`)
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e)
  process.exit(1)
})
