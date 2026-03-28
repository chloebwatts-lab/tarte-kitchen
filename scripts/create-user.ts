/**
 * Create a user account for Tarte Kitchen
 *
 * Usage:  npx tsx scripts/create-user.ts <name> <email> <password>
 * Example: npx tsx scripts/create-user.ts "Chris" "chris@tartebakery.com.au" "mypassword"
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { hash } from "bcryptjs"

async function main() {
  const [name, email, password] = process.argv.slice(2)

  if (!name || !email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts <name> <email> <password>")
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  const needsSsl = connectionString?.includes("sslmode=require")
  const pool = new Pool({
    connectionString,
    ...(needsSsl && { ssl: { rejectUnauthorized: false } }),
  })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User "${email}" already exists — updating password.`)
    await db.user.update({
      where: { email },
      data: { name, hashedPassword: await hash(password, 12) },
    })
    console.log(`Updated "${email}".`)
  } else {
    await db.user.create({
      data: {
        name,
        email,
        hashedPassword: await hash(password, 12),
      },
    })
    console.log(`Created user "${name}" <${email}>`)
  }

  await db.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
