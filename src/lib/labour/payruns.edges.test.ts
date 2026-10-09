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

test("a lone run passes through untouched (no '+' in its id) as a copy, and an empty list stays empty", () => {
  const a = run({ payRunId: "bakery", grossWages: 48246.64, superAmount: 5520.88, totalCost: 53767.52, headcount: 50 })
  const [m] = mergePayRunsByWeek([a])
  assert.deepEqual(m, a)
  assert.notEqual(m, a)
  assert.deepEqual(mergePayRunsByWeek([]), [])
})

test("the droplet's leftover single-org setting cannot hide Burleigh: SHIFTS_PAYRUNS_ORGS wins, and an empty ORGS falls to both", () => {
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: "Tarte Bakery,Tarte Currumbin", SHIFTS_PAYRUNS_ORG: "Tarte Currumbin" }), ["Tarte Bakery", "Tarte Currumbin"])
  // docker-compose maps SHIFTS_PAYRUNS_ORG to "" when unset: "" is not nullish, so ORGS="" + ORG set still gives both
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: "", SHIFTS_PAYRUNS_ORG: "Tarte Currumbin" }), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: undefined, SHIFTS_PAYRUNS_ORG: "" }), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(payRunOrgs({ SHIFTS_PAYRUNS_ORGS: "Tarte Bakery" }), ["Tarte Bakery"])
})

test("a reversal (negative) run nets off the week it belongs to, zero runs add nothing", () => {
  const merged = mergePayRunsByWeek([
    run({ payRunId: "bakery", grossWages: 48246.64, superAmount: 5520.88, totalCost: 53767.52, headcount: 50 }),
    run({ payRunId: "fix", grossWages: -1200.5, superAmount: -138.06, totalCost: -1338.56, headcount: 0 }),
    run({ payRunId: "empty" }),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].grossWages, 47046.14)
  assert.equal(merged[0].superAmount, 5382.82)
  assert.equal(merged[0].totalCost, 52428.96)
  assert.equal(merged[0].headcount, 50)
  assert.equal(merged[0].payRunId, "bakery+fix+empty")
})

test("cents survive floating point: 0.1 + 0.2 is 0.3 and three orgs sum to the cent", () => {
  const [m] = mergePayRunsByWeek([
    run({ payRunId: "a", grossWages: 0.1, superAmount: 0.1, totalCost: 0.1 }),
    run({ payRunId: "b", grossWages: 0.2, superAmount: 0.2, totalCost: 0.2 }),
    run({ payRunId: "c", grossWages: 1000.005, superAmount: 0, totalCost: 0 }),
  ])
  assert.equal(m.grossWages, 1000.31) // 0.3 + 1000.005 -> 1000.305 -> rounds half up at the cent
  assert.equal(m.superAmount, 0.3)
  assert.equal(m.totalCost, 0.3)
})

test("output is sorted by weekStart ascending even when the feeds interleave weeks, weekEnd comes from the first run seen", () => {
  const w1 = new Date("2026-09-23T00:00:00.000Z")
  const w2 = new Date("2026-09-30T00:00:00.000Z")
  const w3 = new Date("2026-10-07T00:00:00.000Z")
  const merged = mergePayRunsByWeek([
    run({ payRunId: "c3", weekStart: w3, weekEnd: new Date("2026-10-13T00:00:00.000Z"), grossWages: 3 }),
    run({ payRunId: "b1", weekStart: w1, weekEnd: new Date("2026-09-29T00:00:00.000Z"), grossWages: 1 }),
    run({ payRunId: "c2", weekStart: w2, grossWages: 2 }),
    run({ payRunId: "b3", weekStart: w3, weekEnd: new Date("2026-10-13T00:00:00.000Z"), grossWages: 30 }),
    run({ payRunId: "b2", weekStart: w2, grossWages: 20 }),
  ])
  assert.deepEqual(merged.map((m) => m.weekStart.toISOString().slice(0, 10)), ["2026-09-23", "2026-09-30", "2026-10-07"])
  assert.deepEqual(merged.map((m) => m.grossWages), [1, 22, 33])
  assert.equal(merged[2].weekEnd.toISOString(), "2026-10-13T00:00:00.000Z")
})

test("paymentDate keeps the latest of the merged runs; an earlier or equal one does not replace it", () => {
  const later = new Date("2026-10-09T00:00:00.000Z")
  const [m] = mergePayRunsByWeek([
    run({ payRunId: "a", paymentDate: later }),
    run({ payRunId: "b", paymentDate: new Date("2026-10-07T00:00:00.000Z") }),
    run({ payRunId: "c", paymentDate: later }),
  ])
  assert.equal(m.paymentDate.toISOString(), later.toISOString())
})

test("weeks merge on the UTC calendar date of weekStart: same date different hour merges, Wed 00:00 AEST instant does not", () => {
  // Both orgs come through the same Shifts feed, so they share a format; this
  // documents what happens if one ever sent a true AEST instant instead.
  const dateOnly = new Date("2026-09-30T00:00:00.000Z")
  const sameDayLater = new Date("2026-09-30T14:00:00.000Z")
  const aestInstant = new Date("2026-09-29T14:00:00.000Z") // Wed 30 Sep 00:00 AEST
  const merged = mergePayRunsByWeek([
    run({ payRunId: "a", weekStart: dateOnly, grossWages: 1 }),
    run({ payRunId: "b", weekStart: sameDayLater, grossWages: 2 }),
    run({ payRunId: "c", weekStart: aestInstant, grossWages: 4 }),
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].grossWages, 4) // 29 Sep UTC date, its own row
  assert.equal(merged[1].grossWages, 3)
  assert.equal(merged[1].weekStart.getTime(), dateOnly.getTime()) // first run's instant is the row key
})
