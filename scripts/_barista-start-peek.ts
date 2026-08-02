// READ-ONLY: earliest barista/coffee shift starts per venue over the last 8 weeks (AEST).
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main() {
  const since = new Date(Date.now() - 56 * 86400 * 1000)
  const shifts = await db.labourShift.findMany({
    where: { shiftStart: { gte: since }, area: { not: null } },
    select: { venue: true, area: true, shiftStart: true },
  })
  const agg: Record<string, Record<string, number>> = {}
  for (const s of shifts) {
    const t = new Date(s.shiftStart).toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour12: false, hour: "2-digit", minute: "2-digit" })
    const key = `${s.venue}|${s.area}`
    ;(agg[key] ??= {})[t] = ((agg[key] ??= {})[t] ?? 0) + 1
  }
  for (const [key, times] of Object.entries(agg).sort()) {
    const top = Object.entries(times).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 4)
    console.log(key, "earliest starts:", top.map(([t, n]) => `${t} x${n}`).join(", "))
  }
  await db.$disconnect(); await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
