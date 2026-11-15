import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { NUMBERS_HREF, isNumbersPerson, parseNumbersList } from "./numbers-access"
import { TOOL_GROUPS } from "./staff-tools"
import { mayTrustDevice } from "./person-auth"

const shawna = { id: "stf_pate", name: "Shawna Pate" }
const georgia = { id: "stf_rodney", name: "Georgia Rodney" }

describe("Wages + COGS: who may see it", () => {
  test("no list, a broken list or the wrong shape adds nobody (a grant fails closed)", () => {
    for (const raw of [null, undefined, "", "not json", "{}", '{"Shawna":true}', "[1,2]", '"Shawna"']) {
      assert.equal(isNumbersPerson(raw, shawna), false, String(raw))
      assert.deepEqual(parseNumbersList(raw), [])
    }
  })

  test("a listed first name, full name or staff id matches; nobody else does", () => {
    assert.equal(isNumbersPerson('["Shawna"]', shawna), true)
    assert.equal(isNumbersPerson('["shawna  pate"]', shawna), true)
    assert.equal(isNumbersPerson('["stf_pate"]', shawna), true)
    assert.equal(isNumbersPerson('["Shawna"]', georgia), false)
    assert.equal(isNumbersPerson('["Shawna Smith"]', shawna), false)
    assert.equal(isNumbersPerson('["Shawna"]', null), false)
    assert.equal(isNumbersPerson("[]", shawna), false)
  })

  test("the two owners pass on their own sign in; a Manager and another Owner role do not", () => {
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Watts" }), true)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Pate" }), true)
    assert.equal(mayTrustDevice({ role: "MANAGER", last: "Pate" }), false)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Warren" }), false)
    assert.equal(mayTrustDevice(null), false)
  })

  test("the tile is not in the shared staff tile list, so no other grid can show it", () => {
    for (const g of TOOL_GROUPS) {
      assert.notEqual(g.href, NUMBERS_HREF, g.slug)
      for (const t of g.tools) assert.equal(t.href.startsWith(NUMBERS_HREF), false, t.title)
    }
  })
})
