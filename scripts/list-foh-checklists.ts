// Read-only: list checklist templates with venue/area/name, focusing on FOH.
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const templates = await db.checklistTemplate.findMany({
    orderBy: [{ venue: "asc" }, { area: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      venue: true,
      area: true,
      shift: true,
      isFoodSafety: true,
      isActive: true,
      _count: { select: { items: true, runs: true } },
    },
  })
  for (const t of templates) {
    console.log(
      `${t.venue.padEnd(12)} area=${String(t.area).padEnd(14)} ${t.name.padEnd(45)} shift=${t.shift.padEnd(9)} fs=${t.isFoodSafety}  active=${t.isActive}  items=${t._count.items} runs=${t._count.runs}  id=${t.id}`
    )
  }
}

main().finally(() => db.$disconnect())
