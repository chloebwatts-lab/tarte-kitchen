// READ-ONLY: watermelon and fresh-herb purchasing across every supplier and
// venue, from parsed invoice lines. Answers: how many kilos of watermelon a
// year, at what price by month (high vs low season), and which herbs we buy
// most and what they cost per week / month / year.
//
// Run on the droplet (needs DATABASE_URL):
//   cd /root/tarte-kitchen && npx tsx scripts/watermelon-herb-spend.ts
// Options:
//   --from 2025-09-01 --to 2026-09-01   window (default: trailing 365 days)
//   --dump                              also write matched lines as CSV to
//                                       /tmp/watermelon-herb-lines.csv
import "dotenv/config"
import { writeFileSync } from "node:fs"
import { Pool } from "pg"

// ---------- args ----------
const argv = process.argv.slice(2)
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const to = arg("to") ? new Date(arg("to")!) : new Date()
const from = arg("from") ? new Date(arg("from")!) : new Date(to.getTime() - 365 * 86400_000)
const dump = argv.includes("--dump")
const windowDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400_000))
const weeks = windowDays / 7

// ---------- classification ----------
// Canonical herb -> regex on the invoice description (or mapped ingredient name).
const HERBS: Array<[string, RegExp]> = [
  ["basil", /\bbasil\b/i],
  ["mint", /\bmint\b/i],
  ["coriander", /\bcoriander\b|\bcilantro\b/i],
  ["chives", /\bchive(s)?\b/i],
  ["parsley", /\bparsley\b/i],
  ["dill", /\bdill\b/i],
  ["thyme", /\bthyme\b/i],
  ["rosemary", /\brosemary\b/i],
  ["sage", /\bsage\b/i],
  ["tarragon", /\btarragon\b/i],
  ["oregano", /\boregano\b/i],
  ["lemongrass", /\blemon\s?grass\b/i],
  ["chervil", /\bchervil\b/i],
]
// Lines that mention a herb word but are not fresh herbs.
const NOT_FRESH_HERB =
  /dried|dry\b|pesto|seed|oil|paste|sauce|syrup|tea\b|i\/c|ice ?cream|jar|ground|powder|extract|pickle|jelly|cordial|micro/i
const WATERMELON = /watermelon/i
const NOT_WATERMELON = /radish|juice|syrup|cordial|puree|frozen|iqf|candy|lolly|flavou?r/i

