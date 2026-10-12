import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { personMatches } from "./match"

const cande = { id: "shifts-77", name: "Candela Rossi" }
const lacey = { id: "shifts-207", name: "Lacey Corby" }

describe("list entries match people", () => {
  test("staff id, exact", () => {
    assert.equal(personMatches("shifts-77", cande), true)
    assert.equal(personMatches("SHIFTS-77", cande), false)
  })

  test("full name, case and spacing ignored", () => {
    assert.equal(personMatches("Lacey Corby", lacey), true)
    assert.equal(personMatches("  lacey   CORBY ", lacey), true)
    assert.equal(personMatches("Lacey Corby", cande), false)
  })

  test("a single word is the first name only", () => {
    assert.equal(personMatches("Candela", cande), true)
    assert.equal(personMatches("candela", cande), true)
    assert.equal(personMatches("Cande", cande), false, "a nickname is not a prefix match")
    assert.equal(personMatches("Rossi", cande), false, "a surname alone never matches")
    assert.equal(personMatches("Lacey", lacey), true)
  })

  test("two words never match on first name alone", () => {
    assert.equal(personMatches("Lacey Smith", lacey), false)
    assert.equal(personMatches("Candela Rossi-Lima", cande), false)
  })

  test("blank entries match nobody", () => {
    assert.equal(personMatches("", lacey), false)
    assert.equal(personMatches("   ", lacey), false)
  })
})
