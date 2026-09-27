import { test } from "node:test"
import assert from "node:assert/strict"
import { parseXeroDate } from "./client"

test("Xero /Date(ms)/ strings parse to the exact instant", () => {
  assert.equal(parseXeroDate("/Date(1790035200000)/").toISOString(), "2026-09-22T00:00:00.000Z")
  // the +0000 offset suffix Xero appends is ignored (ms are already UTC)
  assert.equal(parseXeroDate("/Date(1790035200000+0000)/").toISOString(), "2026-09-22T00:00:00.000Z")
  assert.equal(parseXeroDate("/Date(1790035200000+1000)/").toISOString(), "2026-09-22T00:00:00.000Z")
})

test("negative epoch values (pre-1970) are still parsed", () => {
  assert.equal(parseXeroDate("/Date(-86400000)/").toISOString(), "1969-12-31T00:00:00.000Z")
})

test("a plain ISO string falls back to the Date constructor", () => {
  assert.equal(parseXeroDate("2026-09-22").toISOString(), "2026-09-22T00:00:00.000Z")
  assert.equal(parseXeroDate("2026-09-22T10:00:00.000Z").toISOString(), "2026-09-22T10:00:00.000Z")
})

test("garbage yields an invalid date rather than throwing", () => {
  assert.equal(Number.isNaN(parseXeroDate("not a date").getTime()), true)
  assert.equal(Number.isNaN(parseXeroDate("").getTime()), true)
})
