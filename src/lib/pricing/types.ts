// Pricing rebuild: shared types.
//
// One currency everywhere: dollars per BASE unit of the ingredient
// (per gram, per millilitre, or per each). Recipe costing already works in
// this currency (`purchasePrice / baseUnitsPerPurchase`), so every invoice
// line is converted into it exactly once, at ingest, through a confirmed
// pack on a SupplierProduct. Nothing downstream ever multiplies or divides
// by a unit again.

import type { BaseUnitType } from "../units"

export type { BaseUnitType }

/** How we learned how many base units one billed unit holds. */
export type PackSource =
  | "MEASURE"    // billed unit is itself a measure (kg, g, l, ml, ea, dozen)
  | "INGREDIENT" // billed unit equals the ingredient's purchase unit; pack = baseUnitsPerPurchase / purchaseQuantity
  | "PARSED"     // pack size parsed out of the description ("15kg bag", "12 x 400ml")
  | "CONFIRMED"  // a person told us

export type PackConfidence = "HIGH" | "MEDIUM" | "LOW"

export interface ResolvedPack {
  /** Base units (g / ml / ea) contained in ONE billed unit. Always > 0. */
  packBaseUnits: number
  source: PackSource
  confidence: PackConfidence
  /** Human-readable reasoning, shown in the review UI and stored for audit. */
  explanation: string
}

export interface IngredientPackInfo {
  baseUnitType: BaseUnitType
  purchaseUnit: string
  purchaseQuantity: number
  baseUnitsPerPurchase: number
  /** grams (or ml) per single ea, for COUNT ingredients bought by weight. */
  gramsPerUnit: number | null
}

export interface BilledLine {
  description: string
  /** Unit label as printed on the invoice ("KG", "CTN", "BAG", "EA"...). */
  unit: string | null
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  isCreditNote: boolean
}

export type ObservationStatus =
  | "VALID"    // usable for alerts and cost updates
  | "SUSPECT"  // pack not confirmed and price implausible vs reference; needs a human
  | "EXCLUDED" // credit note, zero price, or no pack at all

export interface DerivedObservation {
  status: ObservationStatus
  /** Effective price paid per billed unit (line total wins over printed unit price). */
  billedUnitPrice: number | null
  billedQty: number | null
  packBaseUnits: number | null
  /** Dollars per base unit. Null unless status is VALID or SUSPECT. */
  pricePerBaseUnit: number | null
  /** Base units delivered on this line (qty x pack). Null when qty unknown. */
  baseUnitsDelivered: number | null
  reason: string
}

export type PriceStream = "PRODUCE" | "STABLE"

export interface ObservationPoint {
  observedAt: Date
  pricePerBaseUnit: number
  baseUnitsDelivered: number | null
}

export interface RecentDecision {
  /** Price per base unit the chef accepted or dismissed at. */
  pricePerBaseUnit: number
  resolvedBy: "CHEF" | "ENGINE"
}

export interface AlertEvaluation {
  kind: "PRICE_MOVE"
  stream: PriceStream
  currentPerBase: number
  priorPerBase: number
  priorMedianPerBase: number | null
  changePct: number
  weeklyImpactDollars: number | null
  latestObservedAt: Date
}

export type EvaluateOutcome =
  | { fire: true; alert: AlertEvaluation }
  | { fire: false; reason: string }
