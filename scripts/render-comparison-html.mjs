// Render the supplier comparison as a self-contained HTML file with
// sortable tables, color-coded price deltas, filters by supplier and
// "movers only" toggle. Open locally — no server needed.

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const formsPath = path.join(__dirname, "order-forms.json")
const linesPath = "/tmp/tarte-invoice-lines.json"

const forms = JSON.parse(readFileSync(formsPath, "utf8")).forms
const allLines = JSON.parse(readFileSync(linesPath, "utf8").trim())

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
function bestCheapest(item) {
  const itemTokens = tokens(item.name)
  let best = null
  const formP = item.unitPrice ?? item.packPrice
  for (const c of normalised) {
    if (!c.norm) continue
    if (overlap(itemTokens, tokens(c.description)) < 0.7) continue
    const p = priceFor(item, c.norm)
    if (p === null || !plausible(formP, p)) continue
    if (!best || p < best.normalisedPrice) best = { ...c, normalisedPrice: p }
  }
  return best
}

// Build all rows
const allRows = []
for (const form of forms) {
  for (const item of form.items) {
    const same = bestSupplierMatch(item, form.supplier)
    const cheapest = bestCheapest(item)
    const formP = item.unitPrice ?? item.packPrice
    const samePrice = same?.normalisedPrice ?? null
    const deltaPct = samePrice !== null && formP > 0 ? ((samePrice - formP) / formP) * 100 : null
    const cheapestPrice = cheapest?.normalisedPrice ?? null
    const cheapestSupplier = cheapest?.supplier ?? null
    const cheaperElsewhere =
      cheapest && normSup(cheapest.supplier) !== normSup(form.supplier) && cheapestPrice < formP * 0.95
    const savePct = cheaperElsewhere ? ((formP - cheapestPrice) / formP) * 100 : null
    allRows.push({
      formSupplier: form.supplier,
      category: item.category,
      name: item.name,
      packSize: item.packSize,
      unit: item.unit,
      formPrice: formP,
      samePrice,
      deltaPct,
      cheapestPrice,
      cheapestSupplier,
      cheaperElsewhere,
      savePct,
    })
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Tarte — Supplier Form vs Recent Invoices</title>
<style>
  :root { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: #1a1a1a; }
  body { margin: 0; padding: 0; background: #faf7f4; }
  header { padding: 24px 32px; border-bottom: 1px solid #e7e2dd; background: white; position: sticky; top: 0; z-index: 10; }
  header h1 { margin: 0 0 4px; font-size: 20px; }
  header p { margin: 0; font-size: 13px; color: #666; }
  .toolbar { padding: 12px 32px; background: white; border-bottom: 1px solid #e7e2dd; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: 73px; z-index: 9; }
  .toolbar label { font-size: 12px; color: #444; display: flex; align-items: center; gap: 6px; }
  .toolbar select, .toolbar input { font-size: 13px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; }
  .summary { display: flex; gap: 24px; padding: 16px 32px; background: white; border-bottom: 1px solid #e7e2dd; }
  .stat { font-size: 13px; }
  .stat .num { font-size: 22px; font-weight: 600; }
  .stat.up .num { color: #b91c1c; }
  .stat.down .num { color: #15803d; }
  .stat.alt .num { color: #1d4ed8; }
  .stat.none .num { color: #6b7280; }
  main { padding: 24px 32px; }
  table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e7e2dd; border-radius: 6px; overflow: hidden; }
  th, td { padding: 8px 12px; font-size: 13px; text-align: left; border-bottom: 1px solid #f0ebe6; }
  th { background: #1a1a1a; color: white; font-weight: 500; cursor: pointer; user-select: none; position: sticky; top: 130px; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:hover { background: #fafaf8; }
  .delta-up { color: #b91c1c; font-weight: 600; }
  .delta-down { color: #15803d; font-weight: 600; }
  .delta-flat { color: #6b7280; }
  .delta-na { color: #aaa; }
  .alt-cheaper { color: #1d4ed8; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; font-size: 11px; border-radius: 4px; background: #f0ebe6; color: #444; }
  .badge.bidfood { background: #dbeafe; color: #1e40af; }
  .badge.fermex { background: #dcfce7; color: #166534; }
  .badge.provedores { background: #fed7aa; color: #9a3412; }
  .cat { font-size: 11px; color: #888; }
  tr.hide { display: none; }
</style>
</head>
<body>
<header>
  <h1>Supplier Order Form vs Recent Invoices</h1>
  <p>Locked-in form prices vs the latest invoice price (last 90 days), normalised to $/kg, $/L, or $/each. Click any column header to sort.</p>
</header>
<div class="toolbar">
  <label>Supplier
    <select id="supplier-filter">
      <option value="">All</option>
      <option value="Bidfood">Bidfood</option>
      <option value="Fermex">Fermex</option>
      <option value="Provedores">Provedores</option>
    </select>
  </label>
  <label><input type="checkbox" id="movers-only" /> Movers only (Δ ≠ 0)</label>
  <label><input type="checkbox" id="cheaper-only" /> Where another supplier is cheaper</label>
  <label>Search <input type="text" id="search" placeholder="item name…" /></label>
</div>
<div class="summary" id="summary"></div>
<main>
<table id="t">
<thead>
<tr>
  <th data-key="formSupplier">Form</th>
  <th data-key="category">Category</th>
  <th data-key="name">Item</th>
  <th data-key="packSize">Pack</th>
  <th class="num" data-key="formPrice">Form $/unit</th>
  <th class="num" data-key="samePrice">Now (this supplier)</th>
  <th class="num" data-key="deltaPct">Δ</th>
  <th class="num" data-key="cheapestPrice">Cheapest now</th>
  <th data-key="cheapestSupplier">Cheapest supplier</th>
</tr>
</thead>
<tbody></tbody>
</table>
</main>
<script>
const rows = ${JSON.stringify(allRows)};
const tbody = document.querySelector("#t tbody");

function badge(supplier) {
  const cls = supplier.toLowerCase().includes("bidfood") ? "bidfood"
    : supplier.toLowerCase().includes("fermex") ? "fermex"
    : supplier.toLowerCase().includes("provedores") ? "provedores" : "";
  return '<span class="badge ' + cls + '">' + supplier + '</span>';
}

function fmt(n, prefix) {
  return n === null || n === undefined ? '<span class="delta-na">—</span>' : (prefix || "$") + n.toFixed(2);
}

function deltaCell(d) {
  if (d === null || d === undefined) return '<span class="delta-na">—</span>';
  if (Math.abs(d) < 1) return '<span class="delta-flat">≈</span>';
  if (d > 0) return '<span class="delta-up">+' + d.toFixed(0) + '%</span>';
  return '<span class="delta-down">' + d.toFixed(0) + '%</span>';
}

function render(filtered) {
  tbody.innerHTML = filtered.map(r => {
    const altClass = r.cheaperElsewhere ? "alt-cheaper" : "";
    const cheapestCell = r.cheapestPrice === null
      ? '<span class="delta-na">—</span>'
      : r.cheaperElsewhere
        ? '<span class="' + altClass + '">$' + r.cheapestPrice.toFixed(2) + ' (−' + r.savePct.toFixed(0) + '%)</span>'
        : '$' + r.cheapestPrice.toFixed(2);
    return '<tr>' +
      '<td>' + badge(r.formSupplier) + '</td>' +
      '<td><span class="cat">' + r.category + '</span></td>' +
      '<td>' + r.name + '</td>' +
      '<td>' + (r.packSize || '—') + '</td>' +
      '<td class="num">$' + r.formPrice.toFixed(2) + '/' + r.unit + '</td>' +
      '<td class="num">' + fmt(r.samePrice) + '</td>' +
      '<td class="num">' + deltaCell(r.deltaPct) + '</td>' +
      '<td class="num">' + cheapestCell + '</td>' +
      '<td>' + (r.cheapestSupplier ? badge(r.cheapestSupplier) : '<span class="delta-na">—</span>') + '</td>' +
    '</tr>';
  }).join("");

  const up = filtered.filter(r => r.deltaPct !== null && r.deltaPct > 1).length;
  const down = filtered.filter(r => r.deltaPct !== null && r.deltaPct < -1).length;
  const cheaper = filtered.filter(r => r.cheaperElsewhere).length;
  const noMatch = filtered.filter(r => r.deltaPct === null).length;
  document.getElementById("summary").innerHTML =
    '<div class="stat up"><div class="num">' + up + '</div><div>Items up</div></div>' +
    '<div class="stat down"><div class="num">' + down + '</div><div>Items down</div></div>' +
    '<div class="stat alt"><div class="num">' + cheaper + '</div><div>Cheaper from another supplier</div></div>' +
    '<div class="stat none"><div class="num">' + noMatch + '</div><div>No recent invoice match</div></div>';
}

let sortKey = "formSupplier", sortDir = 1;
function applyFilters() {
  const sup = document.getElementById("supplier-filter").value;
  const moversOnly = document.getElementById("movers-only").checked;
  const cheaperOnly = document.getElementById("cheaper-only").checked;
  const search = document.getElementById("search").value.toLowerCase();
  let filtered = rows.filter(r => {
    if (sup && r.formSupplier !== sup) return false;
    if (moversOnly && (r.deltaPct === null || Math.abs(r.deltaPct) < 1)) return false;
    if (cheaperOnly && !r.cheaperElsewhere) return false;
    if (search && !r.name.toLowerCase().includes(search)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number") return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });
  render(filtered);
}

document.querySelectorAll("th[data-key]").forEach(th => {
  th.addEventListener("click", () => {
    const k = th.dataset.key;
    if (sortKey === k) sortDir = -sortDir;
    else { sortKey = k; sortDir = 1; }
    applyFilters();
  });
});
document.getElementById("supplier-filter").addEventListener("change", applyFilters);
document.getElementById("movers-only").addEventListener("change", applyFilters);
document.getElementById("cheaper-only").addEventListener("change", applyFilters);
document.getElementById("search").addEventListener("input", applyFilters);
applyFilters();
</script>
</body>
</html>`

const outPath = path.join(__dirname, "..", "supplier-comparison.html")
writeFileSync(outPath, html, "utf8")
console.log(outPath)
