// Local comparison runner: form-locked-in pricing vs recent invoice pricing,
// normalised to a per-base-unit basis ($/kg, $/L, $/each).

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const formsPath = path.join(__dirname, "order-forms.json")
const linesPath = "/tmp/tarte-invoice-lines.json"

const forms = JSON.parse(readFileSync(formsPath, "utf8")).forms
const allLines = JSON.parse(readFileSync(linesPath, "utf8").trim())

// ─── Tokenisation ────────────────────────────────────────────────
const STOP = new Set([
  "the", "and", "of", "for", "with", "from", "a", "an",
  "kg", "kgs", "g", "gr", "gm", "gms", "ml", "l", "ltr", "lt",
  "ea", "each", "pcs", "pk", "pack", "ctn", "case", "drum", "can",
  "jar", "roll", "units", "imitation", "brand", "fresh", "frozen",
  "iqf", "natural", "co", "ltd", "pty",
])
function tokens(s) {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}
function overlap(a, b) {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  let n = 0
  for (const t of a) if (setB.has(t)) n++
  return n / Math.min(a.length, b.length)
}

// ─── Per-base-unit price normaliser ──────────────────────────────
// Given an invoice line, work out a $/kg, $/L or $/each rate and the
// canonical base unit. Returns null if we can't confidently figure it
// out (in which case we skip the comparison rather than mislead).
const PACK_REGEX =
  /(\d+(?:\.\d+)?)\s*(?:x\s*\d+\s*)?(kg|kilo|gm|gms?|grams?|gr|ml|millili|l|ltr|lt|liter|litre)\b/i

function normaliseInvoice(line) {
  const u = (line.unit || "").toLowerCase()
  const price = line.unit_price
  if (!Number.isFinite(price) || price <= 0) return null

  // Direct cases
  if (u === "kg" || u === "kilogram") return { perKg: price }
  if (u === "g" || u === "gram") return { perKg: price * 1000 }
  if (u === "l" || u === "ltr" || u === "lt" || u === "litre" || u === "liter")
    return { perL: price }
  if (u === "ml") return { perL: price * 1000 }

  // unit is something like "ea" / "pack" / "carton" — parse description
  // for the pack size to derive $/base-unit.
  const desc = line.description || ""
  const m = desc.match(PACK_REGEX)
  if (m) {
    const qty = parseFloat(m[1])
    const u2 = m[2].toLowerCase()
    if (u2.startsWith("kg") || u2 === "kilo") return { perKg: price / qty }
    if (u2.startsWith("g")) return { perKg: price / (qty / 1000) }
    if (u2 === "l" || u2.startsWith("ltr") || u2.startsWith("lt") || u2.startsWith("liter") || u2.startsWith("litre"))
      return { perL: price / qty }
    if (u2 === "ml" || u2.startsWith("milli")) return { perL: price / (qty / 1000) }
  }

  // Last resort: per-each. Only useful for cleaning/disposable items
  // that are sold by-the-piece on both sides.
  return { perEa: price }
}

function priceFor(item, normalised) {
  // Pick the right denomination from the form item so we compare apples
  // to apples. Form's unitPrice field already normalised.
  const u = (item.unit || "").toLowerCase()
  if (u === "kg" && normalised.perKg !== undefined) return normalised.perKg
  if (u === "l" && normalised.perL !== undefined) return normalised.perL
  if (u === "unit" && normalised.perEa !== undefined) return normalised.perEa
  if (u === "roll" && normalised.perEa !== undefined) return normalised.perEa
  return null
}

// Pre-normalise everything once.
const normalised = allLines.map((l) => ({ ...l, norm: normaliseInvoice(l) }))

// A match is only "trustworthy" when:
//   - Token overlap with the form description is strong (≥0.7).
//   - The normalised invoice price is within 5x of the form price
//     (otherwise it's almost certainly a unit-mismatch we can't fix
//     here — e.g. invoice line is per-case while form is per-kg).
function plausible(formPrice, invoicePrice) {
  if (!Number.isFinite(formPrice) || formPrice <= 0) return false
  const ratio = invoicePrice / formPrice
  return ratio >= 0.2 && ratio <= 5
}

