import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEPT_BLURB,
  DEPT_COLOR,
  DEPT_LABEL,
  DEPT_SLUG,
  ORDER_DEPTS,
  defaultDeptForItem,
  deptForItem,
  deptFromSlug,
  isOrderDept,
} from "./departments"

// ----------------------------------------------------------- constants

test("the four ordering departments are Chloe's 2026-08-17 split, in card order", () => {
  assert.deepEqual([...ORDER_DEPTS], ["KITCHEN", "PASTRY", "COFFEE_BAR", "FRONT_OF_HOUSE"])
})

test("every department has a label, blurb, colour and slug", () => {
  for (const d of ORDER_DEPTS) {
    assert.ok(DEPT_LABEL[d].length > 0, d)
    assert.ok(DEPT_BLURB[d].length > 0, d)
    assert.ok(DEPT_COLOR[d].bg && DEPT_COLOR[d].fg, d)
    assert.match(DEPT_SLUG[d], /^[a-z-]+$/, d)
  }
  assert.equal(new Set(Object.values(DEPT_SLUG)).size, ORDER_DEPTS.length, "slugs unique")
})

// --------------------------------------------------------- isOrderDept

test("isOrderDept accepts only the four enum values", () => {
  for (const d of ORDER_DEPTS) assert.equal(isOrderDept(d), true, d)
  assert.equal(isOrderDept("kitchen"), false)
  assert.equal(isOrderDept("BAR"), false)
  assert.equal(isOrderDept(""), false)
  assert.equal(isOrderDept(null), false)
  assert.equal(isOrderDept(undefined), false)
})

// -------------------------------------------------------- deptFromSlug

test("slug round-trips for every department", () => {
  for (const d of ORDER_DEPTS) assert.equal(deptFromSlug(DEPT_SLUG[d]), d)
  assert.equal(deptFromSlug("coffee-bar"), "COFFEE_BAR")
  assert.equal(deptFromSlug("front-of-house"), "FRONT_OF_HOUSE")
})

test("unknown, enum-cased or empty slugs return null", () => {
  assert.equal(deptFromSlug("COFFEE_BAR"), null)
  assert.equal(deptFromSlug("Kitchen"), null)
  assert.equal(deptFromSlug("bar"), null)
  assert.equal(deptFromSlug(""), null)
})

// ------------------------------------------------ defaultDeptForItem

test("plain category mapping: kitchen categories", () => {
  for (const category of ["meat", "dairy", "pantry", "spices", "oils", "cleaning", "produce", "fruit & veg", "frozen"]) {
    assert.equal(defaultDeptForItem({ category, name: "Some Item" }), "KITCHEN", category)
  }
})

test("plain category mapping: pastry, coffee & bar, front of house", () => {
  assert.equal(defaultDeptForItem({ category: "pastry/baking", name: "Fermex Bakers Flour 12.5kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "baking", name: "Caster Sugar 25kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "nuts", name: "Flaked Almonds 1kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "chocolate", name: "Callebaut Dark 811 2.5kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "beverages", name: "Bundaberg Ginger Beer 24pk" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "coffee", name: "Espresso Blend 1kg" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "alcohol", name: "Prosecco DOC 750ml" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "packaging", name: "8oz Takeaway Cup x1000" }), "FRONT_OF_HOUSE")
  assert.equal(defaultDeptForItem({ category: "disposables", name: "Wooden Forks 1000" }), "FRONT_OF_HOUSE")
})

test("category is trimmed and lower-cased before lookup", () => {
  assert.equal(defaultDeptForItem({ category: "  Pastry/Baking ", name: "Flour" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "BEVERAGES", name: "Tonic" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "Frozen", name: "Frozen Peas 2kg" }), "KITCHEN")
})

test("unknown, empty or missing category defaults to Kitchen", () => {
  assert.equal(defaultDeptForItem({ category: "seafood", name: "Salmon Fillet" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "", name: "Mystery" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: null, name: null }), "KITCHEN")
  assert.equal(defaultDeptForItem({}), "KITCHEN")
})

