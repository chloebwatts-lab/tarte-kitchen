import { test } from "node:test"
import assert from "node:assert/strict"
import { projectEndOfWeekSpend } from "./projection"
import { checkBucket } from "./guards"
import type { BucketSpendData } from "./types"

// Realistic 8-week Currumbin delivery profile, idx 0 = Wed. Sums to 1 but
// not exactly so in binary floating point, which is what the live
// buildShares() hands over.
const CURRUMBIN_SHARE = [0.21, 0.17, 0.14, 0.12, 0.09, 0.16, 0.11]

const cents = (n: number) => Math.round(n * 100) / 100

// ----------------------------------------------------------- happy path

test("weighted projection is rounded to the cent, with missing added after", () => {
  // Sunday 18 Oct 2026 Currumbin: Wed..Sat fully elapsed, 64% of a week
  const r = projectEndOfWeekSpend({
    estimatedSpentToDate: 21290.4,
    spendShare: CURRUMBIN_SHARE,
    daysElapsedFull: 4,
    estimatedMissing: 412.5,
  })
  assert.equal(r.method, "weighted")
  const elapsed = 0.21 + 0.17 + 0.14 + 0.12
  assert.equal(r.projectedEndOfWeek, cents(cents(21290.4 / elapsed) + 412.5))
  // Two decimals only: this is money that gets printed
  assert.equal(r.projectedEndOfWeek, cents(r.projectedEndOfWeek))
})

test("the grossed-up basis moves the pace, invoices in hand alone do not", () => {
  // Same week, same history. Invoices in hand 15389, grossed up to 21290.
  const inHand = projectEndOfWeekSpend({ estimatedSpentToDate: 15389, spendShare: CURRUMBIN_SHARE, daysElapsedFull: 4, estimatedMissing: 0 })
  const grossed = projectEndOfWeekSpend({ estimatedSpentToDate: 21290, spendShare: CURRUMBIN_SHARE, daysElapsedFull: 4, estimatedMissing: 0 })
  const budget = 26740
  assert.ok(inHand.projectedEndOfWeek < budget * 0.95, "old basis would have read on track")
  assert.ok(grossed.projectedEndOfWeek > budget * 1.05, "grossed-up basis reads over")
  // And the ratio is exactly the gross-up ratio: nothing else changed
  assert.equal(cents(grossed.projectedEndOfWeek / inHand.projectedEndOfWeek), cents(21290 / 15389))
})

// ----------------------------------------------------- week boundaries

test("Tuesday (all 7 days elapsed): projection equals spend to date plus missing, float share sums notwithstanding", () => {
  // Built the way buildShares() does it: 8-week weekday dollar sums over
  // their total. These particular sums give shares adding to
  // 1.0000000000000002, so dividing by them lands a hair UNDER spend to
  // date and cent rounding must absorb it or the guard would trip.
  const weekdaySums = [29876.5, 26543.2, 23111.1, 17654.3, 13222.2, 27888.8, 18703.9]
  const total = weekdaySums.reduce((a, b) => a + b, 0)
  const share = weekdaySums.map((s) => s / total)
  const sum = share.reduce((a, b) => a + b, 0)
  assert.notEqual(sum, 1, "fixture should exercise the float case")
  assert.ok(Math.abs(sum - 1) < 1e-9)
  for (const spent of [0, 0.01, 18456.78, 50000]) {
    const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: share, daysElapsedFull: 7, estimatedMissing: 1200 })
    assert.equal(r.method, "weighted")
    assert.equal(r.projectedEndOfWeek, cents(spent + 1200))
  }
})

test("Wednesday morning (one day clamped, nothing invoiced): projection is just the missing suppliers", () => {
  assert.deepEqual(
    projectEndOfWeekSpend({ estimatedSpentToDate: 0, spendShare: CURRUMBIN_SHARE, daysElapsedFull: 1, estimatedMissing: 850 }),
    { projectedEndOfWeek: 850, method: "weighted" }
  )
  assert.deepEqual(
    projectEndOfWeekSpend({ estimatedSpentToDate: 0, spendShare: null, daysElapsedFull: 1, estimatedMissing: 0 }),
    { projectedEndOfWeek: 0, method: "flat" }
  )
})

test("elapsed share of exactly 10% is still weighted; just under falls back to flat", () => {
  const atFloor = [0.1, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1]
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 1234.56, spendShare: atFloor, daysElapsedFull: 1, estimatedMissing: 0 })
  assert.equal(r.method, "weighted")
  assert.equal(r.projectedEndOfWeek, 12345.6)
  const under = [0.0999, 0.2001, 0.2, 0.2, 0.1, 0.1, 0.1]
  const f = projectEndOfWeekSpend({ estimatedSpentToDate: 1234.56, spendShare: under, daysElapsedFull: 1, estimatedMissing: 0 })
  assert.equal(f.method, "flat")
  assert.equal(f.projectedEndOfWeek, cents(1234.56 * 7))
})

