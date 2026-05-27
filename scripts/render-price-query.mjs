// Generates four files:
//   - bidfood-price-query.html       (Bidfood items that have gone up — with $)
//   - fermex-price-query.html        (Fermex items that have gone up — with $)
//   - provedores-price-query.html    (Provedores items that have gone up — with $)
//   - requote-master-list.html       (every increased item across all 3, no $)
//
// All four are self-contained HTML (printable to PDF) suitable for emailing
// to suppliers.

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const formsPath = path.join(__dirname, "order-forms.json")
const linesPath = "/tmp/tarte-invoice-lines.json"

const forms = JSON.parse(readFileSync(formsPath, "utf8")).forms
const allLines = JSON.parse(readFileSync(linesPath, "utf8").trim())

// ─── Reuse comparison logic ─────────────────────────────────────
const STOP = new Set([
  "the", "and", "of", "for", "with", "from", "a", "an",
  "kg", "kgs", "g", "gr", "gm", "gms", "ml", "l", "ltr", "lt",
  "ea", "each", "pcs", "pk", "pack", "ctn", "case", "drum", "can",
  "jar", "roll", "units", "imitation", "brand", "fresh", "frozen",
  "iqf", "natural", "co", "ltd", "pty",
])
const tokens = (s) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t))
const overlap = (a, b) => { if (!a.length || !b.length) return 0; const sb = new Set(b); let n = 0; for (const t of a) if (sb.has(t)) n++; return n / Math.min(a.length, b.length) }
const normSup = (s) => s.toLowerCase().replace(/\b(the|a|an)\s+/g, "").replace(/\b(pty|ltd|co|inc)\b/g, "").replace(/[^a-z0-9]/g, "")
const PACK_REGEX = /(\d+(?:\.\d+)?)\s*(?:x\s*\d+\s*)?(kg|kilo|gm|gms?|grams?|gr|ml|millili|l|ltr|lt|liter|litre)\b/i
function normaliseInvoice(line) {
  const u = (line.unit || "").toLowerCase(), price = line.unit_price
  if (!Number.isFinite(price) || price <= 0) return null
  if (u === "kg" || u === "kilogram") return { perKg: price }
  if (u === "g" || u === "gram") return { perKg: price * 1000 }
  if (u === "l" || u === "ltr" || u === "lt" || u === "litre" || u === "liter") return { perL: price }
  if (u === "ml") return { perL: price * 1000 }
  const m = (line.description || "").match(PACK_REGEX)
  if (m) {
    const qty = parseFloat(m[1]), u2 = m[2].toLowerCase()
    if (u2.startsWith("kg") || u2 === "kilo") return { perKg: price / qty }
    if (u2.startsWith("g")) return { perKg: price / (qty / 1000) }
    if (u2 === "l" || u2.startsWith("ltr") || u2.startsWith("lt") || u2.startsWith("liter") || u2.startsWith("litre")) return { perL: price / qty }
    if (u2 === "ml" || u2.startsWith("milli")) return { perL: price / (qty / 1000) }
  }
  return { perEa: price }
}
function priceFor(item, n) {
  const u = (item.unit || "").toLowerCase()
  if (u === "kg" && n.perKg !== undefined) return n.perKg
  if (u === "l" && n.perL !== undefined) return n.perL
  if ((u === "unit" || u === "roll") && n.perEa !== undefined) return n.perEa
  return null
}
const plausible = (a, b) => Number.isFinite(a) && a > 0 && b / a >= 0.2 && b / a <= 5
const normalised = allLines.map((l) => ({ ...l, norm: normaliseInvoice(l) }))

function bestSupplierMatch(item, supplier) {
  const lo = normSup(supplier), itemTokens = tokens(item.name)
  let best = null
  for (const c of normalised) {
    if (normSup(c.supplier) !== lo || !c.norm) continue
    if (overlap(itemTokens, tokens(c.description)) < 0.7) continue
    const p = priceFor(item, c.norm)
    if (p === null || !plausible(item.unitPrice ?? item.packPrice, p)) continue
    if (!best || (c.invoice_date ?? "") > (best.invoice_date ?? "")) best = { ...c, normalisedPrice: p }
  }
  return best
}

// ─── Build the increased-items table per supplier ───────────────
const increasedBySupplier = new Map()
for (const form of forms) {
  const rows = []
  for (const item of form.items) {
    const same = bestSupplierMatch(item, form.supplier)
    if (!same) continue
    const formP = item.unitPrice ?? item.packPrice
    const newP = same.normalisedPrice
    const pct = ((newP - formP) / formP) * 100
    if (pct < 1) continue // only items that went up
    rows.push({
      category: item.category,
      name: item.name,
      packSize: item.packSize,
      unit: item.unit,
      formPrice: formP,
      newPrice: newP,
      pct,
      invoiceDate: same.invoice_date,
    })
  }
  rows.sort((a, b) => b.pct - a.pct)
  increasedBySupplier.set(form.supplier, rows)
}

// ─── Per-supplier "explain please" reports ──────────────────────
const today = new Date().toLocaleDateString("en-AU", {
  day: "numeric", month: "long", year: "numeric",
})

