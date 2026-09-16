// READ-ONLY: what we spend on fruit, veg, herbs and mushrooms, product by
// product, across every venue and produce supplier. Built to answer "which
// produce lines are the biggest spend for the year" so a share of the
// supply can be handed to another grower.
//
// Run on the droplet inside the compose network (needs DATABASE_URL):
//   docker compose --profile tools run --rm \
//     -v /root/tarte-kitchen/scripts/produce-spend-report.ts:/app/scripts/produce-spend-report.ts \
//     migrate npx tsx scripts/produce-spend-report.ts
// Options:
//   --from 2025-09-01 --to 2026-09-16   window (default: trailing 365 days)
//   --top 100                           products to list (default 80)
//   --dump                              write every matched line as CSV to
//                                       /tmp/produce-lines.csv (mount /tmp)
import "dotenv/config"
import { writeFileSync } from "node:fs"
import { Pool } from "pg"

const argv = process.argv.slice(2)
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const to = arg("to") ? new Date(arg("to")!) : new Date()
const from = arg("from") ? new Date(arg("from")!) : new Date(to.getTime() - 365 * 86400_000)
const topN = Number(arg("top") ?? 80)
const dump = argv.includes("--dump")

// Suppliers whose whole invoice is produce. Lines from anyone else count only
// when the mapped ingredient is a produce category.
const PRODUCE_SUPPLIER = /pacific|jensen|produce oz|coastal fresh|green farm/i
const PRODUCE_CATEGORIES = new Set(["VEGETABLE", "FRUIT", "HERB", "MUSHROOM"])
// Non-product rows that appear on produce invoices.
const NOISE =
  /freight|delivery fee|delivery charge|standard delivery|surcharge|rounding|^total\b|^credit|^eft\b|^account|fuel levy|admin fee|^payment/i

type Row = {
  invoiceId: string
  invoiceNumber: string | null
  invoiceDate: string
  supplierName: string
  venue: string | null
  description: string
  ingredientName: string | null
  canonicalName: string | null
  category: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  lineTotal: number | null
}

function normUnit(u: string | null): string {
  const s = (u ?? "").trim().toLowerCase()
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(s)) return "kg"
  if (/^(bun|bunch|bunches|bch|bn)$/.test(s)) return "bunch"
  if (/^(ea|each|pc|pcs|piece|pieces|unit|units)$/.test(s)) return "each"
  if (/^(pun|punnet|punnets|pnt)$/.test(s)) return "punnet"
  if (/^(box|boxes|ctn|carton|cartons|case|cases)$/.test(s)) return "box"
  if (/^(bag|bags)$/.test(s)) return "bag"
  if (/^(tray|trays)$/.test(s)) return "tray"
  if (/^(g|gm|gms|gram|grams)$/.test(s)) return "g"
  return s || "?"
}
// Fallback grouping for lines with no mapped ingredient: strip pack sizes,
// numbers and supplier prefixes so "HERB - MINT" and "Herbs - Mint" meet.
const PACK =
  /\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|gr|gm|gms|ml|l|lt|ltr|ea|pk|pkt|ct|ctn|cs|doz|slv|tub|btl|bag|box|carton|tray|bun|bunch|pun|punnet)s?\b/gi
