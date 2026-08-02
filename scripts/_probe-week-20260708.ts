// One-off read: latest labour + COGS weeks after ingesting Louise's
// 14.7.2026 reports (forwarded by Chloe). Read-only.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

const n = (v: unknown) => (v == null ? null : Number(v))

async function main() {
  const labour = await db.labourWeekActual.findMany({
    orderBy: [{ weekStartWed: "desc" }],
    take: 12,
  })
  console.log("=== LabourWeekActual (latest 12) ===")
  for (const w of labour) {
    console.log(
      JSON.stringify({
        venue: w.venue,
        weekStartWed: w.weekStartWed.toISOString().slice(0, 10),
        revenueExGst: n(w.revenueExGst),
        grossWages: n(w.grossWages),
        grossWagesExAdmin: n(w.grossWagesExAdmin),
        grossWagesExAdminLeaveBackpay: n(w.grossWagesExAdminLeaveBackpay),
        wagesChef: n(w.wagesChef),
        wagesKp: n(w.wagesKp),
        wagesFoh: n(w.wagesFoh),
        wagesBarista: n(w.wagesBarista),
        wagesPastry: n(w.wagesPastry),
        wagesAdmin: n(w.wagesAdmin),
        cogsActual: n(w.cogsActual),
        cogsPct: n(w.cogsPct),
        mForecast: n(w.mForecast),
      })
    )
  }

  const cogs = await db.weeklyCogs.findMany({
    orderBy: [{ weekStartWed: "desc" }],
    take: 8,
  })
  console.log("=== WeeklyCogs (latest 8) ===")
  for (const w of cogs) {
    console.log(
      JSON.stringify({
        venue: w.venue,
        weekStartWed: w.weekStartWed.toISOString().slice(0, 10),
        revenueExGst: n(w.revenueExGst),
        totalCogs: n(w.totalCogs),
        cogsPct: n(w.cogsPct),
        food: n(w.cogsFood),
        coffee: n(w.cogsCoffee),
        drinks: n(w.cogsDrinks),
        consumables: n(w.cogsConsumables),
        packaging: n(w.cogsPackaging),
      })
    )
  }

  // Supplier movers: latest week vs prior 4-week average per (venue, supplier)
  const weeks = await db.cogsSupplierLine.findMany({
    orderBy: [{ weekStartWed: "desc" }],
    take: 1,
  })
  if (weeks.length) {
    const latest = weeks[0].weekStartWed
    const from = new Date(latest)
    from.setDate(from.getDate() - 28)
    const lines = await db.cogsSupplierLine.findMany({
      where: { weekStartWed: { gte: from, lte: latest } },
    })
    const key = (v: string, s: string) => `${v}|${s}`
    const cur = new Map<string, number>()
    const hist = new Map<string, number[]>()
    for (const l of lines) {
      const k = key(l.venue, l.supplier)
      if (l.weekStartWed.getTime() === latest.getTime()) cur.set(k, Number(l.amount))
      else {
        if (!hist.has(k)) hist.set(k, [])
        hist.get(k)!.push(Number(l.amount))
      }
    }
    console.log(`=== Supplier movers, week ${latest.toISOString().slice(0, 10)} vs prior 4wk avg ===`)
    const movers: Array<{ k: string; cur: number; avg: number; delta: number }> = []
    for (const [k, c] of cur) {
      const h = hist.get(k) ?? []
      const avg = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0
      movers.push({ k, cur: c, avg, delta: c - avg })
    }
    movers
      .filter((m) => Math.abs(m.delta) > 300)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 12)
      .forEach((m) =>
        console.log(
          `${m.k}: $${m.cur.toFixed(0)} vs avg $${m.avg.toFixed(0)} (${m.delta > 0 ? "+" : ""}$${m.delta.toFixed(0)})`
        )
      )
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
