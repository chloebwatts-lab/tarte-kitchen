// Unit normalisation + pack-size parsing for invoice line items.
//
// The supplier price-alert flow naively compared `lineItem.unitPrice` to
// `ingredient.purchasePrice / purchaseQuantity`. When the invoice unit and
// the ingredient purchase unit didn't agree (e.g. a kale carton landing as
// `unit="carton"` against an ingredient stored as `unit="ea"`), the diff
// fired huge bogus "+1654%" alerts and a one-tap Apply would clobber the
// stored price and cascade through every recipe.
//
// `compareUnits` is the single gate the alert + apply paths now go through.
// Outcomes:
//   - "skip"          : nothing to flag (zero price, missing data)
//   - "same_unit"     : like-for-like, real price change ready to compare
//   - "converted"     : differing units but we have a conversion factor
//                       (either stored on SupplierItemMapping, or parsed
//                       from the description "5kg" / "12x500g" / "1L" etc.)
//   - "unit_changed"  : units differ and we have no usable conversion —
//                       surface for chef confirmation, do NOT auto-apply.

export interface IngredientUnitInfo {
  purchaseUnit: string
  purchaseQuantity: number
  purchasePrice: number
}

export interface InvoiceLineUnitInfo {
  unit: string | null
  unitPrice: number | null
  description: string
}

export type CompareResult =
  | { kind: "skip"; reason: "zero_price" | "missing_data" }
  | {
      kind: "same_unit"
      storedUnitPrice: number
      invoiceUnitPrice: number
      changePct: number
      changeAmount: number
    }
  | {
      kind: "converted"
      storedUnitPrice: number
      invoiceUnitPriceInStoredUnits: number
      conversionFactor: number
      conversionSource: "mapping" | "description"
      changePct: number
      changeAmount: number
    }
  | {
      kind: "unit_changed"
      storedUnitPrice: number
      invoiceUnit: string
      storedUnit: string
      suggestedConversion: number | null
    }

// Unit synonym groups. All comparisons normalise to the group key.
const UNIT_SYNONYMS: Record<string, string> = {
  // weight
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gm: "g", gms: "g", gr: "g", gram: "g", grams: "g",
  // volume
  l: "l", lt: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  ml: "ml", milliliter: "ml", millilitre: "ml",
  // count / pack
  ea: "ea", each: "ea", pc: "ea", pcs: "ea", piece: "ea", pieces: "ea", unit: "ea", units: "ea",
  ctn: "carton", carton: "carton", cartons: "carton",
  case: "case", cases: "case",
  pack: "pack", packs: "pack", pk: "pack", pkt: "pack", packet: "pack",
  bag: "bag", bags: "bag", sack: "bag",
  drum: "drum", drums: "drum",
  can: "can", cans: "can", tin: "can", tins: "can",
  bottle: "bottle", bottles: "bottle", btl: "bottle",
  jar: "jar", jars: "jar",
  box: "box", boxes: "box",
  punnet: "punnet", punnets: "punnet", pnt: "punnet", pun: "punnet",
  bunch: "bunch", bunches: "bunch", bun: "bunch", bch: "bunch",
  tray: "tray", trays: "tray",
}

export function normaliseUnit(u: string | null | undefined): string {
  if (!u) return ""
  const k = u.trim().toLowerCase().replace(/\.$/, "")
  return UNIT_SYNONYMS[k] ?? k
}

// Same group → directly comparable without a factor.
export function unitsAreCompatible(a: string | null, b: string | null): boolean {
  const na = normaliseUnit(a)
  const nb = normaliseUnit(b)
  if (!na || !nb) return false
  return na === nb
}

