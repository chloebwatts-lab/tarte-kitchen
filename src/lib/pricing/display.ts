// Display helpers: base-unit prices are tiny numbers ($0.00239 per g), so
// screens show them per kg / per L / per ea.
import type { BaseUnitType } from "./types"

export function displayUnit(type: BaseUnitType): "kg" | "L" | "ea" {
  return type === "WEIGHT" ? "kg" : type === "VOLUME" ? "L" : "ea"
}

export function perDisplayUnit(pricePerBase: number, type: BaseUnitType): number {
  return type === "COUNT" ? pricePerBase : pricePerBase * 1000
}

export function formatPerDisplayUnit(pricePerBase: number, type: BaseUnitType): string {
  const v = perDisplayUnit(pricePerBase, type)
  const dp = v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `$${v.toFixed(dp)}/${displayUnit(type)}`
}
