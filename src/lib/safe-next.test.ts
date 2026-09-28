import { test } from "node:test"
import assert from "node:assert/strict"
import { safeNext } from "./safe-next"

const FB = "/staffaccess"

test("in-app paths pass through", () => {
  assert.equal(safeNext("/kitchen", FB), "/kitchen")
  assert.equal(safeNext("/kitchen/orders?dept=pastry#top", FB), "/kitchen/orders?dept=pastry#top")
  assert.equal(safeNext("  /log ", FB), "/log")
})

test("anything that could leave the site falls back", () => {
  for (const bad of [
    "//evil.example",
    "/\\evil.example",
    "/\\\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/javascript:alert(1)",
    "/kitchen\\@evil.example",
    "/kitchen\u0000",
    "/kitchen\r\nLocation: https://evil.example",
    "",
    "kitchen",
  ]) {
    assert.equal(safeNext(bad, FB), FB, JSON.stringify(bad))
  }
  assert.equal(safeNext(null, FB), FB)
  assert.equal(safeNext(undefined, FB), FB)
})

test("a colon in the query string is fine, only a scheme-like path is rejected", () => {
  assert.equal(safeNext("/kitchen?at=10:30", FB), "/kitchen?at=10:30")
})
