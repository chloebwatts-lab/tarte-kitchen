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
process.exit(fails ? 1 : 0)
