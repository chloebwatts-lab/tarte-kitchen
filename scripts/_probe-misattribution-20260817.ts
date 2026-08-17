// READ-ONLY: why did Cheese Time win, and how many invoices are mis-attributed?
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  // ── 1. the two confirmed cases ──────────────────────────────────────────
  const ids = ["cmoju0xhi004v01qst9ggxnrr", "cmsk33b732u1201s1eqwakhei", "cmsk337042u1001s1gv89dvdz"]
  const cases: any[] = await db.$queryRawUnsafe(`
    SELECT id, "invoiceNumber", "invoiceDate", total, "supplierId", "supplierName",
           status::text, "gmailMessageId", "rawEmailSubject", "pdfUrl",
           "extractedData"->>'supplierName' AS pdf_supplier
    FROM "Invoice" WHERE id = ANY($1)`, ids)
  console.log("■ confirmed cases")
  for (const c of cases) {
    console.log(`   ${c.id}  ${c.invoiceNumber}  ${c.invoiceDate ? new Date(c.invoiceDate).toISOString().slice(0,10) : "?"}  $${c.total}`)
    console.log(`      stored supplier : ${c.supplierName} (${c.supplierId})   status=${c.status}`)
    console.log(`      pdf supplierName: ${c.pdf_supplier ?? "(none)"}`)
    console.log(`      gmailMessageId  : ${c.gmailMessageId}`)
    console.log(`      subject         : ${c.rawEmailSubject ?? "(none)"}`)
    console.log(`      pdf             : ${c.pdfUrl}`)
  }

  // ── 2. the supplier email map, focused on shared addresses ──────────────
  const shared: any[] = await db.$queryRawUnsafe(`
    SELECT email, count(*) n, array_agg(name ORDER BY name) suppliers
    FROM (
      SELECT lower(se.email) email, s.name
      FROM "SupplierEmail" se JOIN "Supplier" s ON s.id = se."supplierId"
      UNION
      SELECT lower(s.email), s.name FROM "Supplier" s WHERE s.email IS NOT NULL
    ) x
    GROUP BY email HAVING count(*) > 1
    ORDER BY count(*) DESC`)
  console.log(`\n■ sender addresses mapped to >1 supplier (${shared.length}):`)
  for (const r of shared) {
    console.log(`   ${r.email}  ×${r.n}`)
    console.log(`      ${r.suppliers.join(" | ")}`)
  }

  // ── 3. full mismatch audit: stored supplierName vs PDF letterhead ───────
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "invoiceNumber", "invoiceDate", total, "supplierName", status,
           "gmailMessageId",
           "extractedData"->>'supplierName' AS pdf_supplier
    FROM "Invoice"
    WHERE "extractedData" IS NOT NULL
      AND "extractedData"->>'supplierName' IS NOT NULL
    ORDER BY "invoiceDate" DESC NULLS LAST`)
  console.log(`\n■ invoices with a PDF-extracted supplierName: ${rows.length}`)

  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\b(pty|ltd|limited|p\/l|inc|the|trust|group|co|company|australia|au|wholesale|trading|as trustee for|atf)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()

  // token-overlap: share any distinctive (>=4 char) token → treat as agreeing
  const agrees = (a: string, b: string) => {
    const na = norm(a), nb = norm(b)
    if (!na || !nb) return true
    if (na === nb || na.includes(nb) || nb.includes(na)) return true
    const ta = new Set(na.split(" ").filter((t) => t.length >= 4))
    const tb = na === nb ? ta : new Set(nb.split(" ").filter((t) => t.length >= 4))
    for (const t of ta) if (tb.has(t)) return true
    return false
  }

  const mism = rows.filter((r) => !agrees(r.supplierName, r.pdf_supplier))
  console.log(`\n■ MISMATCHES (stored ≠ PDF letterhead, token-overlap normalised): ${mism.length}`)
  const pairCount: Record<string, { n: number; $: number; ex: string[] }> = {}
  for (const r of mism) {
    const k = `${r.supplierName}  ⟵stored | pdf⟶  ${r.pdf_supplier}`
    pairCount[k] = pairCount[k] ?? { n: 0, $: 0, ex: [] }
    pairCount[k].n++
    pairCount[k].$ += Number(r.total ?? 0)
    if (pairCount[k].ex.length < 4)
      pairCount[k].ex.push(`${r.invoiceDate ? new Date(r.invoiceDate).toISOString().slice(0,10) : "????"} ${r.invoiceNumber ?? "-"} $${r.total} ${r.status} ${r.id}`)
  }
  const sorted = Object.entries(pairCount).sort((a, b) => b[1].n - a[1].n)
  for (const [k, v] of sorted) {
    console.log(`\n   ${k}`)
    console.log(`      ${v.n} invoice(s), $${v.$.toFixed(2)} total`)
    for (const e of v.ex) console.log(`      · ${e}`)
  }

  // ── 4. supplier-agnostic duplicate candidates ──────────────────────────
  const xdup: any[] = await db.$queryRawUnsafe(`
    SELECT "invoiceNumber", "invoiceDate", total,
           count(*) n,
           array_agg(DISTINCT "supplierName") suppliers,
           array_agg(id || ':' || status) rows
    FROM "Invoice"
    WHERE "invoiceNumber" IS NOT NULL AND "invoiceDate" IS NOT NULL AND total IS NOT NULL
      AND status NOT IN ('ERROR','STATEMENT','ORDER_CONFIRMATION')
    GROUP BY 1,2,3
    HAVING count(*) > 1 AND count(DISTINCT "supplierName") > 1
    ORDER BY "invoiceDate" DESC`)
  console.log(`\n■ same invoiceNumber + date + total under DIFFERENT supplierNames (${xdup.length}):`)
  for (const d of xdup) {
    console.log(`   ${new Date(d.invoiceDate).toISOString().slice(0,10)}  ${d.invoiceNumber}  $${d.total}  ×${d.n}`)
    console.log(`      suppliers: ${d.suppliers.join(" | ")}`)
    console.log(`      rows: ${d.rows.join(", ")}`)
  }

  // how many of those are currently NOT marked duplicate (i.e. double-counted)?
  const live = xdup.filter((d: any) => d.rows.filter((r: string) => !r.endsWith(":DUPLICATE")).length > 1)
  console.log(`\n   → of those, ${live.length} group(s) have >1 row still counting as live spend`)

  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
