import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { MAX_PAR, isDeptOwner, mayEditPar, parsePar } from "./dept-par"

const jess = { id: "s-jess", name: "Jessica Passos Le Rose" }
const jose = { id: "s-jose", name: "Jose Luis Rincon Aya" }
const joanna = { id: "s-jo", name: "Joanna Smith" }

describe("isDeptOwner", () => {
  test("the owner name as typed on /order-departments finds the Shifts name", () => {
    assert.equal(isDeptOwner("Jess", jess), true)
    assert.equal(isDeptOwner("Jessica", jess), true)
    assert.equal(isDeptOwner("Jess Passos", jess), true)
    assert.equal(isDeptOwner("jessica passos le rose", jess), true)
    assert.equal(isDeptOwner("s-jess", jess), true, "a Shifts id works too")
  })

  test("other people never match", () => {
    assert.equal(isDeptOwner("Jess", jose), false)
    assert.equal(isDeptOwner("Jess", joanna), false)
    assert.equal(isDeptOwner("Jo", jose), false, "two letters must match a whole word")
    assert.equal(isDeptOwner("Jo", joanna), false)
    assert.equal(isDeptOwner("Jess Passos", { id: "x", name: "Jessica Smith" }), false, "every owner word must land")
  })

  test("blank owner or nobody signed in is never an owner", () => {
    assert.equal(isDeptOwner(null, jess), false)
    assert.equal(isDeptOwner("", jess), false)
    assert.equal(isDeptOwner("Jess", null), false)
  })
})

describe("mayEditPar", () => {
  test("the named head edits, the rest of the section only reads", () => {
    assert.equal(mayEditPar({ ownerName: "Jess", person: jess, tier: "MANAGER" }), true)
    assert.equal(mayEditPar({ ownerName: "Jess", person: jess, tier: "STAFF" }), true, "being the head is enough")
    assert.equal(mayEditPar({ ownerName: "Jess", person: jose, tier: "MANAGER" }), false, "another manager cannot")
    assert.equal(mayEditPar({ ownerName: "Jess", person: null, tier: "STAFF" }), false)
  })

  test("the office login and the owner's phone always can", () => {
    assert.equal(mayEditPar({ ownerName: "Jess", person: null, tier: "OWNER" }), true)
    assert.equal(mayEditPar({ ownerName: "Jess", person: jose, tier: "OWNER" }), true)
  })

  test("with no head named, a manager can so the column is never stuck", () => {
    assert.equal(mayEditPar({ ownerName: null, person: jose, tier: "MANAGER" }), true)
    assert.equal(mayEditPar({ ownerName: "", person: jose, tier: "SENIOR" }), false)
    assert.equal(mayEditPar({ ownerName: null, person: null, tier: null }), false)
  })
})

describe("parsePar", () => {
  test("packs, two decimals, nothing negative", () => {
    assert.equal(parsePar("6"), 6)
    assert.equal(parsePar(" 2.5 "), 2.5)
    assert.equal(parsePar(1.239), 1.24)
    assert.equal(parsePar("0"), null)
    assert.equal(parsePar("-2"), null)
    assert.equal(parsePar("abc"), null)
    assert.equal(parsePar(""), null)
    assert.equal(parsePar(null), null)
    assert.equal(parsePar(undefined), null)
    assert.equal(parsePar(Infinity), null)
  })
})

// ─── Added by test-guard, 14 Oct 2026 ───────────────────────────────────────

describe("isDeptOwner, edges", () => {
  test("a two-letter owner word matches only a whole word of the name", () => {
    assert.equal(isDeptOwner("Jo", { id: "s-jo2", name: "Jo Smith" }), true)
    assert.equal(isDeptOwner("Jo Smith", { id: "s-jo2", name: "Jo Smith" }), true)
    assert.equal(isDeptOwner("Jo", { id: "s-jon", name: "Jonathan Smith" }), false, "'Jo' is not the start of 'Jonathan'")
    assert.equal(isDeptOwner("Le Rose", jess), true, "'le' is a whole word, 'rose' a prefix")
  })

  test("case and spacing as typed on the admin page do not matter", () => {
    assert.equal(isDeptOwner("  JESS   passos ", jess), true)
    assert.equal(isDeptOwner("jess\tPASSOS", jess), true)
  })

  test("another person's Shifts id or full name never lands", () => {
    assert.equal(isDeptOwner("s-jose", jess), false)
    assert.equal(isDeptOwner("Jose Luis Rincon Aya", jess), false)
    assert.equal(isDeptOwner("Jessica Passos Le Rose", jose), false)
  })

  test("a person with no name on record cannot be matched by name", () => {
    assert.equal(isDeptOwner("Jess", { id: "s-x", name: "" }), false)
    assert.equal(isDeptOwner("s-x", { id: "s-x", name: "" }), true, "but the id still does")
  })
})

describe("mayEditPar, edges", () => {
  test("a manager who is not the named head is read-only, whatever their tier short of OWNER", () => {
    for (const tier of ["STAFF", "SENIOR", "MANAGER"] as const) {
      assert.equal(mayEditPar({ ownerName: "Jess", person: jose, tier }), false, tier)
    }
  })

  test("with no head named: MANAGER and OWNER edit, STAFF and SENIOR do not", () => {
    assert.equal(mayEditPar({ ownerName: undefined, person: jose, tier: "MANAGER" }), true)
    assert.equal(mayEditPar({ ownerName: "", person: jose, tier: "MANAGER" }), true)
    assert.equal(mayEditPar({ ownerName: null, person: null, tier: "OWNER" }), true)
    assert.equal(mayEditPar({ ownerName: null, person: jose, tier: "STAFF" }), false)
    assert.equal(mayEditPar({ ownerName: null, person: jose, tier: "SENIOR" }), false)
  })

  test("the head's own name is enough even when the tier cookie is missing", () => {
    assert.equal(mayEditPar({ ownerName: "Jess", person: jess, tier: null }), true)
    assert.equal(mayEditPar({ ownerName: "Jess", person: jose, tier: null }), false)
  })
})

describe("parsePar, edges", () => {
  test("decimals, rounding and whitespace", () => {
    assert.equal(parsePar(".5"), 0.5)
    assert.equal(parsePar("2."), 2)
    assert.equal(parsePar("12.345"), 12.35)
    assert.equal(parsePar(0.005), 0.01)
    assert.equal(parsePar("   "), null)
  })

  test("rubbish and negatives clear rather than save", () => {
    assert.equal(parsePar("1,5"), null, "a comma decimal is not a number")
    assert.equal(parsePar("6 packs"), null)
    assert.equal(parsePar(Number.NaN), null)
    assert.equal(parsePar(-0.01), null)
    assert.equal(parsePar(-Infinity), null)
  })

  test("anything that rounds to zero clears, the same as 0", () => {
    assert.equal(parsePar(0.004), null)
    assert.equal(parsePar("0.001"), null)
    assert.equal(parsePar("0.00"), null)
  })
})

test("parsePar: a typo past the cap clears rather than overflowing the column", () => {
  assert.equal(parsePar(MAX_PAR), MAX_PAR)
  assert.equal(parsePar(MAX_PAR + 1), null)
  assert.equal(parsePar("99999999999"), null)
})
