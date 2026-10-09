import { test } from "node:test"
import assert from "node:assert/strict"
import { labourSource, labourSourceLabel } from "./source"

test("LABOUR_SOURCE defaults to Deputy; only an explicit 'shifts' moves to Tarte Shifts", () => {
  assert.equal(labourSource({}), "deputy")
  assert.equal(labourSource({ LABOUR_SOURCE: "" }), "deputy")
  assert.equal(labourSource({ LABOUR_SOURCE: "deputy" }), "deputy")
  assert.equal(labourSource({ LABOUR_SOURCE: "shifts" }), "shifts")
  assert.equal(labourSource({ LABOUR_SOURCE: " Shifts " }), "shifts")
  assert.equal(labourSource({ LABOUR_SOURCE: "tarte-shifts" }), "deputy")
})

test("labels", () => {
  assert.equal(labourSourceLabel("deputy"), "Deputy")
  assert.equal(labourSourceLabel("shifts"), "Tarte Shifts")
})
