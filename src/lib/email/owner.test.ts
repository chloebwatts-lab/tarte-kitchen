import { test } from "node:test"
import assert from "node:assert/strict"
import { withoutOwner } from "./owner"

test("withoutOwner drops chloe@ and keeps everyone else", () => {
  assert.deepEqual(withoutOwner("chloe@tarte.com.au"), [])
  assert.deepEqual(withoutOwner(" Chloe@Tarte.com.au , shawna@tarte.com.au"), ["shawna@tarte.com.au"])
  assert.deepEqual(withoutOwner(["hello@tarte.com.au", "chloe@tarte.com.au", ""]), ["hello@tarte.com.au"])
  assert.deepEqual(withoutOwner(undefined), [])
  assert.deepEqual(withoutOwner(" , "), [])
})
