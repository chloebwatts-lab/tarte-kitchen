// Did Louise recode the department allocations she was asked to?
//
// Read-only. For the latest N labour weeks (default 4) this prints, per
// venue, Louise's department dollars from her Mge PDF next to the Deputy
// timesheet dollars bucketed by the area each person actually worked.
// If her FOH share still sits well above Deputy's while Chef + KP sits
// below, the Burleigh recode asked for on 21 Aug and 3 Sep 2026 has not
// landed. It then lists every person named in those emails with the Deputy
// areas they worked that week and the department Chloe asked for, so the
// per-person breakdown Louise sends can be checked line by line.
//
//   DATABASE_URL=... npx tsx scripts/_probe-louise-splits.ts [weeks]
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { bucketFor, type Bucket } from "../src/lib/labour/buckets"

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

const n = (v: unknown) => (v == null ? 0 : Number(v))
const money = (v: number) => v.toLocaleString("en-AU", { maximumFractionDigits: 0 }).padStart(8)
const pct = (v: number) => `${v.toFixed(1)}%`.padStart(6)

// Chloe's and Shawna's instructions to Louise, department by person.
// Sources: the "CHANGES to departments / wage reports" email of 21 Aug
// 2026, the "Re: Reports" email of 3 Sep 2026 and Shawna's reply the same
// day, and Shawna's "Timesheets ending 8.9.26" notes. Add a line here each
// time an allocation is agreed, so the check keeps up.
const INSTRUCTIONS: Array<{ match: RegExp; venue: "BURLEIGH" | "BEACH_HOUSE"; wanted: string; source: string }> = [
  { match: /^yamil awad/i, venue: "BURLEIGH", wanted: "Chef (prep)", source: "3 Sep" },
  { match: /^arnau bosch/i, venue: "BURLEIGH", wanted: "Chef", source: "3 Sep" },
  { match: /^peter quezada/i, venue: "BURLEIGH", wanted: "Chef (kitchen, not KP)", source: "3 Sep" },
  { match: /^guilherme barbosa/i, venue: "BURLEIGH", wanted: "KP", source: "3 Sep" },
  { match: /^guilherme chinaglia/i, venue: "BURLEIGH", wanted: "KP", source: "3 Sep" },
  { match: /^alexis monterrubio/i, venue: "BURLEIGH", wanted: "KP", source: "3 Sep" },
  { match: /^rai diniz/i, venue: "BURLEIGH", wanted: "Kitchen / KP, not FOH", source: "21 Aug" },
  { match: /^paula osman/i, venue: "BURLEIGH", wanted: "Pastry", source: "3 Sep" },
  { match: /^madelyn james/i, venue: "BURLEIGH", wanted: "Pastry", source: "21 Aug, 3 Sep" },
  { match: /^jhett duncan/i, venue: "BURLEIGH", wanted: "Pastry", source: "3 Sep" },
  { match: /^lacey corby/i, venue: "BURLEIGH", wanted: "FOH (floor, not pastry)", source: "3 Sep" },
  { match: /^leandro lopez/i, venue: "BEACH_HOUSE", wanted: "KP", source: "3 Sep" },
  { match: /^eden lord/i, venue: "BURLEIGH", wanted: "Pastry, salary 100% Burleigh", source: "Shawna 3 Sep" },
  { match: /^beatriz maciel/i, venue: "BURLEIGH", wanted: "Pastry, 70% Burleigh / 30% Currumbin", source: "Shawna 3 Sep" },
  { match: /^yung chi chang/i, venue: "BURLEIGH", wanted: "Barista, 50% Burleigh / 50% Currumbin", source: "Shawna 3 Sep" },
  { match: /^carmen taylor/i, venue: "BEACH_HOUSE", wanted: "FOH, level 2 casual (salary finished)", source: "Shawna 8 Sep" },
  { match: /^hannah (dell )?vassiliou|^hannah vasillou/i, venue: "BEACH_HOUSE", wanted: "FOH plus Pastry shifts, allocate by shift", source: "Shawna 8 Sep" },
  { match: /^vasco/i, venue: "BURLEIGH", wanted: "Also set up at Burleigh, FOH category", source: "Shawna 8 Sep" },
]

type Dept = "Barista" | "Chef" | "FOH" | "KP" | "Pastry" | "Admin"
const DEPT_BUCKET: Record<Dept, Bucket | "admin"> = {
  Barista: "fohBarista",
  FOH: "fohBarista",
  Chef: "chefsKp",
  KP: "chefsKp",
  Pastry: "pastry",
  Admin: "admin",
}

