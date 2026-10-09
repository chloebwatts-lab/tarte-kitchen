import { test } from "node:test"
import assert from "node:assert/strict"
import { mergePayRunsByWeek, payRunOrgs } from "./payruns"
import type { ProcessedPayRun } from "@/lib/xero/client"

const run = (over: Partial<ProcessedPayRun>): ProcessedPayRun => ({
  payRunId: "r",
  weekStart: new Date("2026-09-30T00:00:00.000Z"),
  weekEnd: new Date("2026-10-06T00:00:00.000Z"),
  paymentDate: new Date("2026-10-08T00:00:00.000Z"),
  grossWages: 0,
  superAmount: 0,
  totalCost: 0,
  headcount: 0,
  ...over,
})

test("both Xero orgs by default; a single legacy org or a custom list is honoured", () => {
  assert.deepEqual(payRunOrgs({}), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORG: "Tarte Currumbin" }), ["Tarte Currumbin"])
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: " Tarte Bakery , Tarte Currumbin ,", SHIFTS_PAYRUNS_ORG: "x" }), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: " , " }), ["Tarte Bakery", "Tarte Currumbin"])
  // A repeated org must not be fetched (and summed) twice.
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: "Tarte Bakery,Tarte Bakery,Tarte Currumbin" }), ["Tarte Bakery", "Tarte Currumbin"])
})

test("runs from two orgs with the same period start sum into one week (w/e 6 Oct 2026 real figures)", () => {
  const merged = mergePayRunsByWeek([
    run({ payRunId: "bakery", grossWages: 48246.64, superAmount: 5520.88, totalCost: 53767.52, headcount: 50 }),
    run({ payRunId: "currumbin", grossWages: 45391.28, superAmount: 4876.04, totalCost: 50267.32, headcount: 56, paymentDate: new Date("2026-10-09T00:00:00.000Z") }),
    run({ payRunId: "older", weekStart: new Date("2026-09-23T00:00:00.000Z"), grossWages: 100, superAmount: 12, totalCost: 112, headcount: 1 }),
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].weekStart.toISOString(), "2026-09-23T00:00:00.000Z")
  const w = merged[1]
  assert.equal(w.grossWages, 93637.92)
  assert.equal(w.superAmount, 10396.92)
  assert.equal(w.totalCost, 104034.84)
  assert.equal(w.headcount, 106)
  assert.equal(w.payRunId, "bakery+currumbin")
  assert.equal(w.paymentDate.toISOString(), "2026-10-09T00:00:00.000Z")
})

test("merging does not mutate the input runs", () => {
  const a = run({ payRunId: "a", grossWages: 10, totalCost: 10 })
  const b = run({ payRunId: "b", grossWages: 5, totalCost: 5 })
  mergePayRunsByWeek([a, b])
  assert.equal(a.grossWages, 10)
  assert.equal(a.payRunId, "a")
})
