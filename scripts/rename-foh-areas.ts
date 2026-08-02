// Rename BEACH_HOUSE checklist areas: "Cafe" -> "FOH Cafe", "Restaurant" -> "FOH Restaurant".
// Deliberately excludes "Cafe Kitchen" / "Restaurant Kitchen" (exact-match on area).
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const cafe = await db.checklistTemplate.updateMany({
    where: { venue: "BEACH_HOUSE", area: "Cafe" },
    data: { area: "FOH Cafe" },
  })
  const rest = await db.checklistTemplate.updateMany({
    where: { venue: "BEACH_HOUSE", area: "Restaurant" },
    data: { area: "FOH Restaurant" },
  })
  console.log(`Cafe -> FOH Cafe: ${cafe.count} templates`)
  console.log(`Restaurant -> FOH Restaurant: ${rest.count} templates`)

  const after = await db.checklistTemplate.findMany({
    where: { venue: "BEACH_HOUSE" },
    select: { area: true, name: true },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  })
  console.log("\nBEACH_HOUSE areas after rename:")
  for (const t of after) console.log(`  ${String(t.area).padEnd(20)} ${t.name}`)
}

main().finally(() => db.$disconnect())
