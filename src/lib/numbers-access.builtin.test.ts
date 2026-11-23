import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { NUMBERS_BUILT_IN, isNumbersPerson } from "./numbers-access"
import { isQuietPerson } from "./manager-quiet"
import { parseTierOverrides, tierWithOverrides } from "./access/tiers"
import { isBurleighSalesPerson } from "./sales/burleigh-sales-access"

/**
 * Oliver Warren built into the Wages + COGS grant (Chloe, 23 Nov 2026).
 * Pre-push guard: the built-in matches his full name only, and it stays
 * inside isNumbersPerson, so no quiet list, tier override or other grant
 * that shares access/match.ts picks him up by accident.
 */
const oliver = { id: "cmoliverwarren0001", name: "Oliver Warren" }
const vinicius = { id: "cmrlcnxw0000bq1s8pgc8n2ej", name: "Vinicius Sequeira" }

describe("Wages + COGS built-in: Oliver Warren by full name only", () => {
  test("every built-in entry is a full name, so a first name alone can never slip in", () => {
    assert.deepEqual([...NUMBERS_BUILT_IN], ["Oliver Warren"])
    for (const e of NUMBERS_BUILT_IN) assert.equal(e.trim().includes(" "), true, e)
  })

  test("his name as the sign in builds it (first + last from Shifts), any case or spacing", () => {
    for (const name of ["Oliver Warren", "oliver warren", "OLIVER WARREN", " Oliver  Warren ", "Oliver\tWarren", "Oliver Warren"]) {
      assert.equal(isNumbersPerson(null, { ...oliver, name }), true, JSON.stringify(name))
    }
  })

  test("the grant does not depend on the AppSetting row: missing, empty, broken or listing others", () => {
    for (const raw of [null, undefined, "", "[]", "not json", "{}", '["Shawna", 7]', '["Georgia Rodney"]']) {
      assert.equal(isNumbersPerson(raw, oliver), true, String(raw))
    }
  })

  test("no other Oliver, no other Warren, and no near miss", () => {
    for (const name of [
      "Oliver",
      "Warren",
      "Oliver Smith",
      "Jane Warren",
      "Olivia Warren",
      "Warren Oliver",
      "Oliver Warren-Smith",
      "Oliver Warrender",
      "Oliver J Warren",
      "Ollie Warren",
      "OliverWarren",
    ]) {
      assert.equal(isNumbersPerson(null, { id: "stf_x", name }), false, name)
      assert.equal(isNumbersPerson("[]", { id: "stf_x", name }), false, name)
    }
  })

  test("an empty name, an empty id or nobody signed in gets nothing", () => {
    assert.equal(isNumbersPerson(null, { id: "", name: "" }), false)
    assert.equal(isNumbersPerson(null, { id: "", name: "   " }), false)
    assert.equal(isNumbersPerson(null, null), false)
    assert.equal(isNumbersPerson('["Oliver Warren"]', null), false)
  })

  test("the built-in does not open the page for anyone else who has no row", () => {
    assert.equal(isNumbersPerson(null, { id: "stf_pate", name: "Shawna Pate" }), false)
    assert.equal(isNumbersPerson(null, vinicius), false)
  })
})

describe("Wages + COGS built-in stays out of every other list", () => {
  test("Oliver is not quiet unless a quiet list names him, and a quiet list naming him still works", () => {
    for (const raw of [null, "[]", '["Georgia"]']) assert.equal(isQuietPerson(raw, oliver), false, String(raw))
    assert.equal(isQuietPerson('["Oliver Warren"]', oliver), true)
    assert.equal(isQuietPerson("not json", oliver), true, "a broken quiet list still fails closed for him too")
  })

  test("no tier override is invented for him: his Shifts tier stands unless the row raises it", () => {
    assert.equal(tierWithOverrides("STAFF", parseTierOverrides(null), oliver), "STAFF")
    assert.equal(tierWithOverrides("SENIOR", parseTierOverrides("{}"), oliver), "SENIOR")
    assert.equal(tierWithOverrides("SENIOR", parseTierOverrides('{"Oliver Warren":"MANAGER"}'), oliver), "MANAGER")
  })

  test("the Burleigh sales grant has its own built-in and does not take Oliver from this one", () => {
    assert.equal(isBurleighSalesPerson(null, oliver), false)
    assert.equal(isBurleighSalesPerson(null, vinicius), true)
  })
})
