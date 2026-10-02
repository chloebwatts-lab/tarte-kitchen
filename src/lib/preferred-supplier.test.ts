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