function fallbackName(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(PACK, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/^(herb|herbs|baby|micro|fruit|veg|vegetable)\s*-\s*/, "$1 ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
function money(n: number): string {
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function pad(s: string | number, w: number, right = false): string {
  const t = String(s)
  return right ? t.padStart(w) : t.length > w ? t.slice(0, w - 1) + "…" : t.padEnd(w)
}
function lineValue(r: Row): number {
  if (r.lineTotal !== null && !Number.isNaN(r.lineTotal)) return r.lineTotal
  if (r.quantity !== null && r.unitPrice !== null) return r.quantity * r.unitPrice
  return 0
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const res = await pool.query(
    `
    SELECT i.id              AS "invoiceId",
           i."invoiceNumber" AS "invoiceNumber",
           i."invoiceDate"::text AS "invoiceDate",
           i."supplierName"  AS "supplierName",
           i.venue::text     AS venue,
           li.description    AS description,
           ing.name          AS "ingredientName",
           ing."canonicalName" AS "canonicalName",
           ing.category::text AS category,
           li.quantity::float AS quantity,
           li.unit           AS unit,
           li."unitPrice"::float AS "unitPrice",
           li."lineTotal"::float AS "lineTotal"
    FROM "InvoiceLineItem" li
    JOIN "Invoice" i ON i.id = li."invoiceId"
    LEFT JOIN "Ingredient" ing ON ing.id = li."ingredientId"
    WHERE i.status IN ('EXTRACTED','MATCHED','APPROVED')
      AND i."invoiceDate" >= $1 AND i."invoiceDate" < $2
      AND (
        i."supplierName" ~* 'pacific|jensen|produce oz|coastal fresh|green farm'
        OR ing.category IN ('VEGETABLE','FRUIT','HERB','MUSHROOM')
      )
    ORDER BY i."invoiceDate", i."supplierName"
    `,
    [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
  )
  await pool.end()
  const raw = res.rows as Row[]

  // Drop re-ingested duplicates: one invoice id per supplier + invoice number.
  const keep = new Map<string, string>()
  const dupIds = new Set<string>()
  for (const r of raw) {
    if (!r.invoiceNumber) continue
    const k = `${r.supplierName.toLowerCase()}|${r.invoiceNumber.trim()}`
    const first = keep.get(k)
    if (first === undefined) keep.set(k, r.invoiceId)
    else if (first !== r.invoiceId) dupIds.add(r.invoiceId)
  }
  const rows = raw.filter((r) => !dupIds.has(r.invoiceId) && !NOISE.test(r.description.trim()))

  // Use the span the data actually covers, not the requested window, so a
  // half-populated year is not divided by 52.
  const dates = rows.map((r) => r.invoiceDate).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const spanDays = first && last ? Math.max(7, (new Date(last).getTime() - new Date(first).getTime()) / 86400_000 + 1) : 0
  const weeks = spanDays / 7
  const annual = (v: number) => (weeks > 0 ? (v / weeks) * 52 : 0)

  console.log(`Requested window ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`)
  console.log(`Data actually covers ${first ?? "-"} to ${last ?? "-"} (${spanDays.toFixed(0)} days, ${weeks.toFixed(1)} weeks). "Annual" below = spend ÷ weeks × 52.`)
  console.log(`Produce lines: ${rows.length}` + (dupIds.size ? ` (dropped ${dupIds.size} duplicate invoices)` : "") + "\n")

  type Agg = {
    spend: number
    lines: number
    qty: Map<string, number>
    venues: Map<string, number>
    suppliers: Map<string, number>
    months: Set<string>
    category: string
    examples: Set<string>
  }
  const mk = (category: string): Agg => ({ spend: 0, lines: 0, qty: new Map(), venues: new Map(), suppliers: new Map(), months: new Set(), category, examples: new Set() })
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

  const products = new Map<string, Agg>()
  const supplierTotals = new Map<string, number>()
  const categoryTotals = new Map<string, number>()
  const monthTotals = new Map<string, number>()
  const venueTotals = new Map<string, number>()
  for (const r of rows) {
    const v = lineValue(r)
    const isProduceSupplier = PRODUCE_SUPPLIER.test(r.supplierName)
    const cat = r.category && PRODUCE_CATEGORIES.has(r.category) ? r.category : isProduceSupplier ? (r.category ?? "UNMAPPED") : r.category ?? "OTHER"
    const key = (r.canonicalName ?? r.ingredientName ?? fallbackName(r.description)).toLowerCase()
    const a = products.get(key) ?? mk(cat)
    a.spend += v
    a.lines += 1
    bump(a.qty, normUnit(r.unit), r.quantity ?? 0)
    bump(a.venues, r.venue ?? "UNASSIGNED", v)
    bump(a.suppliers, r.supplierName, v)
    a.months.add(r.invoiceDate.slice(0, 7))
    if (a.examples.size < 2) a.examples.add(r.description)
    products.set(key, a)
    bump(supplierTotals, r.supplierName, v)
    bump(categoryTotals, cat, v)
    bump(monthTotals, r.invoiceDate.slice(0, 7), v)
    bump(venueTotals, r.venue ?? "UNASSIGNED", v)
  }
  const grand = rows.reduce((s, r) => s + lineValue(r), 0)

  console.log("=".repeat(96))
  console.log(`TOTAL PRODUCE SPEND: ${money(grand)} in window  ->  ${money(annual(grand))} a year at this rate`)
  console.log("=".repeat(96))

  console.log("\nBy supplier:")
  for (const [s, v] of [...supplierTotals.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${pad(s, 28)} ${pad(money(v), 10, true)}  ${pad(money(annual(v)), 10, true)}/yr  ${((v / grand) * 100).toFixed(0).padStart(3)}%`)
  }
  console.log("\nBy venue:")
  for (const [s, v] of [...venueTotals.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${pad(s, 28)} ${pad(money(v), 10, true)}  ${pad(money(annual(v)), 10, true)}/yr`)
  }
  console.log("\nBy category:")
  for (const [s, v] of [...categoryTotals.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${pad(s, 28)} ${pad(money(v), 10, true)}  ${pad(money(annual(v)), 10, true)}/yr  ${((v / grand) * 100).toFixed(0).padStart(3)}%`)
  }
  console.log("\nBy month:")
  for (const m of [...monthTotals.keys()].sort()) console.log(`  ${m}  ${pad(money(monthTotals.get(m)!), 10, true)}`)

  const ranked = [...products.entries()].sort((x, y) => y[1].spend - x[1].spend)
  console.log(`\nTOP ${Math.min(topN, ranked.length)} PRODUCTS BY SPEND (cumulative column is the running annual total, for picking a $50k slice)`)
  console.log(
    pad("#", 3, true),
    pad("product", 30),
    pad("cat", 10),
    pad("spend", 9, true),
    pad("annual", 9, true),
    pad("cumul/yr", 10, true),
    pad("per wk", 8, true),
    pad("quantity (annualised)", 26),
    pad("BH/BU split", 12),
    pad("mths", 4, true),
    " suppliers"
  )
  let cum = 0
  ranked.slice(0, topN).forEach(([name, a], i) => {
    cum += annual(a.spend)
    const qty = [...a.qty.entries()]
      .filter(([, q]) => q > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([u, q]) => `${annual(q).toFixed(0)} ${u}`)
      .join(", ")
    const bh = a.venues.get("BEACH_HOUSE") ?? 0
    const bu = a.venues.get("BURLEIGH") ?? 0
    const tg = a.venues.get("TEA_GARDEN") ?? 0
    const split = a.spend > 0 ? `${(((bh + tg) / a.spend) * 100).toFixed(0)}% / ${((bu / a.spend) * 100).toFixed(0)}%` : "-"
    const sup = [...a.suppliers.entries()].sort((x, y) => y[1] - x[1]).map(([s, v]) => `${s.split(" ")[0]} ${((v / a.spend) * 100).toFixed(0)}%`).join(", ")
    console.log(
      pad(i + 1, 3, true),
      pad(name, 30),
      pad(a.category, 10),
      pad(money(a.spend), 9, true),
      pad(money(annual(a.spend)), 9, true),
      pad(money(cum), 10, true),
      pad(money(a.spend / weeks), 8, true),
      pad(qty, 26),
      pad(split, 12),
      pad(a.months.size, 4, true),
      " " + sup
    )
  })
  const unmapped = ranked.filter(([, a]) => a.category === "UNMAPPED").reduce((s, [, a]) => s + a.spend, 0)
  console.log(`\nLines from produce suppliers with no mapped ingredient (grouped by cleaned description instead): ${money(unmapped)} (${((unmapped / grand) * 100).toFixed(0)}% of produce spend).`)
  console.log("BH/BU split = Currumbin (Beach House + Tea Garden) / Burleigh share of the product's spend.")

  if (dump) {
    const path = "/tmp/produce-lines.csv"
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
    const lines = ["date,supplier,venue,description,ingredient,canonical,category,quantity,unit,unitPrice,lineTotal"]
    for (const r of rows) lines.push([r.invoiceDate, r.supplierName, r.venue, r.description, r.ingredientName, r.canonicalName, r.category, r.quantity, r.unit, r.unitPrice, r.lineTotal].map(esc).join(","))
    writeFileSync(path, lines.join("\n"))
    console.log(`\nWrote ${rows.length} lines to ${path}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