// Normalise supplier names so "Provedores" (form) matches "The Provedores"
// (invoice). Strip leading articles, trailing "Pty Ltd" etc., punctuation,
// and lowercase.
function normSup(s) {
  return s
    .toLowerCase()
    .replace(/\b(the|a|an)\s+/g, "")
    .replace(/\b(pty|ltd|co|inc)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
}

function bestSupplierMatch(item, supplier) {
  const lo = normSup(supplier)
  const itemTokens = tokens(item.name)
  const candidates = normalised.filter((c) => normSup(c.supplier) === lo && c.norm)
  let best = null
  for (const c of candidates) {
    const score = overlap(itemTokens, tokens(c.description))
    if (score < 0.7) continue
    const p = priceFor(item, c.norm)
    if (p === null) continue
    const formP = item.unitPrice ?? item.packPrice
    if (!plausible(formP, p)) continue
    // Most recent wins
    if (!best || (c.invoice_date ?? "") > (best.invoice_date ?? "")) {
      best = { ...c, normalisedPrice: p, score }
    }
  }
  return best
}

function bestCheapest(item) {
  const itemTokens = tokens(item.name)
  let best = null
  const formP = item.unitPrice ?? item.packPrice
  for (const c of normalised) {
    if (!c.norm) continue
    const score = overlap(itemTokens, tokens(c.description))
    if (score < 0.7) continue
    const p = priceFor(item, c.norm)
    if (p === null) continue
    if (!plausible(formP, p)) continue
    if (!best || p < best.normalisedPrice)
      best = { ...c, normalisedPrice: p, score }
  }
  return best
}

// ─── Render ──────────────────────────────────────────────────────
const out = []
out.push("# Supplier Order Form vs Recent Invoices")
out.push("")
out.push(
  "Form prices vs the most-recent invoice price (last 90 days), both " +
    "normalised to **$/kg**, **$/L** or **$/each**. Δ shows price movement on the same supplier. " +
    "**Cheapest now** only fills in when another supplier's recent invoice is ≥5% cheaper per unit."
)
out.push("")
out.push(`Invoice lines analysed: **${allLines.length}**`)
out.push("")

let upTotal = 0,
  downTotal = 0,
  cheaperTotal = 0,
  noMatchTotal = 0

for (const form of forms) {
  out.push(`## ${form.supplier}`)
  out.push("")
  out.push(`| Item | Pack | Form (${"$"}/unit) | Now (this supplier) | Δ | Cheapest now | Cheapest supplier |`)
  out.push("|---|---|---:|---:|---:|---:|---|")
  let up = 0,
    down = 0,
    cheaper = 0,
    noMatch = 0
  for (const item of form.items) {
    const formP = item.unitPrice ?? item.packPrice
    const same = bestSupplierMatch(item, form.supplier)
    const cheapest = bestCheapest(item)
    let delta = "—"
    let sameLabel = "—"
    if (same && Number.isFinite(formP)) {
      sameLabel = `$${same.normalisedPrice.toFixed(2)}`
      const pct = ((same.normalisedPrice - formP) / formP) * 100
      if (pct > 1) {
        delta = `**+${pct.toFixed(0)}%**`
        up++
      } else if (pct < -1) {
        delta = `−${Math.abs(pct).toFixed(0)}%`
        down++
      } else {
        delta = "≈"
      }
    } else {
      noMatch++
    }

    let cheapestLabel = "—",
      cheapestSupplier = "—"
    if (
      cheapest &&
      normSup(cheapest.supplier) !== normSup(form.supplier) &&
      Number.isFinite(formP) &&
      cheapest.normalisedPrice < formP * 0.95
    ) {
      const save = ((formP - cheapest.normalisedPrice) / formP) * 100
      cheapestLabel = `$${cheapest.normalisedPrice.toFixed(2)} (**−${save.toFixed(0)}%**)`
      cheapestSupplier = cheapest.supplier
      cheaper++
    } else if (cheapest) {
      cheapestLabel = `$${cheapest.normalisedPrice.toFixed(2)}`
      cheapestSupplier = cheapest.supplier
    }

    out.push(
      `| ${item.name} | ${item.packSize || "—"} | $${
        Number.isFinite(formP) ? formP.toFixed(2) : "—"
      }/${item.unit || ""} | ${sameLabel} | ${delta} | ${cheapestLabel} | ${cheapestSupplier} |`
    )
  }
  out.push("")
  out.push(
    `**${form.supplier}:** ${up} up · ${down} down · ${cheaper} cheaper from another supplier · ${noMatch} no recent match.`
  )
  out.push("")
  upTotal += up
  downTotal += down
  cheaperTotal += cheaper
  noMatchTotal += noMatch
}

out.push("---")
out.push("")
out.push(
  `**All forms combined:** ${upTotal} items up, ${downTotal} down, ${cheaperTotal} would be cheaper from another supplier, ${noMatchTotal} not seen on recent invoices.`
)

const md = out.join("\n")
const outPath = path.join(__dirname, "..", "supplier-form-comparison.md")
writeFileSync(outPath, md, "utf8")
console.log(md)
console.error(`\n[wrote ${outPath}]`)