test("frozen splits: savoury frozen is Kitchen, juice-bar frozen is Front of house", () => {
  assert.equal(defaultDeptForItem({ category: "frozen", name: "Frozen Peas 2kg" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "frozen", name: "Puff Pastry Sheets" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "frozen", name: "Hash Browns 2kg" }), "KITCHEN")
  for (const name of [
    "Vanilla Ice Cream 5L",
    "Icecream Vanilla Bean",
    "Gelato Pistachio 2L",
    "Lemon Sorbet 2L",
    "Acai Pulp 4x100g",
    "Açaí Sorbet",
    "Frozen Fruit Mix 1kg",
    "Frozen Berries 1kg",
    "Mixed Berry Pack",
    "Frozen Mango Cheeks 1kg",
    "Smoothie Pack Tropical",
    "Frozen Banana Chunks",
    "Dragon Fruit Pitaya Cubes",
    "Coconut Chunks 1kg",
  ]) {
    assert.equal(defaultDeptForItem({ category: "frozen", name }), "FRONT_OF_HOUSE", name)
  }
})

test("juice-bar words only split Frozen, not other categories", () => {
  // Fresh bananas are produce, ordered by the kitchen.
  assert.equal(defaultDeptForItem({ category: "produce", name: "Banana Cavendish 13kg" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "fruit & veg", name: "Blueberries 125g" }), "KITCHEN")
})

test("dairy splits: barista milk is Coffee & bar, cooking dairy is Kitchen", () => {
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Full Cream Milk 2L" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Barista Oat 1L" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Bonsoy 1L" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Almond Mylk Barista" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Anchor Butter 5kg" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Thickened Cream 5L" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Goat Feta 1kg" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Shredded Mozzarella 2kg" }), "KITCHEN")
})

test("cooking milks stay Kitchen even when the name says milk", () => {
  for (const name of ["Milk Powder 1kg", "Condensed Milk 395g", "Evaporated Milk", "Buttermilk 1L", "Coconut Milk 400ml", "Milk Solids 1kg"]) {
    assert.equal(defaultDeptForItem({ category: "dairy", name }), "KITCHEN", name)
    assert.equal(defaultDeptForItem({ category: "pantry", name }), "KITCHEN", name)
  }
})

test("alt milks filed under Pantry or Beverages still go to Coffee & bar", () => {
  assert.equal(defaultDeptForItem({ category: "pantry", name: "Oatly Barista Oat Milk 1L" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "beverages", name: "Bonsoy Soy 1L" }), "COFFEE_BAR")
  assert.equal(defaultDeptForItem({ category: "pantry", name: "Milklab Almond Milk 1L" }), "COFFEE_BAR")
})

test("bare alt-milk words do not send goods to the bar (Goat Feta / almond regression)", () => {
  assert.equal(defaultDeptForItem({ category: "dairy", name: "Goat Feta" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "nuts", name: "Almond Meal 1kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "pantry", name: "Soy Sauce 1.8L" }), "KITCHEN")
  assert.equal(defaultDeptForItem({ category: "pantry", name: "Rolled Oats 5kg" }), "KITCHEN")
})

test("milk as a substring does not trigger the bar rule (word boundary)", () => {
  assert.equal(defaultDeptForItem({ category: "pantry", name: "Milkshake Syrup" }), "KITCHEN")
})

// "milk" as a word in a pastry item name must not beat the category.
test("Milk Chocolate under Chocolate is Pastry, not Coffee & bar", () => {
  assert.equal(defaultDeptForItem({ category: "chocolate", name: "Callebaut Milk Chocolate 823 2.5kg" }), "PASTRY")
  assert.equal(defaultDeptForItem({ category: "baking", name: "Milk Arrowroot Biscuits" }), "PASTRY")
})

// --------------------------------------------------------- deptForItem

test("explicit admin dept assignment always wins over the inferred default", () => {
  assert.equal(deptForItem({ dept: "PASTRY", category: "dairy", name: "Full Cream Milk 2L" }), "PASTRY")
  assert.equal(deptForItem({ dept: "KITCHEN", category: "frozen", name: "Acai Pulp" }), "KITCHEN")
  assert.equal(deptForItem({ dept: "FRONT_OF_HOUSE", category: "meat", name: "Bacon 5kg" }), "FRONT_OF_HOUSE")
})

test("null or missing dept falls back to the category default", () => {
  assert.equal(deptForItem({ dept: null, category: "dairy", name: "Full Cream Milk 2L" }), "COFFEE_BAR")
  assert.equal(deptForItem({ category: "frozen", name: "Acai Pulp" }), "FRONT_OF_HOUSE")
  assert.equal(deptForItem({ dept: undefined, category: "chocolate", name: "Dark Callets" }), "PASTRY")
})
