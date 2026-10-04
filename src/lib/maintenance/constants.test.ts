import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ASSET_CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SYMPTOMS,
  CATEGORY_SPECIALTIES,
  warrantyEndDate,
  warrantyMonthsLeft,
  classifyIssue,
  ISSUE_CLASSES,
} from "./constants"

test("every category has a label, symptoms and trade specialties", () => {
  for (const c of ASSET_CATEGORIES) {
    assert.ok(CATEGORY_LABEL[c].length > 0, c)
    assert.ok(Array.isArray(CATEGORY_SYMPTOMS[c]), c)
    assert.ok(CATEGORY_SPECIALTIES[c].includes("general"), `${c} falls back to a general trade`)
  }
})

test("symptom keys are unique within a category and every symptom has quick fixes", () => {
  for (const c of ASSET_CATEGORIES) {
    const keys = CATEGORY_SYMPTOMS[c].map((s) => s.key)
    assert.equal(new Set(keys).size, keys.length, c)
    for (const s of CATEGORY_SYMPTOMS[c]) assert.ok(s.quickFixes.length > 0, `${c}/${s.key}`)
  }
})

test("power symptoms for ovens, fridges, freezers and fryers include the extension-lead step", () => {
  const extensionLead = /different power point\/circuit.*approved extension lead/i
  const find = (category: (typeof ASSET_CATEGORIES)[number], key: string) => {
    const s = CATEGORY_SYMPTOMS[category].find((x) => x.key === key)
    assert.ok(s, `${category}/${key} symptom exists`)
    return s
  }
  for (const [category, key] of [
    ["oven", "power"],
    ["refrigeration", "not-turning-on"],
    ["freezer", "not-turning-on"],
    ["fryer", "power"],
  ] as const) {
    const s = find(category, key)
    assert.ok(
      s.quickFixes.some((f) => extensionLead.test(f)),
      `${category}/${key} should suggest a different power point with an approved extension lead`,
    )
    // The step is a last resort after the switchboard and plug checks.
    assert.ok(extensionLead.test(s.quickFixes[s.quickFixes.length - 1]), `${category}/${key} lists it last`)
  }
  // The new fryer symptom should classify as a power fault for repeat-fault detection.
  assert.equal(classifyIssue(find("fryer", "power").label)?.key, "power")
})

test("warrantyEndDate adds whole months to the purchase date", () => {
  const end = warrantyEndDate({ purchaseDate: new Date(2025, 2, 15, 12), warrantyMonths: 12 })
  assert.equal(end?.getFullYear(), 2026)
  assert.equal(end?.getMonth(), 2)
  assert.equal(end?.getDate(), 15)
  const two = warrantyEndDate({ purchaseDate: new Date(2024, 10, 5, 12), warrantyMonths: 24 })
  assert.equal(two?.getFullYear(), 2026)
  assert.equal(two?.getMonth(), 10)
})

test("warrantyEndDate is null without a purchase date or a warranty, and 0 months means none", () => {
  assert.equal(warrantyEndDate({ purchaseDate: null, warrantyMonths: 12 }), null)
  assert.equal(warrantyEndDate({ purchaseDate: new Date(), warrantyMonths: null }), null)
  assert.equal(warrantyEndDate({ purchaseDate: new Date(), warrantyMonths: 0 }), null)
})

test("warrantyEndDate does not mutate the asset's purchase date", () => {
  const purchaseDate = new Date(2025, 0, 10, 12)
  const before = purchaseDate.getTime()
  warrantyEndDate({ purchaseDate, warrantyMonths: 6 })
  assert.equal(purchaseDate.getTime(), before)
})

test("month-end purchase clamps to the end of the target month", () => {
  const end = warrantyEndDate({ purchaseDate: new Date(2025, 7, 31, 12), warrantyMonths: 6 })
  assert.equal(end?.getMonth(), 1, "should still be February")
  assert.equal(end?.getDate(), 28)
  const plain = warrantyEndDate({ purchaseDate: new Date(2025, 0, 15, 12), warrantyMonths: 12 })
  assert.equal(plain?.toISOString().slice(0, 10), "2026-01-15")
})

test("warrantyMonthsLeft counts remaining whole months, 0 once expired", () => {
  const now = Date.now()
  const tenMonthsAgo = new Date(now - 10 * 30.44 * 86_400_000)
  const left = warrantyMonthsLeft({ purchaseDate: tenMonthsAgo, warrantyMonths: 24 })
  assert.ok(left != null && left >= 13 && left <= 15, `expected ~14, got ${left}`)
  const expired = warrantyMonthsLeft({ purchaseDate: new Date(2015, 0, 1), warrantyMonths: 12 })
  assert.equal(expired, 0)
  assert.equal(warrantyMonthsLeft({ purchaseDate: null, warrantyMonths: 12 }), null)
  assert.equal(warrantyMonthsLeft({ purchaseDate: new Date(), warrantyMonths: null }), null)
})

test("classifyIssue: first matching class wins, gas safety on top", () => {
  assert.equal(classifyIssue("Can smell gas near the fryer")?.key, "gas-safety")
  assert.equal(classifyIssue("Water leaking from under the Meiko, won't drain")?.key, "leak")
  assert.equal(classifyIssue("Dishwasher not draining")?.key, "drain")
  assert.equal(classifyIssue("Error code 202 on the Hobart")?.key, "fill")
  assert.equal(classifyIssue("Pilot won't stay lit")?.key, "ignition")
  assert.equal(classifyIssue("Display fridge freezing the lettuce")?.key, "cooling")
  assert.equal(classifyIssue("Not cooling, fan not spinning")?.key, "cooling", "cooling ranks above mechanical")
  assert.equal(classifyIssue("Not heating on the rinse cycle")?.key, "heating", "heating ranks above cycle")
  assert.equal(classifyIssue("Dead screen, won't turn on")?.key, "power")
  assert.equal(classifyIssue("Timer stuck mid cycle")?.key, "cycle")
  assert.equal(classifyIssue("Very noisy motor on the Robot Coupe")?.key, "mechanical")
})

test("classifyIssue is case-insensitive and returns null for unclassified text", () => {
  assert.equal(classifyIssue("LEAKING")?.key, "leak")
  assert.equal(classifyIssue("Door handle snapped off"), null)
  assert.equal(classifyIssue(""), null)
})

test("issue class keys are unique and each has a label", () => {
  const keys = ISSUE_CLASSES.map((c) => c.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const c of ISSUE_CLASSES) assert.ok(c.label.length > 0)
})
