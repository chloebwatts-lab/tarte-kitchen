// Pack resolution: how many base units (g / ml / ea) does ONE billed unit
// of this supplier product contain?
//
// This is the only place unit reasoning happens in the pricing rebuild. It
// runs once per supplier product (not once per invoice line), its answer is
// stored on the product, and a person can overwrite it with a plain number
// ("one carton holds 5000 g"). There are no reciprocals anywhere: the
// stored value is always "base units per billed unit".

import { parsePackSize } from "../invoices/units"
import { normaliseUnit } from "../invoices/units"
import type { IngredientPackInfo, ResolvedPack, BaseUnitType } from "./types"

/** Measure units that map straight onto a base unit type. */
const MEASURE_UNITS: Record<string, { type: BaseUnitType; toBase: number }> = {
  kg: { type: "WEIGHT", toBase: 1000 },
  g: { type: "WEIGHT", toBase: 1 },
  l: { type: "VOLUME", toBase: 1000 },
  ml: { type: "VOLUME", toBase: 1 },
  ea: { type: "COUNT", toBase: 1 },
  dozen: { type: "COUNT", toBase: 12 },
  dz: { type: "COUNT", toBase: 12 },
}

export function isMeasureUnit(unit: string | null | undefined): boolean {
  return !!unit && normaliseUnit(unit) in MEASURE_UNITS
}

/** Family of a parsed pack ("kg" | "l" | "ea") expressed as a BaseUnitType. */
function packFamily(unit: "kg" | "l" | "ea"): BaseUnitType {
  return unit === "kg" ? "WEIGHT" : unit === "l" ? "VOLUME" : "COUNT"
}

/** Parsed pack quantity expressed in base units (g / ml / ea). */
function packToBase(qty: number, unit: "kg" | "l" | "ea"): number {
  return unit === "ea" ? qty : qty * 1000
}

export const BASE_UNIT_LABEL: Record<BaseUnitType, "g" | "ml" | "ea"> = {
  WEIGHT: "g",
  VOLUME: "ml",
  COUNT: "ea",
}

function finitePositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/**
 * Resolve the pack for a (description, billed unit) pair against the
 * ingredient it maps to. Returns null when nothing trustworthy can be
 * derived; the caller then parks the product for a person to answer
 * "one <unit> holds how many <g|ml|ea>?".
 *
 * Order of trust:
 *   1. Billed unit is a measure in the ingredient's family (per-kg line on
 *      a WEIGHT ingredient). Exact, HIGH.
 *   2. Billed unit is a measure in a DIFFERENT family but the ingredient
 *      has gramsPerUnit (per-kg line on a COUNT ingredient). MEDIUM.
 *   3. Billed unit equals the ingredient's own purchase unit (both say
 *      "carton"). Pack = baseUnitsPerPurchase / purchaseQuantity. MEDIUM,
 *      because those two ingredient fields are maintained by hand.
 *   4. Description parses to a pack in the right family ("15kg bag" on a
 *      WEIGHT ingredient billed per BAG). LOW until a person confirms it.
 *   5. Description parses to a weight pack on a COUNT ingredient with
 *      gramsPerUnit. LOW.
 */
