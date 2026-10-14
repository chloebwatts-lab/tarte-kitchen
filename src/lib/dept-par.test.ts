import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { isDeptOwner, mayEditPar, parsePar } from "./dept-par"

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