// Parse a pack size out of an invoice description.
// Examples handled:
//   "Kale Purple Carton 5kg"            → { qty: 5,    unit: "kg" }
//   "Coconut Milk 12x400ml CTN"         → { qty: 4800, unit: "ml" } (12 × 400)
//   "Mozzarella Shredded 2kg case"      → { qty: 2,    unit: "kg" }
//   "Olive Oil 4 x 4L"                  → { qty: 16,   unit: "l"  }
//   "Eggs Free Range 15dz"              → { qty: 180,  unit: "ea" } (1dz = 12ea)
const PACK_REGEX =
  /(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?(kgs?|kilos?|kilograms?|grams?|grms?|gms?|gr|g|ml|millilitres?|milliliters?|litres?|liters?|ltrs?|lt|l|ea|each|pcs?|pieces?|dz|dozen)\b/i

// Reversed multiplier form: "1L x 6", "400ml x 12" (unit before the count).
// Tried FIRST — the forward regex would otherwise match just the "1L" and
// drop the ×6.
const PACK_REGEX_REVERSED =
  /(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|grms?|gms?|gr|g|ml|millilitres?|milliliters?|litres?|liters?|ltrs?|lt|l|ea|each|pcs?|pieces?|dz|dozen)\s*x\s*(\d+(?:\.\d+)?)\b/i

export interface ParsedPackSize {
  /** Total quantity in canonical unit (e.g. kg/L/ea). */
  qty: number
  /** Canonical unit: "kg" | "l" | "ea". */
  unit: "kg" | "l" | "ea"
}

// Multipack count without a unit on the count: "12PK : 500ML", "6pk 375ml".
// Neither base regex catches these — "PK" isn't a measure unit, so the size
// alone matched and a 12×500ml case normalised as if it held one 500ml can.
const PACK_REGEX_MULTIPACK =
  /(\d+)\s*(?:pk|pack)\b[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(kgs?|grams?|gms?|gr|g|ml|litres?|liters?|ltrs?|lt|l)\b/i

export function parsePackSize(rawDescription: string): ParsedPackSize | null {
  // Strip bracketed size-grades before parsing: "Slipper Bug Meat Raw
  // [10-50g] 1kg" grades the PIECES at 10-50 g — parsing "50g" as the pack
  // size made a 1 kg bag normalise 20x too high.
  const description = rawDescription.replace(/\[[^\]]*\]/g, " ")
  let a: number
  let b: number | null
  let raw: string
  const multi = description.match(PACK_REGEX_MULTIPACK)
  if (multi) {
    a = parseFloat(multi[1])
    b = parseFloat(multi[2])
    raw = multi[3].toLowerCase()
    const qty = a * b
    if (/^(kg)/.test(raw)) return { qty, unit: "kg" }
    if (/^(g|gr|gm|gram)/.test(raw)) return { qty: qty / 1000, unit: "kg" }
    if (/^(ml)/.test(raw)) return { qty: qty / 1000, unit: "l" }
    return { qty, unit: "l" }
  }
  const rev = description.match(PACK_REGEX_REVERSED)
  if (rev) {
    a = parseFloat(rev[1])
    raw = rev[2].toLowerCase()
    b = parseFloat(rev[3])
  } else {
    const m = description.match(PACK_REGEX)
    if (!m) return null
    a = parseFloat(m[1])
    b = m[2] ? parseFloat(m[2]) : null
    raw = m[3].toLowerCase()
  }
  const qty = b !== null ? a * b : a

  if (/^(kg|kilo|kilogram)/.test(raw)) return { qty, unit: "kg" }
  if (/^(g|gr|gram)/.test(raw)) return { qty: qty / 1000, unit: "kg" }
  if (/^(ml|milli)/.test(raw)) return { qty: qty / 1000, unit: "l" }
  if (/^(l|lt|ltr|litre|liter)/.test(raw)) return { qty, unit: "l" }
  if (/^(ea|each|pc|piece)/.test(raw)) return { qty, unit: "ea" }
  if (/^(dz|dozen)/.test(raw)) return { qty: qty * 12, unit: "ea" }
  return null
}

/**
 * Given a parsed pack size from the invoice description plus the
 * ingredient's purchase unit, work out how many of the ingredient's
 * purchase units are contained in one of the invoice's units.
 *
 * Returns a multiplier such that:
 *   storedEquivalentPrice = invoiceUnitPrice × multiplier
 *
 * e.g. ingredient stored as 5kg / "carton", invoice line per "kg":
 *      pack.qty = 5, pack.unit = "kg", storedUnit = "carton"
 *      → multiplier = 5 (5 kg per carton, so $/carton = $/kg × 5)
 *
 * Returns null if we can't reason about it (e.g. invoice line per "ea"
 * but ingredient stored in kg with no gramsPerUnit).
 */
export function inferConversionFromPack(
  pack: ParsedPackSize,
  storedUnit: string,
  // Kept for call-site compatibility; the correct factor doesn't depend on
  // the ingredient's purchaseQuantity (storedUnitPrice already divides by it).
  _storedQuantity: number
): number | null {
  const stored = normaliseUnit(storedUnit)

  // The invoice line is priced per PACK (unit didn't match the stored unit,
  // e.g. "bag"/"CTN"/"PKT") and the description tells us how much the pack
  // holds. Price per stored unit = pack price ÷ (pack contents expressed in
  // stored units), so the multiplier is 1 / contents-in-stored-units.
  //
  // The previous formula multiplied by contents and divided by
  // purchaseQuantity — "SUGAR Brown 15kg bag $35.90" against sugar stored
  // per-kg came out as $35.90/kg (+1237%) instead of $2.39/kg (−11%). That
  // one inversion produced most of the bogus >200% price alerts.
  if (pack.unit === "kg" && stored === "kg") return 1 / pack.qty
  if (pack.unit === "kg" && stored === "g") return 1 / (pack.qty * 1000)
  if (pack.unit === "l" && stored === "l") return 1 / pack.qty
  if (pack.unit === "l" && stored === "ml") return 1 / (pack.qty * 1000)
  if (pack.unit === "ea" && stored === "ea") return 1 / pack.qty

  // Ingredient stored as a pack-unit (carton, case, bag) with a fixed
  // purchaseQuantity — interpret purchaseQuantity as "1 carton contains
  // <purchaseQuantity> base units".  We can't trust the pack-unit alone
  // without a base measure; needs explicit conversion.
  return null
}

// Metric scaling between weight units (kg↔g) and volume units (l↔ml).
// `unitsAreCompatible` treats kg and g as different groups, so a per-kg
// invoice line against a per-g ingredient previously fell through to
// pack-parsing (or a unit-changed flag) instead of a simple ×1/1000.
// Returns the multiplier converting an invoice per-unit price into the
// stored per-unit price, or null when the units aren't both metric
// siblings of the same family.
const METRIC_BASE: Record<string, { family: "mass" | "vol"; toBase: number }> = {
  kg: { family: "mass", toBase: 1000 },
  g: { family: "mass", toBase: 1 },
  l: { family: "vol", toBase: 1000 },
  ml: { family: "vol", toBase: 1 },
}

export function metricConversionFactor(
  invoiceUnit: string | null,
  storedUnit: string
): number | null {
  const inv = METRIC_BASE[normaliseUnit(invoiceUnit)]
  const sto = METRIC_BASE[normaliseUnit(storedUnit)]
  if (!inv || !sto || inv.family !== sto.family) return null
  // $ per invoice-unit → $ per stored-unit: scale by size ratio.
  return sto.toBase / inv.toBase
}

export function compareUnits(
  ingredient: IngredientUnitInfo,
  line: InvoiceLineUnitInfo,
  mappingConversion: number | null,
  // Unit the mapping's factor was confirmed against. Suppliers reuse one
  // description across pack formats (Bidfood "BUTTER SALTED" ships as a
  // 500g PAT and a 5kg BLK) — a factor learned on one format is garbage on
  // the other, so when we know the mapping's unit, the factor only applies
  // to lines billed in that unit. Null (legacy mappings) keeps old behaviour.
  mappingInvoiceUnit?: string | null
): CompareResult {
  const invoiceUnitPrice = line.unitPrice ?? 0
  if (!Number.isFinite(invoiceUnitPrice) || invoiceUnitPrice <= 0) {
    return { kind: "skip", reason: "zero_price" }
  }
  if (!Number.isFinite(ingredient.purchasePrice) || ingredient.purchasePrice <= 0) {
    return { kind: "skip", reason: "missing_data" }
  }
  if (!Number.isFinite(ingredient.purchaseQuantity) || ingredient.purchaseQuantity <= 0) {
    return { kind: "skip", reason: "missing_data" }
  }

  const storedUnitPrice = ingredient.purchasePrice / ingredient.purchaseQuantity

  // 0. A unit-scoped mapping outranks even a same-unit label match. Some
  // suppliers bill cartons as "ea" (Eustralis: "Bridor Croissant 70g, 2 ea
  // @ $65.15" = two 60-packs) — the label agrees with the stored unit but
  // lies about the quantity, and only chef-confirmed knowledge can say so.
  // Requires BOTH a factor and a matching invoiceUnit so a legacy unscoped
  // factor can't hijack genuine like-for-like lines.
  if (
    mappingConversion &&
    Number.isFinite(mappingConversion) &&
    mappingConversion > 0 &&
    mappingInvoiceUnit &&
    line.unit &&
    normaliseUnit(mappingInvoiceUnit) === normaliseUnit(line.unit)
  ) {
    const invoiceInStored = invoiceUnitPrice * mappingConversion
    const changeAmount = invoiceInStored - storedUnitPrice
    const changePct = (changeAmount / storedUnitPrice) * 100
    return {
      kind: "converted",
      storedUnitPrice,
      invoiceUnitPriceInStoredUnits: invoiceInStored,
      conversionFactor: mappingConversion,
      conversionSource: "mapping",
      changePct,
      changeAmount,
    }
  }

  // 1. Same unit → direct compare.
  if (unitsAreCompatible(line.unit, ingredient.purchaseUnit)) {
    const changeAmount = invoiceUnitPrice - storedUnitPrice
    const changePct = (changeAmount / storedUnitPrice) * 100
    return {
      kind: "same_unit",
      storedUnitPrice,
      invoiceUnitPrice,
      changePct,
      changeAmount,
    }
  }

  // 2. Mapping has a stored conversion factor → apply it. Chef-confirmed
  // knowledge outranks unit-label heuristics (a mapping can encode "this
  // 'L'-labelled line is really priced per 5L bottle").
  const mappingUnitMatches =
    !mappingInvoiceUnit ||
    !line.unit ||
    normaliseUnit(mappingInvoiceUnit) === normaliseUnit(line.unit)
  if (mappingUnitMatches && mappingConversion && Number.isFinite(mappingConversion) && mappingConversion > 0) {
    const invoiceInStored = invoiceUnitPrice * mappingConversion
    const changeAmount = invoiceInStored - storedUnitPrice
    const changePct = (changeAmount / storedUnitPrice) * 100
    return {
      kind: "converted",
      storedUnitPrice,
      invoiceUnitPriceInStoredUnits: invoiceInStored,
      conversionFactor: mappingConversion,
      conversionSource: "mapping",
      changePct,
      changeAmount,
    }
  }

  // 2.5. Metric siblings (kg↔g, l↔ml) → deterministic scale factor.
  const metricFactor = metricConversionFactor(line.unit, ingredient.purchaseUnit)
  if (metricFactor !== null) {
    const invoiceInStored = invoiceUnitPrice * metricFactor
    const changeAmount = invoiceInStored - storedUnitPrice
    const changePct = (changeAmount / storedUnitPrice) * 100
    return {
      kind: "converted",
      storedUnitPrice,
      invoiceUnitPriceInStoredUnits: invoiceInStored,
      conversionFactor: metricFactor,
      conversionSource: "description",
      changePct,
      changeAmount,
    }
  }

  // 3. Try to parse pack size from description.
  const pack = parsePackSize(line.description)
  if (pack) {
    const inferred = inferConversionFromPack(pack, ingredient.purchaseUnit, ingredient.purchaseQuantity)
    if (inferred && inferred > 0) {
      const invoiceInStored = invoiceUnitPrice * inferred
      const changeAmount = invoiceInStored - storedUnitPrice
      const changePct = (changeAmount / storedUnitPrice) * 100
      return {
        kind: "converted",
        storedUnitPrice,
        invoiceUnitPriceInStoredUnits: invoiceInStored,
        conversionFactor: inferred,
        conversionSource: "description",
        changePct,
        changeAmount,
      }
    }
  }

  // 4. Unit changed, no usable conversion. Hand to user.
  return {
    kind: "unit_changed",
    storedUnitPrice,
    invoiceUnit: line.unit ?? "",
    storedUnit: ingredient.purchaseUnit,
    suggestedConversion: null,
  }
}

/**
 * What to write to the `InvoiceLineItem` after running the comparison.
 * Same-unit and converted results are real, applicable price changes.
 * Unit-changed results park in a separate bucket awaiting confirmation —
 * `priceChanged=false, unitChanged=true` — so they don't get auto-applied.
 */
export interface PriceEvaluation {
  priceChanged: boolean
  unitChanged: boolean
  currentPrice: number | null
  suggestedConversionFactor: number | null
  /** Invoice line's price expressed in the ingredient's purchase-unit base
   * (per g / ml / ea). Null when comparison was "skip" or "unit_changed".
   * For "same_unit" this is just `line.unitPrice`; for "converted" it's
   * `line.unitPrice × conversionFactor`. Always directly comparable to
   * `currentPrice`. */
  normalisedUnitPrice: number | null
}

export function evaluatePriceChange(
  ingredient: IngredientUnitInfo,
  line: InvoiceLineUnitInfo,
  mappingConversion: number | null,
  mappingInvoiceUnit?: string | null
): PriceEvaluation {
  const result = compareUnits(ingredient, line, mappingConversion, mappingInvoiceUnit)

  if (result.kind === "skip") {
    return {
      priceChanged: false,
      unitChanged: false,
      currentPrice: null,
      suggestedConversionFactor: null,
      normalisedUnitPrice: null,
    }
  }

  if (result.kind === "same_unit") {
    // Percentage-led threshold: the old flat ">= 1 cent" rule both let
    // cent-level flapping through on per-kg lines AND suppressed every
    // alert on per-g/per-ml ingredients (where a whole cent is a 100%
    // move). ≥1% with a tiny absolute epsilon handles both scales.
    const changed =
      Math.abs(result.changePct) >= 1 && Math.abs(result.changeAmount) >= 0.0001
    return {
      priceChanged: changed,
      unitChanged: false,
      currentPrice: changed ? result.storedUnitPrice : null,
      suggestedConversionFactor: null,
      // For same-unit comparisons the invoice price IS already in stored units.
      normalisedUnitPrice: result.invoiceUnitPrice,
    }
  }

  if (result.kind === "converted") {
    const changed =
      Math.abs(result.changePct) >= 1 && Math.abs(result.changeAmount) >= 0.0001
    return {
      priceChanged: changed,
      unitChanged: false,
      currentPrice: changed ? result.storedUnitPrice : null,
      suggestedConversionFactor:
        result.conversionSource === "description" ? result.conversionFactor : null,
      // Crucially: the invoice price after applying the unit conversion. This
      // is what every downstream comparison must use to avoid case-vs-gram
      // bogus percentages on the Friday digest etc.
      normalisedUnitPrice: result.invoiceUnitPriceInStoredUnits,
    }
  }

  // unit_changed — try one more time to pre-fill a suggestion from pack-size
  // parsing even if inferConversionFromPack couldn't satisfy it (e.g. pack
  // unit is "kg" but stored is "carton" with no base unit — leave for user).
  const pack = parsePackSize(line.description)
  const suggested = pack
    ? inferConversionFromPack(pack, ingredient.purchaseUnit, ingredient.purchaseQuantity)
    : null

  return {
    priceChanged: false,
    unitChanged: true,
    currentPrice: result.storedUnitPrice,
    suggestedConversionFactor: suggested ?? null,
    normalisedUnitPrice: null,
  }
}

/**
 * Translate an in-stored-units invoice price back to a full
 * `purchasePrice` (the value to write to `Ingredient.purchasePrice`).
 *
 * Same-unit case: invoice's per-unit × purchaseQuantity (original behaviour).
 * Converted case:  invoice's per-unit × conversionFactor × purchaseQuantity
 *                  i.e. the storedUnitPrice equivalent × purchaseQuantity.
 *
 * Throws if the comparison wasn't applicable — callers should never reach
 * here for unit_changed or skip results.
 */
export function newPurchasePriceFromComparison(
  result: CompareResult,
  purchaseQuantity: number
): number {
  if (result.kind === "same_unit") {
    return result.invoiceUnitPrice * purchaseQuantity
  }
  if (result.kind === "converted") {
    return result.invoiceUnitPriceInStoredUnits * purchaseQuantity
  }
  throw new Error(
    `Cannot derive purchase price from comparison of kind=${result.kind}`
  )
}
