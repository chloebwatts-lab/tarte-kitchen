// READ-ONLY: when was each sender→supplier mapping created?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT lower(se.email) email, s.name, se."createdAt"::date added
    FROM "SupplierEmail" se JOIN "Supplier" s ON s.id = se."supplierId"
    WHERE lower(se.email) IN ('messaging-service@post.xero.com','notifications@ordermentum.com','orders@fresho.com')
    ORDER BY lower(se.email), se."createdAt"`)
  console.log("■ when each supplier was mapped onto the shared relay addresses")
  let cur = ""
  for (const r of rows) {
    if (r.email !== cur) { cur = r.email; console.log(`\n   ${cur}`) }
    console.log(`      ${r.added?.toISOString?.().slice(0,10) ?? r.added}  ${r.name}`)
  }
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
