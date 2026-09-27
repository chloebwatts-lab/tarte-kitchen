import { test, describe } from "node:test"
import assert from "node:assert/strict"

process.env.NEXTAUTH_SECRET = "test-only-secret-not-real-0000000000"

import { checkCouncilPassword } from "./council-auth"

describe("council password check", () => {
  test("no COUNCIL_PASSWORD configured refuses by throwing, never by accepting", () => {
    delete process.env.COUNCIL_PASSWORD
    assert.throws(() => checkCouncilPassword("anything"), /COUNCIL_PASSWORD/)
    assert.throws(() => checkCouncilPassword(""), /COUNCIL_PASSWORD/)
  })

  test("exact match only", () => {
    process.env.COUNCIL_PASSWORD = "inspector-2026"
    try {
      assert.equal(checkCouncilPassword("inspector-2026"), true)
      assert.equal(checkCouncilPassword("Inspector-2026"), false)
      assert.equal(checkCouncilPassword("inspector-2026 "), false)
      assert.equal(checkCouncilPassword("inspector-202"), false)
      assert.equal(checkCouncilPassword(""), false)
      // Same byte length, different content.
      assert.equal(checkCouncilPassword("inspector-2027"), false)
    } finally {
      delete process.env.COUNCIL_PASSWORD
    }
  })

  test("multi-byte input of equal character length but different byte length is refused", () => {
    process.env.COUNCIL_PASSWORD = "abcd"
    try {
      assert.equal(checkCouncilPassword("abcé"), false)
    } finally {
      delete process.env.COUNCIL_PASSWORD
    }
  })
})
