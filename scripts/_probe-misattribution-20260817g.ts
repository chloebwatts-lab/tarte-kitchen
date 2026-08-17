// READ-ONLY: final tally — per supplier, how much stored spend isn't actually theirs?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

// Letterheads that are NOT a third party: our own entity (parser grabbed the
// customer) or the sending platform's own branding.
const BENIGN = [
  /\btarte\b/i, /cbw trust/i, /currumbin pty/i, /beach house/i,   // us
  /pencil\.?one/i,                                                // PencilPay platform
  /dave's wholesale/i,                                            // Coastal Fresh legal entity
]

async function main() {
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "supplierName", status::text, total, "invoiceDate",
           "extractedData"->>'supplierName' pdf
    FROM "Invoice" WHERE "extractedData"->>'supplierName' IS NOT NULL`)

  const norm = (s: string) => s.toLowerCase()
    .replace(/\b(pty|ltd|limited|p\/l|inc|the|trust|group|co|company|australia|au|wholesale|trading|atf)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim()
  const agrees = (a: string, b: string) => {
    const na = norm(a), nb = norm(b)
    if (!na || !nb) return true
    if (na === nb || na.includes(nb) || nb.includes(na)) return true
    const tb = new Set(nb.split(" ").filter((t) => t.length >= 4))
    return norm(a).split(" ").filter((t) => t.length >= 4).some((t) => tb.has(t))
  }

  const LIVE = new Set(["EXTRACTED", "MATCHED", "APPROVED", "PENDING", "PROCESSING", "CREDIT_NOTE", "REVIEW"])
  const per: Record<string, { total: number; totalLive$: number; bad: number; bad$: number; who: Record<string, number> }> = {}

  for (const r of rows) {
    const p = per[r.supplierName] ?? (per[r.supplierName] = { total: 0, totalLive$: 0, bad: 0, bad$: 0, who: {} })
    const amt = Math.abs(Number(r.total ?? 0))
    const live = LIVE.has(r.status)
    p.total++
    if (live) p.totalLive$ += amt
    if (agrees(r.supplierName, r.pdf)) continue
    if (BENIGN.some((re) => re.test(r.pdf))) continue
    p.bad++
    if (live) { p.bad$ += amt; p.who[r.pdf] = (p.who[r.pdf] ?? 0) + amt }
  }

  console.log("■ per stored supplier: rows whose PDF letterhead is a genuinely different third party\n")
  console.log("   rows  wrong   wrong$        of live$      supplier")
  const sorted = Object.entries(per).filter(([, v]) => v.bad > 0).sort((a, b) => b[1].bad$ - a[1].bad$)
  let totBad = 0, totBad$ = 0
  for (const [name, v] of sorted) {
    totBad += v.bad; totBad$ += v.bad$
    const pct = v.totalLive$ > 0 ? ((v.bad$ / v.totalLive$) * 100).toFixed(0) : "0"
    console.log(`   ${String(v.total).padStart(4)}  ${String(v.bad).padStart(5)}  $${v.bad$.toFixed(2).padStart(11)}  $${v.totalLive$.toFixed(2).padStart(11)} (${pct.padStart(3)}%)  ${name}`)
  }
  console.log(`\n   TOTAL: ${totBad} rows, $${totBad$.toFixed(2)} of live spend booked against the wrong supplier`)

  console.log("\n■ who the money actually belongs to:")
  for (const [name, v] of sorted) {
    console.log(`\n   filed as ${name}:`)
    for (const [who, amt] of Object.entries(v.who).sort((a, b) => b[1] - a[1]))
      console.log(`      $${amt.toFixed(2).padStart(11)}  ${who}`)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
