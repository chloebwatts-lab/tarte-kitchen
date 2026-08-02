// READ-ONLY: for the flagged (low/medium) ingredients, list the actual invoice
// line descriptions + suppliers so we can resolve brand-dependent allergens.
import "dotenv/config"
import { readFileSync } from "fs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const final = JSON.parse(readFileSync("/tmp/allergen-final-proposals.json", "utf8"))
  const flagged = final.filter((x: any) => x.confidence === "low" || x.confidence === "medium")
  const ids = flagged.map((x: any) => x.id)

  const lines = await db.invoiceLineItem.findMany({
    where: { ingredientId: { in: ids } },
    select: {
      ingredientId: true, description: true,
      invoice: { select: { supplierName: true, invoiceDate: true } },
    },
  })

  // group by ingredient -> distinct (supplier | description)
  const byIng = new Map<string, Map<string, string>>()
  for (const l of lines) {
    if (!l.ingredientId) continue
    const m = byIng.get(l.ingredientId) ?? new Map()
    const key = `${l.invoice?.supplierName ?? "?"} :: ${l.description}`
    if (!m.has(key)) m.set(key, key)
    byIng.set(l.ingredientId, m)
  }

  const out = flagged.map((x: any) => ({
    name: x.name, confidence: x.confidence,
    proposed: x.contains, mayContain: x.mayContain,
    invoiceLines: Array.from(byIng.get(x.id)?.keys() ?? []),
  }))

  for (const o of out) {
    console.log(`\n■ [${o.confidence}] ${o.name}  (proposed: ${o.proposed.join(",") || "none"})`)
    if (o.invoiceLines.length === 0) { console.log("    (no invoice lines mapped)"); continue }
    for (const l of o.invoiceLines.slice(0, 6)) console.log(`    • ${l}`)
  }
  const withLines = out.filter((o: any) => o.invoiceLines.length).length
  console.log(`\n--- ${withLines}/${out.length} flagged ingredients have invoice brand data ---`)

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
