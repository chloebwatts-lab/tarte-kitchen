import { test } from "node:test"
import assert from "node:assert/strict"
import { rankRows, bestReplacement, productTokens, netPrice, matchesQuery, type FormRow } from "./preferred-supplier"

function row(p: Partial<FormRow> & { id: string; supplier: string; name: string; packPrice: number }): FormRow {
  return { packSize: null, unitPrice: null, unit: "kg", category: null, notes: null, active: true, ...p }
}

const evoo4 = row({ id: "a", supplier: "Bidfood", name: "Oil Olive Extra Virgin 4L (Sandhurst)", packSize: "4 L", packPrice: 50.79, unitPrice: 12.6975, unit: "L" })
const evoo10 = row({ id: "b", supplier: "Bidfood", name: "Oil Olive Extra Virgin (Sandhurst)", packSize: "10 L", packPrice: 150.47, unitPrice: 15.047, unit: "L", active: false })
const caster25 = row({ id: "c", supplier: "Bidfood", name: "Sugar Caster (Bundaberg) — 25 kg", packSize: "25 kg", packPrice: 40.9, unitPrice: 1.636 })
const caster15 = row({ id: "d", supplier: "Bidfood", name: "Sugar Caster (Bundaberg) — 15 kg", packSize: "15 kg", packPrice: 27.9, unitPrice: 1.86, active: false })
const casterFermex = row({ id: "e", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 45, unitPrice: 1.8, active: false })
const butterUsa = row({ id: "f", supplier: "Fermex", name: "Butter Unsalted USA 25kg (Fermex)", packSize: "25 kg", packPrice: 280, unitPrice: 11.2 })
const peanut = row({ id: "g", supplier: "Fermex", name: "Peanut Butter Smooth 2kg", packSize: "2 kg", packPrice: 34.5, unitPrice: 17.25, active: false })

test("net price applies the Bidfood rebate and nothing else", () => {
  assert.equal(netPrice(100, 4), 96)
  assert.equal(netPrice(100, 0), 100)
  const [r] = rankRows([evoo4])
  assert.equal(r.rebatePct, 4)
  assert.equal(r.netPackPrice, netPrice(50.79, 4))
  const [f] = rankRows([butterUsa])
  assert.equal(f.rebatePct, 0)
  assert.equal(f.netPackPrice, 280)
})

test("product tokens drop brands, pack numbers and filler", () => {
  assert.deepEqual([...productTokens("Oil Olive Extra Virgin 4L (Sandhurst)")].sort(), ["extra", "oil", "olive", "virgin"])
  assert.deepEqual([...productTokens("Sugar Caster (Bundaberg) — 25 kg")].sort(), ["caster", "sugar"])
})

test("an avoided row points at the active row of the same product and says how much dearer", () => {
  const ranked = rankRows([evoo10, evoo4])
  assert.equal(ranked[0].id, "a")
  assert.equal(ranked[0].role, "order")
  const avoid = ranked[1]
  assert.equal(avoid.role, "avoid")
  assert.equal(avoid.useInstead?.id, "a")
  // 15.047 vs 12.6975, both net of the same 4% rebate: +18.5%
  assert.equal(avoid.vsPreferredPct, 18.5)
})

test("a dearer supplier's identical pack pairs across suppliers, net of rebate", () => {
  const ranked = rankRows([casterFermex, caster15, caster25])
  const fermex = ranked.find((r) => r.id === "e")!
  assert.equal(fermex.useInstead?.id, "c")
  // Fermex $1.80 gross, no rebate; Bidfood $1.636 x 0.96 = 1.5706 → +14.6%
  assert.equal(fermex.vsPreferredPct, 14.6)
  const small = ranked.find((r) => r.id === "d")!
  assert.equal(small.useInstead?.id, "c")
  assert.equal(small.vsPreferredPct, 13.7)
})

test("peanut butter never pairs with butter on the one shared word", () => {
  assert.equal(bestReplacement(peanut, [butterUsa]), null)
  const [, p] = rankRows([butterUsa, peanut])
  assert.equal(p.useInstead, null)
  assert.equal(p.vsPreferredPct, null)
})

test("different units never compare", () => {
  const perEach = row({ id: "h", supplier: "Bidfood", name: "Oil Olive Extra Virgin (Sandhurst)", packPrice: 10, unitPrice: 10, unit: "unit", active: false })
  assert.equal(bestReplacement(perEach, [evoo4]), null)
})

test("order rows come first, cheapest per unit within a unit", () => {
  const dear = row({ id: "i", supplier: "Fermex", name: "Caster Sugar Organic", packPrice: 60, unitPrice: 2.4 })
  const ranked = rankRows([caster15, dear, caster25])
  assert.deepEqual(ranked.map((r) => r.id), ["c", "i", "d"])
})

