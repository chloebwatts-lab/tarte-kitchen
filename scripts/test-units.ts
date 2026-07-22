import { parsePackSize, compareUnits, evaluatePriceChange } from "../src/lib/invoices/units"
let fails = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
  else console.log(`ok   ${name}`)
}
// multipack "12PK : 500ML" → 6 L
eq("multipack colon", parsePackSize("REAL COCONUT CREAM 12PK : 500ML"), { qty: 6, unit: "l" })
// bracketed size grade stripped: [10-50g] is piece grading, 1kg is the pack
eq("bracket grade", parsePackSize("Slipper Bug Meat Raw [10-50g] 1kg"), { qty: 1, unit: "kg" })
eq("bracket grade 500g", parsePackSize("Slipper Bug Meat Raw [50g+] 500g"), { qty: 0.5, unit: "kg" })
// garam masala direction: 400g canister vs per-kg stored → per-kg = 11.21/0.4
{
  const r = compareUnits({ purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 24 }, { unit: "EA", unitPrice: 11.21, description: "GARAM MASALA CANISTER TRUMPS 400gr" }, null)
  eq("garam masala per-kg", r.kind === "converted" ? Math.round(r.invoiceUnitPriceInStoredUnits * 100) / 100 : r.kind, 28.03)
}
// unit-scoped mapping ignored on other unit: butter PAT factor on BLK line falls to description parse (5kg)
{
  const r = compareUnits({ purchaseUnit: "g", purchaseQuantity: 500, purchasePrice: 6.69 }, { unit: "BLK", unitPrice: 83.48, description: "BUTTER SALTED ANCHOR 5kg" }, 0.002, "PAT")
  eq("butter BLK bypasses PAT factor", r.kind === "converted" ? Math.round(r.invoiceUnitPriceInStoredUnits * 10000) / 10000 : r.kind, 0.0167)
}
// unit-scoped mapping WITH matching unit outranks lying same-unit label (croissant carton as "ea")
{
  const r = compareUnits({ purchaseUnit: "piece", purchaseQuantity: 60, purchasePrice: 65.92 }, { unit: "ea", unitPrice: 65.15, description: "Bridor Croissant Large 70g" }, 1 / 60, "EA")
  eq("croissant carton-as-ea", r.kind === "converted" ? Math.round(r.invoiceUnitPriceInStoredUnits * 10000) / 10000 : r.kind, 1.0858)
}
// legacy unscoped mapping still applies cross-unit (old behaviour preserved)
{
  const r = compareUnits({ purchaseUnit: "ml", purchaseQuantity: 1000, purchasePrice: 38.08 }, { unit: "BTL", unitPrice: 40, description: "Sauce Red Hot Original Buffalo Wings" }, 0.000265, null)
  eq("legacy unscoped mapping", r.kind === "converted" ? Math.round(r.invoiceUnitPriceInStoredUnits * 10000) / 10000 : r.kind, 0.0106)
}
// same-unit still direct when no mapping
{
  const r = compareUnits({ purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 5.88 }, { unit: "kg", unitPrice: 6.3, description: "CAPSICUM RED KG" }, null)
  eq("same-unit direct", r.kind, "same_unit")
}
// ── 2026-07-22 major-audit additions ─────────────────────────────────────
import { effectiveUnitPrice } from "../src/lib/invoices/units"
// triple multiplier: 4 trays x 6 cans x 250ml = 6 L
eq("triple multiplier", parsePackSize("SODA WATER 4 X 6 X 250ML"), { qty: 6, unit: "l" })
// size + container word + count: 1kg tub x 6 = 6 kg
eq("worded reversed", parsePackSize("YOGHURT GREEK 1kg tub x 6"), { qty: 6, unit: "kg" })
// existing forms still parse
eq("plain reversed", parsePackSize("Olive Oil 1L x 6"), { qty: 6, unit: "l" })
eq("forward multi", parsePackSize("MANGO CHUNKS IQF ENTYCE 4x2.5kg"), { qty: 10, unit: "kg" })
eq("inch marks safe", parsePackSize('TORTILLAS FLOUR 10" CATERERS C 12\'s'), null)
// effective unit price: Jensens per-line discount — paid price wins
eq("effective price discount", effectiveUnitPrice(5.95, 1, 5.35), 5.35)
// LLM lineTotal-as-unitPrice slip: 6 x $6.99 = $41.94, unitPrice wrongly 41.94
eq("effective price llm slip", Math.round((effectiveUnitPrice(41.94, 6, 41.94) ?? 0) * 100) / 100, 6.99)
// agreement within 5% → trust unitPrice
eq("effective price agree", effectiveUnitPrice(7.1, 2, 14.2), 7.1)
// credits / zero totals → keep raw
eq("effective price credit", effectiveUnitPrice(11.2, 12, -134.4), 11.2)
eq("effective price zero total", effectiveUnitPrice(6.95, 11, 0), 6.95)

process.exit(fails ? 1 : 0)
