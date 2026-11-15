import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { NUMBERS_HREF, NUMBERS_SETTING_KEY, isNumbersPerson, parseNumbersList } from "./numbers-access"
import { QUIET_LANDING, QUIET_SETTING_KEY, COPY_QUIET_SETTING_KEY } from "./manager-quiet"
import { mayTrustDevice } from "./person-auth"

/** Wages + COGS grant: inputs that must never open the page (pre-push guard, 15 Nov 2026). */
const georgia = { id: "stf_rodney", name: "Georgia Rodney" }
const shawna = { id: "stf_pate", name: "Shawna Pate" }

describe("Wages + COGS: a grant fails closed on nasty lists", () => {
  test("blank and whitespace entries match nobody", () => {
    for (const raw of ['[""]', '["   "]', '["", " "]']) assert.equal(isNumbersPerson(raw, georgia), false, raw)
  })

  test("one bad entry voids the whole list rather than granting the good ones around it", () => {
    for (const raw of ['["Georgia", 7]', '["Georgia", null]', '[["Georgia"]]', '["Georgia", {"id":"stf_rodney"}]']) {
      assert.deepEqual(parseNumbersList(raw), [], raw)
      assert.equal(isNumbersPerson(raw, georgia), false, raw)
    }
  })

  test("a staff id must match exactly: no prefix, no other case; a surname alone is not a match", () => {
    assert.equal(isNumbersPerson('["stf_rod"]', georgia), false)
    assert.equal(isNumbersPerson('["STF_RODNEY"]', georgia), false)
    assert.equal(isNumbersPerson('["Rodney"]', georgia), false)
    assert.equal(isNumbersPerson('["Pate"]', shawna), false)
    assert.equal(isNumbersPerson('["stf_rodney"]', georgia), true)
  })

  test("a person with no name or id on the session matches nothing", () => {
    assert.equal(isNumbersPerson('["Georgia"]', { id: "", name: "" }), false)
    assert.equal(isNumbersPerson('[""]', { id: "", name: "" }), false)
  })

  test("the grant has its own setting key, so a quiet list can never be read as a grant", () => {
    assert.equal(NUMBERS_SETTING_KEY, "wagesCogsStaff")
    assert.notEqual(NUMBERS_SETTING_KEY, QUIET_SETTING_KEY)
    assert.notEqual(NUMBERS_SETTING_KEY, COPY_QUIET_SETTING_KEY)
  })

  test("a refused person lands on the hub, which is not the page itself (no redirect loop)", () => {
    assert.equal(QUIET_LANDING, "/kitchen/managers")
    assert.notEqual(QUIET_LANDING, NUMBERS_HREF)
    assert.equal(NUMBERS_HREF.startsWith("/kitchen/managers/"), true)
  })

  test("the owner rule needs both the OWNER role and the surname: neither alone, and no surname is no", () => {
    assert.equal(mayTrustDevice({ role: "OWNER" }), false)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "" }), false)
    assert.equal(mayTrustDevice({ role: "SUPERVISOR", last: "Watts" }), false)
    assert.equal(mayTrustDevice({ role: "STAFF", last: "Pate" }), false)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "Watts-Smith" }), false)
    assert.equal(mayTrustDevice({ role: "OWNER", last: "  PATE " }), true)
  })
})
