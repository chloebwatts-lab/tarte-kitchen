// One-off read-only audit of recent WasteEntry rows (session 2026-07-12).
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

async function main() {
  const since = new Date("2026-06-28")
  const entries = await db.wasteEntry.findMany({
    where: { date: { gte: since } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { dish: { select: { name: true } }, ingredient: { select: { name: true } } },
  })

  console.log(`Entries since ${since.toISOString().slice(0, 10)}: ${entries.length}\n`)
  for (const e of entries) {
    console.log(
      [
        e.date.toISOString().slice(0, 10),
        e.venue.padEnd(11),
        e.itemName.padEnd(32),
        `${e.quantity} ${e.unit}`.padEnd(14),
        e.reason.padEnd(15),
        `$${e.estimatedCost}`.padEnd(9),
        e.dishId ? "dish" : e.ingredientId ? "ingr" : "UNLINKED",
        e.recordedBy ?? "-",
        e.notes ? `| ${e.notes}` : "",
      ].join("  ")
    )
  }

  // Sanity checks
  const zeroCost = entries.filter((e) => Number(e.estimatedCost) === 0)
  const zeroQty = entries.filter((e) => Number(e.quantity) === 0)
  const unlinked = entries.filter((e) => !e.dishId && !e.ingredientId)
  const bigCost = entries.filter((e) => Number(e.estimatedCost) > 200)

  // possible duplicates: same date+venue+item+qty
  const keyCount = new Map<string, number>()
  for (const e of entries) {
    const k = `${e.date.toISOString().slice(0, 10)}|${e.venue}|${e.itemName}|${e.quantity}|${e.unit}`
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1)
  }
  const dupes = [...keyCount.entries()].filter(([, n]) => n > 1)

  console.log("\n--- checks ---")
  console.log(`zero cost: ${zeroCost.length}${zeroCost.length ? " -> " + zeroCost.map((e) => e.itemName).join(", ") : ""}`)
  console.log(`zero qty: ${zeroQty.length}${zeroQty.length ? " -> " + zeroQty.map((e) => e.itemName).join(", ") : ""}`)
  console.log(`unlinked (no dish/ingredient): ${unlinked.length}${unlinked.length ? " -> " + unlinked.map((e) => e.itemName).join(", ") : ""}`)
  console.log(`cost > $200: ${bigCost.length}${bigCost.length ? " -> " + bigCost.map((e) => `${e.itemName} $${e.estimatedCost}`).join(", ") : ""}`)
  console.log(`possible duplicates: ${dupes.length}${dupes.length ? "\n  " + dupes.map(([k, n]) => `${n}x ${k}`).join("\n  ") : ""}`)

  // last 30 days by week/venue for context
  const monthAgo = new Date("2026-06-12")
  const recent = await db.wasteEntry.findMany({ where: { date: { gte: monthAgo } } })
  const byVenue = new Map<string, { n: number; cost: number }>()
  for (const e of recent) {
    const v = byVenue.get(e.venue) ?? { n: 0, cost: 0 }
    v.n++
    v.cost += Number(e.estimatedCost)
    byVenue.set(e.venue, v)
  }
  console.log("\n--- last 30 days by venue ---")
  for (const [v, s] of byVenue) console.log(`${v}: ${s.n} entries, $${s.cost.toFixed(2)}`)

  const latest = await db.wasteEntry.findFirst({ orderBy: { createdAt: "desc" } })
  console.log(`\nmost recent entry created: ${latest?.createdAt.toISOString()} (${latest?.itemName}, dated ${latest?.date.toISOString().slice(0, 10)})`)
}

main().finally(() => db.$disconnect())
