import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
async function main(){
  const r = await pool.query(
    `SELECT venue, area, source, "employeeName", hours, "payRate", cost, "shiftStart"
       FROM "LabourShift"
      WHERE "shiftStart" >= $1 AND "shiftStart" < $2
        AND ("employeeName" ILIKE '%shawn%' OR area ILIKE '%salary%')
      ORDER BY "employeeName", "shiftStart"`,
    [new Date("2026-06-09T14:00:00Z"), new Date("2026-06-16T14:00:00Z")]
  )
  for (const x of r.rows) {
    console.log(`${x.venue.padEnd(12)} ${String(x.source).padEnd(10)} ${String(x.area).padEnd(26)} ${String(x.employeeName).padEnd(22)} cost=$${Number(x.cost).toFixed(0).padStart(6)} hrs=${Number(x.hours).toFixed(1)} rate=${Number(x.payRate).toFixed(2)}`)
  }
  await pool.end()
}
main().catch(e=>{console.error(e);process.exit(1)})