test("flat fallback: ÷ days × 7 from the grossed-up figure, missing added in full", () => {
  // Burleigh with under 2 weeks of history: Wed+Thu grossed to 6100 from 5200 in hand
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 6100, spendShare: null, daysElapsedFull: 2, estimatedMissing: 640 })
  assert.deepEqual(r, { projectedEndOfWeek: 6100 / 2 * 7 + 640, method: "flat" })
  // Flat never projects below what is already counted either
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    const p = projectEndOfWeekSpend({ estimatedSpentToDate: 9876.54, spendShare: null, daysElapsedFull: days, estimatedMissing: 0 })
    assert.ok(p.projectedEndOfWeek + 0.01 >= 9876.54, `day ${days}`)
  }
})

// ---------------------------------------------------- nasty inputs

test("every weekday of the week, weighted never projects below the grossed-up spend", () => {
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    const r = projectEndOfWeekSpend({ estimatedSpentToDate: 7900, spendShare: CURRUMBIN_SHARE, daysElapsedFull: days, estimatedMissing: 0 })
    assert.ok(r.projectedEndOfWeek + 0.01 >= 7900, `day ${days}: ${r.projectedEndOfWeek}`)
  }
})

test("inputs are not mutated and the share array is read, not consumed", () => {
  const share = [...CURRUMBIN_SHARE]
  const input = { estimatedSpentToDate: 1000, spendShare: share, daysElapsedFull: 3, estimatedMissing: 0 }
  projectEndOfWeekSpend(input)
  projectEndOfWeekSpend(input)
  assert.deepEqual(share, CURRUMBIN_SHARE)
  assert.deepEqual(input, { estimatedSpentToDate: 1000, spendShare: CURRUMBIN_SHARE, daysElapsedFull: 3, estimatedMissing: 0 })
})

// ------------------------------------------------ guard boundary

function guardBucket(over: Partial<BucketSpendData>): BucketSpendData {
  const spentToDate = 7000
  const estimatedSpentToDate = 7900
  return {
    bucket: "BURLEIGH",
    label: "Burleigh",
    spentToDate,
    forecastRevenue: 37037.04,
    estimatedMissingSpend: 0,
    missingSpendBreakdown: [],
    targetPct: 27,
    budget: 10000,
    estimatedSpentToDate,
    estimatedUninvoiced: 900,
    leftToSpend: 2100,
    projectedEndOfWeek: estimatedSpentToDate,
    spendProjectionMethod: "weighted",
    revenueProjectionMethod: null,
    paceStatus: "on-track",
    invoiceCount: 12,
    daily: [],
    suppliers: [],
    revenueToDateExGst: null,
    revenueDaysReported: 0,
    lastRevenueDate: null,
    projectedRevenueExGst: null,
    revenueDaily: [],
    todaySoFarExGst: null,
    revenueNotes: [],
    ...over,
  }
}

test("guard: projection equal to, or a cent under, the grossed-up spend passes; two cents under does not", () => {
  assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek: 7900 }), "2026-10-18"), [])
  assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek: 7900.01 }), "2026-10-18"), [])
  assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek: 7899.99 }), "2026-10-18"), [])
  const under = checkBucket(guardBucket({ projectedEndOfWeek: 7899.98 }), "2026-10-18")
  assert.equal(under.length, 1)
  assert.match(under[0], /projectedEndOfWeek 7899.98 is below spend to date 7900/)
})

test("guard: a projection that only clears invoices in hand (the pre-fix behaviour) is refused", () => {
  // 7000 in hand, 7900 grossed up, projection 7500: above spentToDate, below the basis
  const p = checkBucket(guardBucket({ projectedEndOfWeek: 7500 }), "2026-10-18")
  assert.equal(p.length, 1)
  assert.match(p[0], /below spend to date 7900/)
})

test("guard: the live projection output always satisfies the live guard", () => {
  for (const days of [1, 4, 7]) {
    for (const share of [CURRUMBIN_SHARE, null]) {
      const { projectedEndOfWeek, method } = projectEndOfWeekSpend({ estimatedSpentToDate: 7900, spendShare: share, daysElapsedFull: days, estimatedMissing: 0 })
      assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek, spendProjectionMethod: method }), "2026-10-18"), [], `day ${days} ${method}`)
    }
  }
})
