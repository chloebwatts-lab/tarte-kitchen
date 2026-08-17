// READ-ONLY regression check: replay the NEW matcher over every real invoice.
//
// Two things must both hold:
//   1. the 221 known mis-attributions are now rejected  (true positives)
//   2. correctly-attributed invoices are NOT rejected   (false positives —
//      the dangerous direction: a false positive silently stops ingestion)
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { letterheadMatches, disambiguateSupplier } from "../src/lib/invoices/supplier-match"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "supplierName", status::text, total, "invoiceDate", "invoiceNumber",
           "extractedData"->>'supplierName' pdf
    FROM "Invoice" WHERE "extractedData"->>'supplierName' IS NOT NULL`)

  const tally: Record<string, number> = { match: 0, mismatch: 0, unverifiable: 0 }
  const rejected: any[] = []
  for (const r of rows) {
    const v = letterheadMatches(r.supplierName, r.pdf)
    tally[v]++
    if (v === "mismatch") rejected.push(r)
  }

  console.log(`■ letterheadMatches over ${rows.length} real invoices`)
  console.log(`   match        ${String(tally.match).padStart(5)}  (accepted, letterhead agrees)`)
  console.log(`   unverifiable ${String(tally.unverifiable).padStart(5)}  (accepted, letterhead absent or = our own entity)`)
  console.log(`   mismatch     ${String(tally.mismatch).padStart(5)}  (would now be REJECTED → review queue)`)

  // Every rejection must be a real mis-attribution. Group them so a human can
  // eyeball that none is a legitimate supplier being wrongly blocked.
  const byPair: Record<string, number> = {}
  for (const r of rejected) byPair[`${r.supplierName}  ←  ${r.pdf}`] = (byPair[`${r.supplierName}  ←  ${r.pdf}`] ?? 0) + 1
  console.log(`\n■ what would be rejected (${Object.keys(byPair).length} distinct pairs):`)
  for (const [k, n] of Object.entries(byPair).sort((a, b) => b[1] - a[1]))
    console.log(`   ×${String(n).padStart(3)}  ${k}`)

  // Aliases must rescue the legitimate platform/legal-entity cases.
  console.log(`\n■ alias spot-checks (must all be "match"):`)
  const spot: Array<[string, string]> = [
    ["EasyVend", "Independent Dairy Co"],
    ["Breadtop", "EAC BUSINESS GROUP PTY LTD"],
    ["Breadtop", "BREADTOP AUS FAIR"],
    ["Coastal Fresh", "The Dave's Wholesale Trust"],
    ["Eustralis", "Pencil.One Pty Ltd"],
    ["Eustralis", "EUSTRALIS FOOD QLD PTY LTD"],
    ["Paramount Liquor", "Tambavale (Qld) Pty Ltd T/A Paramount Liquor QLD"],
    ["Pixel Bread", "Pixel Bakehouse Pty Ltd"],
    ["Son Of A Bunn", "Son of a Bunn Pty Ltd"],
    ["Cookers", "Cookers Bulk Oil System Pty Ltd T/A Cookers Bulk Oil System"],
    ["Cheese Time", "Cheese Time Pty Ltd"],
    ["Jensens", "Jensens Seafood"],
    ["Marrow Meats", "Marrow Meats"],
  ]
  for (const [sup, lh] of spot) {
    const v = letterheadMatches(sup, lh)
    console.log(`   ${v === "match" ? "✓" : "✗ " + v.toUpperCase()}  ${sup.padEnd(18)} ← "${lh}"`)
  }

  console.log(`\n■ the originally-reported cases (must all be REJECTED):`)
  const ord = [{ id: "x", name: "Cheese Time" }]
  for (const lh of ["Single Origin Wholesale Pty Ltd", "Pixel Bakehouse Pty Ltd", "Blackboard Coffee Roasters", "The Limpopo Project"]) {
    const r = disambiguateSupplier(ord, lh, null)
    console.log(`   ${r.supplier ? "✗ STILL ACCEPTED as " + r.supplier.name : "✓ rejected"}  "${lh}"`)
    if (!r.supplier) console.log(`        reason: ${r.reason}`)
  }

  console.log(`\n■ single-candidate happy path (must still be ACCEPTED):`)
  for (const [sup, lh] of [["Cheese Time", "Cheese Time Pty Ltd"], ["Bidfood", "Bidfood Gold Coast (Burleigh Marr Distribution)"], ["Jensens", null]] as Array<[string, string | null]>) {
    const r = disambiguateSupplier([{ id: "x", name: sup }], lh, null)
    console.log(`   ${r.supplier ? "✓ accepted" : "✗ REJECTED — " + r.reason}  ${sup} ← "${lh ?? "(no letterhead)"}"`)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
