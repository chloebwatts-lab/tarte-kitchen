// READ-ONLY: classify the 305 mismatches — alias noise vs genuine wrong supplier.
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const suppliers: any[] = await db.$queryRawUnsafe(`SELECT id, name FROM "Supplier" ORDER BY name`)
  console.log(`■ ${suppliers.length} Supplier rows: ${suppliers.map((s) => s.name).join(", ")}`)

  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\b(pty|ltd|limited|p\/l|inc|the|trust|group|co|company|australia|au|wholesale|trading|as trustee for|atf)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ").trim()
  const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length >= 4))
  const agrees = (a: string, b: string) => {
    const na = norm(a), nb = norm(b)
    if (!na || !nb) return true
    if (na === nb || na.includes(nb) || nb.includes(na)) return true
    const ta = tokens(a), tb = tokens(b)
    for (const t of ta) if (tb.has(t)) return true
    return false
  }

  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "invoiceNumber", "invoiceDate", total, "supplierName", status::text,
           "extractedData"->>'supplierName' AS pdf_supplier
    FROM "Invoice"
    WHERE "extractedData"->>'supplierName' IS NOT NULL
    ORDER BY "invoiceDate" DESC NULLS LAST`)

  const mism = rows.filter((r) => !agrees(r.supplierName, r.pdf_supplier))

  // Does the PDF letterhead name a DIFFERENT supplier that exists in our Supplier table?
  const classify = (pdfName: string, stored: string) => {
    const p = pdfName.toLowerCase()
    if (/\btarte\b|cbw trust|currumbin pty|beach house/.test(p)) return "CUSTOMER_PARSE" // parser grabbed us
    const other = suppliers.find((s) => s.name !== stored && agrees(s.name, pdfName))
    if (other) return `WRONG_SUPPLIER→${other.name}`
    return "UNKNOWN_ENTITY" // real third party with no Supplier row (alias, platform, or non-food overhead)
  }

  const buckets: Record<string, any[]> = {}
  for (const r of mism) {
    const k = classify(r.pdf_supplier, r.supplierName)
    ;(buckets[k] = buckets[k] ?? []).push(r)
  }

  const LIVE = new Set(["EXTRACTED", "MATCHED", "APPROVED", "PENDING", "PROCESSING", "CREDIT_NOTE", "REVIEW"])
  const money = (rs: any[]) => rs.filter((r) => LIVE.has(r.status)).reduce((a, r) => a + Math.abs(Number(r.total ?? 0)), 0)

  console.log(`\n■ ${mism.length} mismatches, classified:\n`)
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${String(v.length).padStart(3)}  ${k}   ($${money(v).toFixed(2)} in live-spend statuses)`)
  }

  console.log(`\n■ WRONG_SUPPLIER detail (the ones that actually move money between suppliers):`)
  for (const [k, v] of Object.entries(buckets).filter(([k]) => k.startsWith("WRONG_SUPPLIER"))) {
    const byStored: Record<string, any[]> = {}
    for (const r of v) (byStored[r.supplierName] = byStored[r.supplierName] ?? []).push(r)
    for (const [stored, rs] of Object.entries(byStored)) {
      const live = rs.filter((r) => LIVE.has(r.status))
      console.log(`\n   stored "${stored}"  →  should be "${k.split("→")[1]}"`)
      console.log(`      ${rs.length} row(s), ${live.length} live, $${money(rs).toFixed(2)} live spend`)
      const dates = rs.map((r) => r.invoiceDate).filter(Boolean).map((d: any) => new Date(d).toISOString().slice(0, 10)).sort()
      console.log(`      date range: ${dates[0] ?? "?"} … ${dates[dates.length - 1] ?? "?"}`)
      for (const r of rs.slice(0, 30))
        console.log(`      · ${r.invoiceDate ? new Date(r.invoiceDate).toISOString().slice(0,10) : "????"} ${String(r.invoiceNumber ?? "-").padEnd(22)} $${String(r.total).padStart(9)}  ${r.status.padEnd(19)} ${r.id}`)
      if (rs.length > 30) console.log(`      … +${rs.length - 30} more`)
    }
  }

  console.log(`\n■ UNKNOWN_ENTITY grouped (no Supplier row matches the letterhead):`)
  const ue: Record<string, { n: number; $: number; stored: Set<string> }> = {}
  for (const r of buckets["UNKNOWN_ENTITY"] ?? []) {
    const k = r.pdf_supplier
    ue[k] = ue[k] ?? { n: 0, $: 0, stored: new Set() }
    ue[k].n++; ue[k].stored.add(r.supplierName)
    if (LIVE.has(r.status)) ue[k].$ += Math.abs(Number(r.total ?? 0))
  }
  for (const [k, v] of Object.entries(ue).sort((a, b) => b[1].n - a[1].n))
    console.log(`   ${String(v.n).padStart(3)}  $${v.$.toFixed(2).padStart(10)}  "${k}"  ← filed as ${[...v.stored].join(", ")}`)

  // ── supplier-agnostic dedupe candidates, sign-insensitive on total ─────
  const xdup: any[] = await db.$queryRawUnsafe(`
    SELECT "invoiceNumber", "invoiceDate", abs(total) t, count(*) n,
           array_agg(DISTINCT "supplierName") suppliers,
           array_agg(id || ' [' || status || '] ' || "supplierName") rows
    FROM "Invoice"
    WHERE "invoiceNumber" IS NOT NULL AND "invoiceDate" IS NOT NULL AND total IS NOT NULL
      AND status NOT IN ('ERROR','STATEMENT','ORDER_CONFIRMATION')
    GROUP BY 1,2,3
    HAVING count(*) > 1 AND count(DISTINCT "supplierName") > 1
    ORDER BY "invoiceDate" DESC`)
  console.log(`\n■ same invoiceNumber + date + |total| across DIFFERENT suppliers (${xdup.length}):`)
  for (const d of xdup) {
    const liveRows = d.rows.filter((r: string) => !r.includes("[DUPLICATE]"))
    console.log(`   ${new Date(d.invoiceDate).toISOString().slice(0,10)}  ${d.invoiceNumber}  $${d.t}  ×${d.n}  ${liveRows.length > 1 ? "⚠ DOUBLE-COUNTED" : "(already deduped)"}`)
    for (const r of d.rows) console.log(`      ${r}`)
  }

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