test("query words all have to appear, in any order", () => {
  assert.equal(matchesQuery("Cheese Mozzarella Shredded 2kg (Yardefarm)", "mozz shredded"), true)
  assert.equal(matchesQuery("Cheese Mozzarella Shredded 2kg (Yardefarm)", "shredded tasty"), false)
  assert.equal(matchesQuery("anything", "   "), false)
})

// Edge cases added by the pre-push test guard, 2 Oct 2026.

test("empty input is harmless everywhere", () => {
  assert.deepEqual(rankRows([]), [])
  assert.equal(productTokens("").size, 0)
  assert.equal(productTokens("(Sandhurst) 4 x 2.5 kg").size, 0)
  const brandOnly = row({ id: "z", supplier: "Bidfood", name: "(Sandhurst)", packPrice: 10, active: false })
  assert.equal(bestReplacement(brandOnly, [evoo4]), null)
  const [only] = rankRows([brandOnly])
  assert.equal(only.role, "avoid")
  assert.equal(only.useInstead, null)
  assert.equal(matchesQuery("Butter Salted (Anchor)", ""), false)
  assert.equal(matchesQuery("", "butter"), false)
})

test("a row with no unit price still pairs, but never claims a percentage", () => {
  const noPrice = row({ id: "n", supplier: "Bidfood", name: "Oil Olive Extra Virgin (Sandhurst)", packSize: "10 L", packPrice: 150.47, unitPrice: null, unit: "L", active: false })
  const ranked = rankRows([noPrice, evoo4])
  const avoid = ranked.find((r) => r.id === "n")!
  assert.equal(avoid.netUnitPrice, null)
  assert.equal(avoid.netPackPrice, netPrice(150.47, 4))
  assert.equal(avoid.useInstead?.id, "a")
  assert.equal(avoid.vsPreferredPct, null)
  // The other way round: the replacement has no unit price, so no percentage either.
  const activeNoPrice = row({ id: "m", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 45, unitPrice: null })
  const [, small] = rankRows([activeNoPrice, caster15])
  assert.equal(small.id, "d")
  assert.equal(small.useInstead?.id, "m")
  assert.equal(small.vsPreferredPct, null)
})

test("unpriced active rows sort after priced ones in the same unit", () => {
  const activeNoPrice = row({ id: "m", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 45, unitPrice: null })
  assert.deepEqual(rankRows([activeNoPrice, caster25]).map((r) => r.id), ["c", "m"])
  assert.deepEqual(rankRows([caster25, activeNoPrice]).map((r) => r.id), ["c", "m"])
})

test("unit text is compared case- and whitespace-insensitively", () => {
  const upper = row({ id: "u", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 45, unitPrice: 1.8, unit: "KG", active: false })
  const padded = row({ id: "p", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 45, unitPrice: 1.8, unit: " kg ", active: false })
  assert.equal(bestReplacement(upper, [caster25])?.id, "c")
  assert.equal(bestReplacement(padded, [caster25])?.id, "c")
  const ranked = rankRows([upper, caster25, padded])
  assert.equal(ranked.find((r) => r.id === "u")!.vsPreferredPct, 14.6)
  assert.equal(ranked.find((r) => r.id === "p")!.vsPreferredPct, 14.6)
  // Sorting treats "KG" and "kg" as the same unit: cheapest first, not alphabetical.
  const dearUpper = row({ id: "du", supplier: "Fermex", name: "Aaa Sugar Caster", packPrice: 60, unitPrice: 2.4, unit: "KG" })
  assert.deepEqual(rankRows([dearUpper, caster25]).map((r) => r.id), ["c", "du"])
  // A null unit only matches another null/blank unit.
  const noUnit = row({ id: "nu", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packPrice: 45, unitPrice: 1.8, unit: null, active: false })
  assert.equal(bestReplacement(noUnit, [caster25]), null)
  const blankUnitActive = row({ id: "bu", supplier: "Bidfood", name: "Sugar Caster (Bundaberg) — 25 kg", packPrice: 40.9, unitPrice: 1.636, unit: "" })
  assert.equal(bestReplacement(noUnit, [blankUnitActive])?.id, "bu")
})

test("an avoided row that is cheaper than its replacement reports a negative percentage", () => {
  // Fermex $1.50/kg, no rebate; Bidfood $1.636 x 0.96 = $1.5706/kg: Fermex is 4.5% cheaper.
  const cheapFermex = row({ id: "cf", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packSize: "25kg", packPrice: 37.5, unitPrice: 1.5, active: false })
  const ranked = rankRows([cheapFermex, caster25])
  assert.deepEqual(ranked.map((r) => r.role), ["order", "avoid"])
  const avoid = ranked[1]
  assert.equal(avoid.useInstead?.id, "c")
  assert.equal(avoid.vsPreferredPct, -4.5)
  // Gross-equal prices are not equal once the Bidfood rebate is applied.
  const grossEqual = row({ id: "ge", supplier: "Fermex", name: "Caster Sugar (Bundaberg)", packPrice: 40.9, unitPrice: 1.636, active: false })
  assert.equal(rankRows([grossEqual, caster25])[1].vsPreferredPct, 4.2)
})