const baseCss = `
:root { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: #1a1a1a; }
body { margin: 0; padding: 40px; background: white; max-width: 900px; margin-left: auto; margin-right: auto; }
h1 { margin: 0 0 4px; font-size: 24px; }
h2 { margin: 32px 0 12px; font-size: 16px; color: #444; border-bottom: 1px solid #e7e2dd; padding-bottom: 4px; }
.subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
.intro { font-size: 14px; line-height: 1.6; margin-bottom: 24px; padding: 16px; background: #faf7f4; border-left: 3px solid #c4a882; border-radius: 0 4px 4px 0; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0ebe6; }
th { background: #1a1a1a; color: white; font-weight: 500; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
.delta-up { color: #b91c1c; font-weight: 600; }
.cat { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.foot { margin-top: 32px; font-size: 12px; color: #888; }
@media print { body { padding: 24px; } th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

function renderSupplierReport(supplier, rows) {
  const totalUp = rows.length
  const avgPct = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Tarte — ${supplier} price query — ${today}</title>
<style>${baseCss}</style></head><body>
<h1>Tarte Kitchen — Price increase query</h1>
<p class="subtitle">${supplier} · prepared ${today}</p>
<div class="intro">
Hi ${supplier} team,<br><br>
We've been reviewing recent invoices against the locked-in pricing on the order form you provided when our account was set up. The items below have moved up ${totalUp === 1 ? "" : ""} since that form (average increase across the list: <strong>${avgPct.toFixed(1)}%</strong>).
<br><br>
Could you please confirm whether these increases are intentional, and provide an explanation / updated pricing?
</div>
<h2>Items with price increases (${totalUp})</h2>
<table>
<thead><tr>
  <th>Category</th><th>Item</th><th>Pack size</th>
  <th class="num">Form $/unit</th><th class="num">Latest $/unit</th><th class="num">Change</th>
</tr></thead><tbody>
${rows.map(r => `<tr>
  <td><span class="cat">${r.category}</span></td>
  <td>${r.name}</td>
  <td>${r.packSize || "—"}</td>
  <td class="num">$${r.formPrice.toFixed(2)}/${r.unit}</td>
  <td class="num">$${r.newPrice.toFixed(2)}/${r.unit}</td>
  <td class="num delta-up">+${r.pct.toFixed(0)}%</td>
</tr>`).join("\n")}
</tbody></table>
<p class="foot">Source: invoices received in the last 90 days, normalised to per-kg / per-L / per-each. Generated by the Tarte Kitchen tracking system.</p>
</body></html>`
  return html
}

const outDir = path.join(__dirname, "..")
for (const [supplier, rows] of increasedBySupplier) {
  if (rows.length === 0) continue
  const slug = supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const file = path.join(outDir, `${slug}-price-query.html`)
  writeFileSync(file, renderSupplierReport(supplier, rows), "utf8")
  console.log(file, `(${rows.length} increased items)`)
}

// ─── Master re-quote list (no $) ────────────────────────────────
// Dedupe by item name across all suppliers; keep category context.
const masterMap = new Map()
for (const [supplier, rows] of increasedBySupplier) {
  for (const r of rows) {
    const key = r.name.toLowerCase()
    const existing = masterMap.get(key)
    if (existing) {
      existing.suppliers.add(supplier)
    } else {
      masterMap.set(key, {
        category: r.category,
        name: r.name,
        packSize: r.packSize,
        suppliers: new Set([supplier]),
      })
    }
  }
}
const masterRows = Array.from(masterMap.values()).sort(
  (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
)

const masterHtml = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Tarte — Re-quote request — ${today}</title>
<style>${baseCss}</style></head><body>
<h1>Tarte Kitchen — Request for re-quote</h1>
<p class="subtitle">Master list · prepared ${today} · ${masterRows.length} items</p>
<div class="intro">
Hi team,<br><br>
We're refreshing our supplier pricing across the whole kitchen and would appreciate a quote on the items below. Please reply with your best price (per pack and per kg / L / unit) and the pack sizes you can offer.
<br><br>
Items are grouped by category. Pack sizes are indicative — quote on whatever pack size you prefer to supply.
</div>
${(() => {
  const byCat = new Map()
  for (const r of masterRows) {
    const list = byCat.get(r.category) ?? []
    list.push(r); byCat.set(r.category, list)
  }
  return Array.from(byCat.entries()).map(([cat, items]) => `
<h2>${cat}</h2>
<table>
<thead><tr><th>Item</th><th>Indicative pack size</th></tr></thead>
<tbody>
${items.map(it => `<tr><td>${it.name}</td><td>${it.packSize || "—"}</td></tr>`).join("\n")}
</tbody></table>`).join("\n")
})()}
<p class="foot">${masterRows.length} items in total. Generated by the Tarte Kitchen tracking system.</p>
</body></html>`

const masterFile = path.join(outDir, "requote-master-list.html")
writeFileSync(masterFile, masterHtml, "utf8")
console.log(masterFile, `(${masterRows.length} unique items)`)