type Row = {
  invoiceId: string
  invoiceDate: string
  supplierName: string
  venue: string | null
  description: string
  ingredientName: string | null
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
  if (/^(g|gm|gms|gram|grams)$/.test(s)) return "g"
  return s || "?"
}
function money(n: number): string {
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function money2(n: number): string {
  return "$" + n.toFixed(2)
}
function pad(s: string | number, w: number, right = false): string {
  const t = String(s)
  return right ? t.padStart(w) : t.padEnd(w)
}
function lineValue(r: Row): number {
  if (r.lineTotal !== null && !Number.isNaN(r.lineTotal)) return r.lineTotal
  if (r.quantity !== null && r.unitPrice !== null) return r.quantity * r.unitPrice
  return 0
}
function monthKey(d: string): string {
  return d.slice(0, 7)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const res = await pool.query(
    `
    SELECT i.id            AS "invoiceId",
           i."invoiceDate"::text AS "invoiceDate",
           i."supplierName" AS "supplierName",
           i.venue::text    AS venue,
           li.description   AS description,
           ing.name         AS "ingredientName",
           li.quantity::float  AS quantity,
           li.unit          AS unit,
           li."unitPrice"::float AS "unitPrice",
           li."lineTotal"::float AS "lineTotal"
    FROM "InvoiceLineItem" li
    JOIN "Invoice" i ON i.id = li."invoiceId"
    LEFT JOIN "Ingredient" ing ON ing.id = li."ingredientId"
    WHERE i.status IN ('EXTRACTED','MATCHED','APPROVED')
      AND i."invoiceDate" >= $1 AND i."invoiceDate" < $2
      AND (
        li.description ~* 'watermelon' OR ing.name ~* 'watermelon' OR
        li.description ~* '(basil|mint|coriander|cilantro|chive|parsley|dill|thyme|rosemary|sage|tarragon|oregano|lemon ?grass|chervil)' OR
        ing.name       ~* '(basil|mint|coriander|cilantro|chive|parsley|dill|thyme|rosemary|sage|tarragon|oregano|lemon ?grass|chervil)'
      )
    ORDER BY i."invoiceDate", i."supplierName"
    `,
    [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
  )
  await pool.end()
  const rows = res.rows as Row[]

  console.log(`Window ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)} (${windowDays} days, ${weeks.toFixed(1)} weeks)`)
  console.log(`Matched invoice lines: ${rows.length}\n`)

  // ---------- WATERMELON ----------
  const wm = rows.filter((r) => {
    const text = `${r.description} ${r.ingredientName ?? ""}`
    return WATERMELON.test(text) && !NOT_WATERMELON.test(text)
  })
  const wmKg = wm.filter((r) => normUnit(r.unit) === "kg" && r.quantity !== null)
  const wmOther = wm.filter((r) => !(normUnit(r.unit) === "kg" && r.quantity !== null))

  console.log("=".repeat(78))
  console.log("WATERMELON (lines billed by the kilo)")
  console.log("=".repeat(78))

  // month x venue
  type Agg = { kg: number; spend: number; n: number; prices: number[] }
  const mk = () => ({ kg: 0, spend: 0, n: 0, prices: [] as number[] })
  const byMonth = new Map<string, Agg>()
  const byVenue = new Map<string, Agg>()
  const bySupplier = new Map<string, Agg>()
  const byMonthVenue = new Map<string, Agg>()
  const add = (m: Map<string, Agg>, k: string, r: Row) => {
    const a = m.get(k) ?? mk()
    const v = lineValue(r)
    a.kg += r.quantity!
    a.spend += v
    a.n += 1
    if (r.quantity! > 0) a.prices.push(v / r.quantity!)
    m.set(k, a)
  }
  for (const r of wmKg) {
    add(byMonth, monthKey(r.invoiceDate), r)
    add(byVenue, r.venue ?? "UNASSIGNED", r)
    add(bySupplier, r.supplierName, r)
    add(byMonthVenue, `${monthKey(r.invoiceDate)}|${r.venue ?? "UNASSIGNED"}`, r)
  }
  const totKg = wmKg.reduce((s, r) => s + r.quantity!, 0)
  const totSpend = wmKg.reduce((s, r) => s + lineValue(r), 0)

  console.log("\nBy month (all venues, all suppliers):")
  console.log(pad("month", 9), pad("kg", 9, true), pad("spend", 10, true), pad("avg $/kg", 9, true), pad("min", 7, true), pad("max", 7, true), pad("lines", 6, true))
  const months = [...byMonth.keys()].sort()
  for (const m of months) {
    const a = byMonth.get(m)!
    const avg = a.kg > 0 ? a.spend / a.kg : 0
    console.log(
      pad(m, 9),
      pad(a.kg.toFixed(1), 9, true),
      pad(money(a.spend), 10, true),
      pad(money2(avg), 9, true),
      pad(a.prices.length ? money2(Math.min(...a.prices)) : "-", 7, true),
      pad(a.prices.length ? money2(Math.max(...a.prices)) : "-", 7, true),
      pad(a.n, 6, true)
    )
  }

  console.log("\nBy venue:")
  for (const [v, a] of [...byVenue.entries()].sort((x, y) => y[1].kg - x[1].kg)) {
    console.log(`  ${pad(v, 12)} ${pad(a.kg.toFixed(1) + " kg", 12, true)} ${pad(money(a.spend), 10, true)}  avg ${money2(a.kg ? a.spend / a.kg : 0)}/kg  (${a.n} lines)`)
  }
  console.log("\nBy supplier:")
  for (const [s, a] of [...bySupplier.entries()].sort((x, y) => y[1].kg - x[1].kg)) {
    console.log(`  ${pad(s, 24)} ${pad(a.kg.toFixed(1) + " kg", 12, true)} ${pad(money(a.spend), 10, true)}  avg ${money2(a.kg ? a.spend / a.kg : 0)}/kg  (${a.n} lines)`)
  }

  console.log("\nBy month and venue (kg):")
  const venues = [...byVenue.keys()].sort()
  console.log(pad("month", 9), ...venues.map((v) => pad(v, 12, true)))
  for (const m of months) {
    console.log(pad(m, 9), ...venues.map((v) => pad((byMonthVenue.get(`${m}|${v}`)?.kg ?? 0).toFixed(1), 12, true)))
  }

  // season
  const monthAvg = months
    .map((m) => ({ m, avg: byMonth.get(m)!.kg ? byMonth.get(m)!.spend / byMonth.get(m)!.kg : 0, kg: byMonth.get(m)!.kg }))
    .filter((x) => x.kg > 0)
  const sorted = [...monthAvg].sort((a, b) => b.avg - a.avg)
  const hi = sorted.slice(0, 3)
  const lo = sorted.slice(-3).reverse()
  const hiAvg = hi.length ? hi.reduce((s, x) => s + x.avg * x.kg, 0) / hi.reduce((s, x) => s + x.kg, 0) : 0
  const loAvg = lo.length ? lo.reduce((s, x) => s + x.avg * x.kg, 0) / lo.reduce((s, x) => s + x.kg, 0) : 0
  console.log("\nSeason pricing (dearest and cheapest months by average $/kg):")
  console.log(`  High season: ${hi.map((x) => `${x.m} ${money2(x.avg)}`).join(", ")}  -> ${money2(hiAvg)}/kg`)
  console.log(`  Low season:  ${lo.map((x) => `${x.m} ${money2(x.avg)}`).join(", ")}  -> ${money2(loAvg)}/kg`)
  console.log(`  Overall weighted average: ${money2(totKg ? totSpend / totKg : 0)}/kg`)

  const perWeekKg = totKg / weeks
  const perWeekSpend = totSpend / weeks
  console.log("\nWatermelon run-rate (from this window, all venues):")
  console.log(`  ${pad("", 10)} ${pad("kg", 12, true)} ${pad("spend", 12, true)}`)
  console.log(`  ${pad("per week", 10)} ${pad(perWeekKg.toFixed(1), 12, true)} ${pad(money(perWeekSpend), 12, true)}`)
  console.log(`  ${pad("per month", 10)} ${pad((perWeekKg * 52 / 12).toFixed(1), 12, true)} ${pad(money(perWeekSpend * 52 / 12), 12, true)}`)
  console.log(`  ${pad("per year", 10)} ${pad((perWeekKg * 52).toFixed(0), 12, true)} ${pad(money(perWeekSpend * 52), 12, true)}`)
  console.log(`  Window actual: ${totKg.toFixed(1)} kg, ${money(totSpend)} over ${windowDays} days`)

  if (wmOther.length) {
    console.log(`\nWatermelon lines NOT billed by the kilo (${wmOther.length}, not in the kg totals above; ${money(wmOther.reduce((s, r) => s + lineValue(r), 0))} spend):`)
    const byU = new Map<string, { qty: number; spend: number; n: number; eg: string }>()
    for (const r of wmOther) {
      const k = `${r.supplierName} | ${normUnit(r.unit)}`
      const a = byU.get(k) ?? { qty: 0, spend: 0, n: 0, eg: r.description }
      a.qty += r.quantity ?? 0
      a.spend += lineValue(r)
      a.n += 1
      byU.set(k, a)
    }
    for (const [k, a] of byU) console.log(`  ${pad(k, 36)} qty ${pad(a.qty.toFixed(1), 8, true)}  ${pad(money(a.spend), 9, true)}  (${a.n} lines, e.g. "${a.eg}")`)
  }

  // ---------- HERBS ----------
  console.log("\n" + "=".repeat(78))
  console.log("FRESH HERBS")
  console.log("=".repeat(78))
  type HAgg = { spend: number; n: number; qtyByUnit: Map<string, number>; byVenue: Map<string, number>; bySupplier: Map<string, number>; prices: number[] }
  const herbs = new Map<string, HAgg>()
  const skipped: Row[] = []
  for (const r of rows) {
    const text = `${r.description} ${r.ingredientName ?? ""}`
    if (WATERMELON.test(text)) continue
    const hit = HERBS.find(([, re]) => re.test(text))
    if (!hit) continue
    if (NOT_FRESH_HERB.test(r.description)) {
      skipped.push(r)
      continue
    }
    const [name] = hit
    const a = herbs.get(name) ?? { spend: 0, n: 0, qtyByUnit: new Map(), byVenue: new Map(), bySupplier: new Map(), prices: [] }
    const v = lineValue(r)
    a.spend += v
    a.n += 1
    const u = normUnit(r.unit)
    a.qtyByUnit.set(u, (a.qtyByUnit.get(u) ?? 0) + (r.quantity ?? 0))
    a.byVenue.set(r.venue ?? "UNASSIGNED", (a.byVenue.get(r.venue ?? "UNASSIGNED") ?? 0) + v)
    a.bySupplier.set(r.supplierName, (a.bySupplier.get(r.supplierName) ?? 0) + v)
    if (r.quantity && r.quantity > 0 && u === "bunch") a.prices.push(v / r.quantity)
    herbs.set(name, a)
  }
  const ranked = [...herbs.entries()].sort((x, y) => y[1].spend - x[1].spend)
  console.log("\nRanked by spend in window (bunch counts where billed by the bunch):")
  console.log(pad("herb", 12), pad("spend", 9, true), pad("per wk", 8, true), pad("per mo", 8, true), pad("per yr", 9, true), pad("bunches", 8, true), pad("bun/wk", 7, true), pad("$/bunch", 8, true), pad("lines", 6, true), "  other units")
  for (const [name, a] of ranked) {
    const bunches = a.qtyByUnit.get("bunch") ?? 0
    const other = [...a.qtyByUnit.entries()].filter(([u]) => u !== "bunch").map(([u, q]) => `${q.toFixed(1)} ${u}`).join(", ")
    const med = a.prices.length ? [...a.prices].sort((x, y) => x - y)[Math.floor(a.prices.length / 2)] : 0
    console.log(
      pad(name, 12),
      pad(money(a.spend), 9, true),
      pad(money(a.spend / weeks), 8, true),
      pad(money((a.spend / weeks) * 52 / 12), 8, true),
      pad(money((a.spend / weeks) * 52), 9, true),
      pad(bunches.toFixed(0), 8, true),
      pad((bunches / weeks).toFixed(1), 7, true),
      pad(med ? money2(med) : "-", 8, true),
      pad(a.n, 6, true),
      other ? "  " + other : ""
    )
  }
  console.log("\nTop herbs by venue (spend in window):")
  const allVenues = [...new Set(ranked.flatMap(([, a]) => [...a.byVenue.keys()]))].sort()
  console.log(pad("herb", 12), ...allVenues.map((v) => pad(v, 12, true)))
  for (const [name, a] of ranked.slice(0, 6)) {
    console.log(pad(name, 12), ...allVenues.map((v) => pad(money(a.byVenue.get(v) ?? 0), 12, true)))
  }
  console.log("\nTop herbs by supplier (spend in window):")
  for (const [name, a] of ranked.slice(0, 6)) {
    console.log(`  ${pad(name, 12)} ${[...a.bySupplier.entries()].sort((x, y) => y[1] - x[1]).map(([s, v]) => `${s} ${money(v)}`).join(", ")}`)
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} herb-word lines that are not fresh herbs (dried, pesto, seeds, oil, micro, etc). Examples:`)
    for (const r of skipped.slice(0, 8)) console.log(`  ${r.supplierName}: ${r.description}`)
  }

  if (dump) {
    const path = "/tmp/watermelon-herb-lines.csv"
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
    const lines = ["date,supplier,venue,description,ingredient,quantity,unit,unitPrice,lineTotal"]
    for (const r of rows) lines.push([r.invoiceDate, r.supplierName, r.venue, r.description, r.ingredientName, r.quantity, r.unit, r.unitPrice, r.lineTotal].map(esc).join(","))
    writeFileSync(path, lines.join("\n"))
    console.log(`\nWrote ${rows.length} matched lines to ${path}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