test("among equally good active matches the cheapest net price is recommended", () => {
  const caster15Active = { ...caster15, active: true }
  const unpriced = row({ id: "np", supplier: "Bidfood", name: "Sugar Caster (Bundaberg) — 1 kg", packPrice: 3, unitPrice: null })
  assert.equal(bestReplacement(casterFermex, [unpriced, caster15Active, caster25])?.id, "c")
  assert.equal(bestReplacement(casterFermex, [caster25, caster15Active, unpriced])?.id, "c")
  // Fermex at $1.80 gross beats Bidfood at $1.86 gross only before the rebate (1.86 x 0.96 = 1.7856).
  const fermexActive = { ...casterFermex, active: true }
  assert.equal(bestReplacement(caster15, [fermexActive, caster25])?.id, "c")
  assert.equal(bestReplacement(row({ ...caster15, id: "x", unitPrice: 9 }), [fermexActive, caster15Active])?.id, "d")
})

test("zero and rebate arithmetic never divides by zero or drifts", () => {
  assert.equal(netPrice(0, 4), 0)
  assert.equal(netPrice(88.84, 4), 85.2864)
  assert.equal(netPrice(17.768, 4), 17.0573)
  const freeActive = row({ id: "fa", supplier: "Bidfood", name: "Sugar Caster (Bundaberg) — 25 kg", packPrice: 0, unitPrice: 0 })
  const [, avoid] = rankRows([freeActive, casterFermex])
  assert.equal(avoid.id, "e")
  assert.equal(avoid.useInstead?.id, "fa")
  assert.equal(avoid.vsPreferredPct, null)
  // Active rows never get a replacement, even when a cheaper active twin exists.
  const [first, second] = rankRows([caster25, { ...caster15, active: true }])
  assert.equal(first.useInstead, null)
  assert.equal(second.useInstead, null)
  assert.equal(second.vsPreferredPct, null)
})

test("plurals: frozen raspberries pair with Fermex raspberry, sunflower kernels never pair with pumpkin kernels", () => {
  const row = (id: string, supplier: string, name: string, unitPrice: number, active: boolean): FormRow => ({
    id, supplier, name, packSize: "1 kg", packPrice: unitPrice, unitPrice, unit: "kg", category: null, notes: null, active,
  })
  const bf = row("bf", "Bidfood", "Raspberries Iqf (Catchoice)", 17.68, false)
  const fx = row("fx", "Fermex", "Raspberry Frozen IQF 1kg", 13.6, true)
  assert.equal(bestReplacement(bf, [bf, fx])?.id, "fx")
  const sun = row("s", "Bidfood", "Seeds Sunflower Kernels (Catchoice)", 6.49, false)
  const pum = row("p", "Bidfood", "Seeds Pepitas Kernels Pumpkin (Catchoice)", 15.09, true)
  assert.equal(bestReplacement(sun, [sun, pum]), null)
})

test("plurals: -ss, -us and short words read the same on both sides, never a false pair", () => {
  const t = (s: string) => [...productTokens(s)].sort().join(" ")
  assert.equal(t("Glass Jar"), "glass jar", "-ss words stay whole")
  assert.equal(t("Cress Mustard"), t("CRESS MUSTARD"))
  assert.equal(t("Sea Bass Fillets"), t("Sea Bass Fillet"))
  assert.equal(t("Bus Tub Grey"), "bus grey", "3-letter words stay whole")
  assert.equal(t("Asparagus Green"), t("ASPARAGUS GREEN"), "-us cut the same way on both sides")
  assert.equal(t("Hummus Classic"), t("hummus classic"))
  assert.equal(t("Rice Arborio Bags"), "arborio rice", "pack words in the plural are stop words too")
  const row = (id: string, supplier: string, name: string, unitPrice: number, active: boolean, unit = "kg"): FormRow => ({
    id, supplier, name, packSize: null, packPrice: unitPrice, unitPrice, unit, category: null, notes: null, active,
  })
  const hum = row("h", "Bidfood", "Hummus Classic (Chris)", 12, false)
  assert.equal(bestReplacement(hum, [hum, row("h2", "Fermex", "Hummus Classic 2kg", 10, true)])?.id, "h2")
  assert.equal(bestReplacement(hum, [hum, row("a", "Fermex", "Asparagus Classic", 10, true)]), null)
  const bass = row("b", "Bidfood", "Sea Bass Fillets", 30, false)
  assert.equal(bestReplacement(bass, [bass, row("g", "Bidfood", "Glass Salt", 5, true)]), null, "no shared product word")
})
