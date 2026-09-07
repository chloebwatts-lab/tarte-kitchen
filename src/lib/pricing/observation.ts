// Turn one invoice line + a resolved pack into a price observation in the
// single currency (dollars per base unit). Pure; no database.

import { effectiveUnitPrice } from "../invoices/units"
import type { BilledLine, DerivedObservation, PackConfidence } from "./types"

/**
 * Pack sanity band. An unconfirmed pack that is wrong is almost always
 * wrong by a whole multiple (x2, x6, x1000), so the implied price lands
 * far outside anything a real price move produces. A confirmed or
 * measure-derived pack is trusted and never gated, real moves of +115%
 * (vanilla) must surface, but a x59 (a 60-pack billed as one "ea") is
 * still caught.
 */
export const SANITY_BAND: Record<PackConfidence, number> = {
  HIGH: 4,      // only a x5 / /5 multiple is suspect (a carton billed "ea")
  MEDIUM: 1.5,  // suspect beyond +/-150%
  LOW: 0.6,     // suspect beyond +/-60%
}

export function deriveObservation(
  line: BilledLine,
  packBaseUnits: number | null,
  packConfidence: PackConfidence | null,
  /** Ingredient's current cost per base unit, if known and > 0. */
  referencePerBase: number | null
): DerivedObservation {
  const none = (reason: string): DerivedObservation => ({
    status: "EXCLUDED",
    billedUnitPrice: null,
    billedQty: line.quantity,
    packBaseUnits,
    pricePerBaseUnit: null,
    baseUnitsDelivered: null,
    reason,
  })

  if (line.isCreditNote) return none("credit note")
  if (packBaseUnits === null || !Number.isFinite(packBaseUnits) || packBaseUnits <= 0) {
    return none("no pack")
  }
  const paid = effectiveUnitPrice(line.unitPrice, line.quantity, line.lineTotal)
  if (paid === null || !Number.isFinite(paid) || paid <= 0) return none("zero or missing price")

  const perBase = paid / packBaseUnits
  const delivered =
    line.quantity !== null && Number.isFinite(line.quantity) && line.quantity > 0
      ? line.quantity * packBaseUnits
      : null

  let status: DerivedObservation["status"] = "VALID"
  let reason = "ok"
  const band = packConfidence ? SANITY_BAND[packConfidence] : SANITY_BAND.LOW
  if (referencePerBase !== null && referencePerBase > 0) {
    const ratio = perBase / referencePerBase
    if (ratio > 1 + band || ratio < 1 / (1 + band)) {
      status = "SUSPECT"
      reason = `implied ${fmt(perBase)}/base vs reference ${fmt(referencePerBase)}/base (${ratio.toFixed(2)}x) with an unconfirmed pack`
    }
  }

  return {
    status,
    billedUnitPrice: paid,
    billedQty: line.quantity,
    packBaseUnits,
    pricePerBaseUnit: perBase,
    baseUnitsDelivered: delivered,
    reason,
  }
}

function fmt(n: number): string {
  return n >= 1 ? n.toFixed(2) : n.toPrecision(3)
}
