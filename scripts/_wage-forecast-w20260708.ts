/**
 * One-off: TK wage forecast for the completed Wed 8 Jul → Tue 14 Jul 2026
 * trading week. Replicates getLiveLabourSnapshot's labour math with pg
 * directly (avoids @/ alias resolution). now = real now, so every roster
 * shift in the window is "past" → labour = timesheets + salary placeholders
 * (no double-count), revenue = actual DailySalesSummary for the 7 days.
 *
 *   npx tsx --env-file=.env.local scripts/_wage-forecast-w20260708.ts
 */
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  ...(process.env.DATABASE_URL?.includes("sslmode=require") && {
    ssl: { rejectUnauthorized: false },
  }),
})

const AEST = 10 * 60 * 60 * 1000
// AEST Wed 8 Jul 2026 00:00 == 2026-07-07T14:00:00Z
const weekStartInstant = new Date("2026-07-07T14:00:00.000Z")
const weekEndInstant = new Date("2026-07-14T14:00:00.000Z") // Wed 15 Jul 00:00 AEST
const days = ["2026-07-08","2026-07-09","2026-07-10","2026-07-11","2026-07-12","2026-07-13","2026-07-14"]

type Bucket = "chefsKp" | "fohBarista" | "pastry" | "other"
const BURLEIGH_AREAS: Record<string, Bucket> = {
  Kitchen:"chefsKp", KP:"chefsKp", PREP:"chefsKp", "Salary BOH BURLEIGH":"chefsKp",
  FOH:"fohBarista", Barista:"fohBarista", "Juice Bar":"fohBarista", "Takeaway Area":"fohBarista", "Salary FOH BURLEIGH":"fohBarista",
  Pastry:"pastry", "Salary PASTRY BURLEIGH":"pastry",
}
const BEACH_HOUSE_AREAS: Record<string, Bucket> = {
  "Restaurant Kitchen":"chefsKp","Restaurant KP":"chefsKp","Cafe Kitchen":"chefsKp","Cafe KP":"chefsKp","Food Prep":"chefsKp","Salary Chef Currumbin":"chefsKp",
  "Restaurant FOH":"fohBarista","Restaurant Bar":"fohBarista","Restaurant Coffee":"fohBarista","Cafe FOH":"fohBarista","Cafe Coffee":"fohBarista","Cafe Juice Bar":"fohBarista","Function":"fohBarista","Salary Currumbin FOH":"fohBarista",
  Pastry:"pastry","Salary Pastry Currumbin":"pastry",
}
const TEA_GARDEN_AREAS: Record<string, Bucket> = { "TG FOH":"fohBarista" }
function bucketFor(venue: string, area: string | null): Bucket {
  if (!area) return "other"
  const map = venue==="BURLEIGH"?BURLEIGH_AREAS:venue==="BEACH_HOUSE"?BEACH_HOUSE_AREAS:venue==="TEA_GARDEN"?TEA_GARDEN_AREAS:null
  return map?.[area] ?? "other"
}
const TARGETS: Record<string, {key:Bucket,label:string,min:number,max:number}[]> = {
  BURLEIGH: [
    {key:"chefsKp",label:"Chefs + KP",min:11.5,max:12.0},
    {key:"fohBarista",label:"FOH + Barista",min:20.5,max:21.0},
    {key:"pastry",label:"Pastry",min:4.75,max:5.25},
  ],
  BEACH_HOUSE: [
    {key:"chefsKp",label:"Chefs + KP",min:12.5,max:13.5},
    {key:"fohBarista",label:"FOH (incl. Barista)",min:21.5,max:22.5},
    {key:"pastry",label:"Pastry",min:2.5,max:3.0},
  ],
  TEA_GARDEN: [],
}

