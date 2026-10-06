import { test } from "node:test"
import assert from "node:assert/strict"
import { uberStores } from "./token"

// uberStores reads the Json column off the connection row. Everything that is
// not an array must come back as [] so the Settings card and the sync loop
// never iterate over garbage.
test("uberStores: null connection, null/absent/object stores all give []", () => {
  assert.deepEqual(uberStores(null), [])
  assert.deepEqual(uberStores({ stores: null }), [])
  assert.deepEqual(uberStores({ stores: undefined }), [])
  assert.deepEqual(uberStores({ stores: { uuid: "x" } }), [])
  assert.deepEqual(uberStores({ stores: "[]" }), [])
})

test("uberStores: an array passes through untouched", () => {
  const stores = [
    { uuid: "d6b633f2-1f41-52b2-b605-2c40d6128a83", name: "Tarte Bakery Burleigh", venue: "BURLEIGH" },
    { uuid: "e6b038aa-1239-5c30-a2b1-d0eb980fd851", name: "Tarte Takeaway", venue: "BEACH_HOUSE" },
  ]
  assert.deepEqual(uberStores({ stores }), stores)
  assert.deepEqual(uberStores({ stores: [] }), [])
})