async function main() {
  const weeksWanted = Number(process.argv[2] ?? 4)
  const weekRows = await db.labourWeekActual.findMany({
    select: { weekStartWed: true },
    distinct: ["weekStartWed"],
    orderBy: { weekStartWed: "desc" },
    take: weeksWanted,
  })

  for (const { weekStartWed } of weekRows) {
    const label = weekStartWed.toISOString().slice(0, 10)
    console.log(`\n================ week starting Wed ${label} ================`)

    // Same window arithmetic as src/lib/labour/recode.ts: Wed 00:00 AEST is
    // Tue 14:00 UTC the day before the stored UTC date.
    const windowStart = new Date(weekStartWed.getTime() - 10 * 3600 * 1000)
    const windowEnd = new Date(windowStart.getTime() + 7 * 86400 * 1000)

    const [actuals, shifts] = await Promise.all([
      db.labourWeekActual.findMany({ where: { weekStartWed } }),
      db.labourShift.findMany({
        where: { source: "TIMESHEET", shiftStart: { gte: windowStart, lt: windowEnd } },
        select: { employeeName: true, venue: true, area: true, hours: true, cost: true },
      }),
    ])

    for (const a of actuals) {
      const louise: Record<Dept, number> = {
        Barista: n(a.wagesBarista),
        Chef: n(a.wagesChef),
        FOH: n(a.wagesFoh),
        KP: n(a.wagesKp),
        Pastry: n(a.wagesPastry),
        Admin: n(a.wagesAdmin),
      }
      const louiseBuckets: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
      for (const d of Object.keys(louise) as Dept[]) {
        const b = DEPT_BUCKET[d]
        if (b !== "admin") louiseBuckets[b] += louise[d]
      }
      const louiseExAdmin = louiseBuckets.chefsKp + louiseBuckets.fohBarista + louiseBuckets.pastry

      const deputy: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
      let deputyRows = 0
      for (const s of shifts) {
        if (s.venue !== a.venue) continue
        deputy[bucketFor(a.venue, s.area)] += n(s.cost)
        deputyRows++
      }
      const deputyTotal = deputy.chefsKp + deputy.fohBarista + deputy.pastry

      console.log(`\n--- ${a.venue}  Louise total ${money(n(a.grossWages))}  Deputy timesheets ${deputyRows}`)
      if (louiseExAdmin === 0) {
        console.log("  Louise's PDF has no department rows for this week (format B or not parsed).")
        continue
      }
      if (deputyTotal === 0) {
        console.log("  No priced Deputy timesheets for this venue this week.")
        continue
      }
      console.log("  bucket        Louise $   share   Deputy $   share    gap at Louise total")
      for (const b of ["chefsKp", "fohBarista", "pastry"] as Bucket[]) {
        const ls = (louiseBuckets[b] / louiseExAdmin) * 100
        const ds = (deputy[b] / deputyTotal) * 100
        const gap = louiseBuckets[b] - (deputy[b] / deputyTotal) * louiseExAdmin
        const flag = Math.abs(ls - ds) >= 3 ? "  <-- off by 3pts or more" : ""
        console.log(`  ${b.padEnd(12)} ${money(louiseBuckets[b])}  ${pct(ls)}   ${money(deputy[b])}  ${pct(ds)}   ${money(gap)}${flag}`)
      }
      console.log(`  Louise raw departments: ${Object.entries(louise).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}`)
    }

    // Per-person view of the people Louise was asked to move.
    console.log("\n  Named staff, Deputy areas worked this week vs what Chloe asked for:")
    const byPerson = new Map<string, Map<string, { hours: number; cost: number }>>()
    for (const s of shifts) {
      const key = s.employeeName.trim()
      const areas = byPerson.get(key) ?? new Map()
      const k = `${s.venue}/${s.area ?? "?"}`
      const cur = areas.get(k) ?? { hours: 0, cost: 0 }
      cur.hours += n(s.hours)
      cur.cost += n(s.cost)
      areas.set(k, cur)
      byPerson.set(key, areas)
    }
    for (const ins of INSTRUCTIONS) {
      const hits = [...byPerson.entries()].filter(([name]) => ins.match.test(name))
      if (hits.length === 0) {
        console.log(`  ${ins.match.source.replace(/[\^\\/i]/g, "").padEnd(22)} no timesheets this week            wanted: ${ins.wanted} (${ins.source})`)
        continue
      }
      for (const [name, areas] of hits) {
        const worked = [...areas.entries()]
          .sort((x, y) => y[1].hours - x[1].hours)
          .map(([k, v]) => `${k} ${v.hours.toFixed(1)}h`)
          .join(", ")
        console.log(`  ${name.padEnd(22)} ${worked}\n  ${"".padEnd(22)} wanted: ${ins.wanted} (${ins.source})`)
      }
    }
  }
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