async function main() {
  const conn = await pool.query(`SELECT "superRate","onCostUpliftRate" FROM "DeputyConnection" LIMIT 1`)
  const superRate = Number(conn.rows[0]?.superRate ?? 0.12)
  const onCost = Number(conn.rows[0]?.onCostUpliftRate ?? 0)
  const mult = 1 + superRate + onCost

  const shifts = await pool.query(
    `SELECT venue, area, cost, source, "shiftStart"
       FROM "LabourShift"
      WHERE "shiftStart" >= $1 AND "shiftStart" < $2`,
    [weekStartInstant, weekEndInstant]
  )
  const sales = await pool.query(
    `SELECT venue, date::text AS date, "totalRevenueExGst"
       FROM "DailySalesSummary"
      WHERE date >= $1 AND date < $2`,
    ["2026-07-08", "2026-07-15"]
  )

  const now = new Date()
  console.log(`\nMultiplier: ×${mult.toFixed(4)}  (super ${(superRate*100).toFixed(1)}% + on-cost ${(onCost*100).toFixed(1)}%)`)
  console.log(`Labour shift rows in window: ${shifts.rowCount}   Sales rows: ${sales.rowCount}\n`)

  for (const venue of ["BURLEIGH","BEACH_HOUSE","TEA_GARDEN"]) {
    const vShifts = shifts.rows.filter(s => s.venue === venue)
    let labour = 0
    const bkt: Record<Bucket,number> = {chefsKp:0,fohBarista:0,pastry:0,other:0}
    let salaryTotal = 0, timesheetTotal = 0
    for (const s of vShifts) {
      const cost = Number(s.cost) * mult
      const b = bucketFor(venue, s.area)
      if (s.source === "TIMESHEET") {
        labour += cost; bkt[b] += cost; timesheetTotal += cost
      } else {
        const isSalary = (s.area ?? "").toLowerCase().startsWith("salary")
        const isFuture = new Date(s.shiftStart).getTime() > now.getTime()
        if (isFuture || isSalary) {
          labour += cost; bkt[b] += cost
          if (isSalary) salaryTotal += cost
        }
      }
    }
    const revenue = days.reduce((sum,d) => {
      const r = sales.rows.find(x => x.venue===venue && x.date===d)
      return sum + (r ? Number(r.totalRevenueExGst) : 0)
    }, 0)
    const pct = revenue>0 ? labour/revenue*100 : null
    console.log(`=== ${venue} ===`)
    console.log(`  Revenue (ex-GST, actual 7 days): $${revenue.toFixed(0)}`)
    console.log(`  Labour projected (incl super+oncost): $${labour.toFixed(0)}   [timesheet $${timesheetTotal.toFixed(0)} + salary $${salaryTotal.toFixed(0)}]`)
    console.log(`  OVERALL WAGE %: ${pct!=null?pct.toFixed(1)+"%":"n/a"}`)
    for (const t of TARGETS[venue]) {
      const p = revenue>0 ? bkt[t.key]/revenue*100 : null
      const flag = p!=null ? (p<=t.max?"OK":p<=t.max+0.5?"AMBER":"RED") : "-"
      console.log(`    ${t.label.padEnd(20)} $${bkt[t.key].toFixed(0).padStart(7)}  ${p!=null?p.toFixed(1)+"%":"n/a"}  (band ${t.min}-${t.max}%)  ${flag}`)
    }
    if (bkt.other>0) console.log(`    ${"Other/unmapped".padEnd(20)} $${bkt.other.toFixed(0).padStart(7)}`)
    console.log("")
  }

  // Group total
  let gLabour=0, gRev=0
  for (const venue of ["BURLEIGH","BEACH_HOUSE","TEA_GARDEN"]) {
    const vShifts = shifts.rows.filter(s => s.venue === venue)
    for (const s of vShifts) {
      const cost = Number(s.cost)*mult
      if (s.source==="TIMESHEET") gLabour+=cost
      else {
        const isSalary=(s.area??"").toLowerCase().startsWith("salary")
        const isFuture=new Date(s.shiftStart).getTime()>now.getTime()
        if (isFuture||isSalary) gLabour+=cost
      }
    }
    gRev += days.reduce((sum,d)=>{const r=sales.rows.find(x=>x.venue===venue&&x.date===d);return sum+(r?Number(r.totalRevenueExGst):0)},0)
  }
  console.log(`=== GROUP (all 3 venues) ===`)
  console.log(`  Revenue $${gRev.toFixed(0)}   Labour $${gLabour.toFixed(0)}   Wage % ${(gLabour/gRev*100).toFixed(1)}%\n`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
