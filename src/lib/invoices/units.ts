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
  punnet: "punnet", punnets: "punnet",
  bunch: "bunch", bunches: "bunch",
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
  /(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?(kgs?|kilos?|kilograms?|gms?|gr|grams?|ml|millilitres?|milliliters?|l|lt|ltrs?|litres?|liters?|ea|each|pcs?|pieces?|dz|dozen)\b/i

export interface ParsedPackSize {
  /** Total quantity in canonical unit (e.g. kg/L/ea). */
  qty: number
  /** Canonical unit: "kg" | "l" | "ea". */
  unit: "kg" | "l" | "ea"
}

export function parsePackSize(description: string): ParsedPackSize | null {
  const m = description.match(PACK_REGEX)
  if (!m) return null
  const a = parseFloat(m[1])
  const b = m[2] ? parseFloat(m[2]) : null
  const raw = m[3].toLowerCase()
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
  storedQuantity: number
): number | null {
  const stored = normaliseUnit(storedUnit)

  // Ingredient stored in the same canonical unit family as the pack.
  if (pack.unit === "kg" && stored === "kg") return pack.qty / storedQuantity
  if (pack.unit === "kg" && stored === "g") return (pack.qty * 1000) / storedQuantity
  if (pack.unit === "l" && stored === "l") return pack.qty / storedQuantity
  if (pack.unit === "l" && stored === "ml") return (pack.qty * 1000) / storedQuantity
  if (pack.unit === "ea" && stored === "ea") return pack.qty / storedQuantity

  // Ingredient stored as a pack-unit (carton, case, bag) with a fixed
  // purchaseQuantity — interpret purchaseQuantity as "1 carton contains
  // <purchaseQuantity> base units".  We can't trust the pack-unit alone
  // without a base measure; needs explicit conversion.
  return null
}

export function compareUnits(
  ingredient: IngredientUnitInfo,
  line: InvoiceLineUnitInfo,
  mappingConversion: number | null
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

  // 2. Mapping has a stored conversion factor → apply it.
  if (mappingConversion && Number.isFinite(mappingConversion) && mappingConversion > 0) {
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
  mappingConversion: number | null
): PriceEvaluation {
  const result = compareUnits(ingredient, line, mappingConversion)

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
    const changed = Math.abs(result.changeAmount) >= 0.01
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
    const changed = Math.abs(result.changeAmount) >= 0.01
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