export function resolvePack(
  description: string,
  billedUnit: string | null,
  ing: IngredientPackInfo
): ResolvedPack | null {
  const unit = normaliseUnit(billedUnit)
  const measure = unit ? MEASURE_UNITS[unit] : undefined
  const parsed = parsePackSize(description)

  // 1 + 2. Measure units.
  if (measure) {
    if (measure.type === ing.baseUnitType) {
      // Trap: a pack billed with a measure label but priced per pack
      // ("SUGAR BROWN 15KG BAG", unit "KG", qty 1, $35.90). We cannot
      // know from the label alone, so when the description advertises a
      // pack in the same family that is not 1 unit, downgrade to LOW and
      // let the sanity gate decide. A true per-kg line whose description
      // happens to mention the bag size will pass the gate anyway.
      const advertised = parsed && packFamily(parsed.unit) === measure.type
        ? packToBase(parsed.qty, parsed.unit)
        : null
      if (advertised !== null && Math.abs(advertised - measure.toBase) > 1e-9) {
        return {
          packBaseUnits: measure.toBase,
          source: "MEASURE",
          confidence: "LOW",
          explanation: `Billed per ${unit} but description advertises a ${describeBase(advertised, ing.baseUnitType)} pack; treating as per ${unit} pending a sanity check`,
        }
      }
      return {
        packBaseUnits: measure.toBase,
        source: "MEASURE",
        confidence: "HIGH",
        explanation: `Billed per ${unit} = ${measure.toBase} ${BASE_UNIT_LABEL[ing.baseUnitType]}`,
      }
    }
    if (
      ing.baseUnitType === "COUNT" &&
      measure.type !== "COUNT" &&
      finitePositive(ing.gramsPerUnit)
    ) {
      const each = measure.toBase / ing.gramsPerUnit
      return {
        packBaseUnits: each,
        source: "MEASURE",
        confidence: "MEDIUM",
        explanation: `Billed per ${unit} on a count ingredient at ${ing.gramsPerUnit} g/ml each = ${round(each)} ea`,
      }
    }
    // Measure in the wrong family with no bridge (a 400 g canister billed
    // "EA" on a WEIGHT ingredient): fall through, the description may
    // still tell us the pack.
  }

  // 3. Same container word as the ingredient's own purchase unit.
  if (
    unit &&
    unit === normaliseUnit(ing.purchaseUnit) &&
    finitePositive(ing.baseUnitsPerPurchase) &&
    finitePositive(ing.purchaseQuantity)
  ) {
    const per = ing.baseUnitsPerPurchase / ing.purchaseQuantity
    return {
      packBaseUnits: per,
      source: "INGREDIENT",
      confidence: "MEDIUM",
      explanation: `Billed per ${unit}, same as the ingredient's purchase unit: ${round(per)} ${BASE_UNIT_LABEL[ing.baseUnitType]} per ${unit} from the ingredient record`,
    }
  }

  // 4 + 5. Parsed from the description.
  if (parsed) {
    const fam = packFamily(parsed.unit)
    if (fam === ing.baseUnitType) {
      const base = packToBase(parsed.qty, parsed.unit)
      return {
        packBaseUnits: base,
        source: "PARSED",
        confidence: "LOW",
        explanation: `Description reads as ${describeBase(base, ing.baseUnitType)} per ${unit || "unit"}; unconfirmed`,
      }
    }
    if (ing.baseUnitType === "COUNT" && fam !== "COUNT" && finitePositive(ing.gramsPerUnit)) {
      const each = packToBase(parsed.qty, parsed.unit) / ing.gramsPerUnit
      return {
        packBaseUnits: each,
        source: "PARSED",
        confidence: "LOW",
        explanation: `Description reads as ${describeBase(packToBase(parsed.qty, parsed.unit), fam)} at ${ing.gramsPerUnit} each = ${round(each)} ea per ${unit || "unit"}; unconfirmed`,
      }
    }
  }

  return null
}

/** "5000 g" -> "5 kg", "400 ml", "12 ea". Display only. */
export function describeBase(baseUnits: number, type: BaseUnitType): string {
  if (type === "COUNT") return `${round(baseUnits)} ea`
  const big = type === "WEIGHT" ? "kg" : "l"
  const small = type === "WEIGHT" ? "g" : "ml"
  if (baseUnits >= 1000 && Number.isInteger(round(baseUnits / 1000, 3) * 1000)) {
    return `${round(baseUnits / 1000, 3)} ${big}`
  }
  return `${round(baseUnits)} ${small}`
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * Stable identity for a supplier product. Supplier product codes are the
 * best key (Bidfood, Fermex, Provedores all print them, and they survive
 * description rewording). Without one, fall back to the normalised
 * description plus billed unit, so "BUTTER SALTED" as PAT and as BLK are
 * two products with two packs, never one product with a flip-flopping
 * factor.
 */
export function productKey(
  productCode: string | null | undefined,
  description: string,
  billedUnit: string | null | undefined
): string {
  const code = (productCode ?? "").trim()
  if (code) return `code:${code.toLowerCase()}`
  return `desc:${normaliseDescriptionKey(description)}|${normaliseUnit(billedUnit) || "-"}`
}

export function normaliseDescriptionKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}
