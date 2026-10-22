import { test } from "node:test"
import assert from "node:assert/strict"
import { historyWeekIndex, projectEndOfWeekSpend, projectWeekRevenue, usualHistory, usualWeekSpend, USUAL_RATIO_MAX, type HistoryWeek } from "./projection"
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
    daysThroughToday: 4,
    usualWeekSpend: null, estimatedMissing: 412.5,
  })
  assert.equal(r.method, "weighted")
  const elapsed = 0.21 + 0.17 + 0.14 + 0.12
  assert.equal(r.projectedEndOfWeek, cents(cents(21290.4 / elapsed) + 412.5))
  // Two decimals only: this is money that gets printed
  assert.equal(r.projectedEndOfWeek, cents(r.projectedEndOfWeek))
})

test("the grossed-up basis moves the pace, invoices in hand alone do not", () => {
  // Same week, same history. Invoices in hand 15389, grossed up to 21290.
  const inHand = projectEndOfWeekSpend({ estimatedSpentToDate: 15389, spendShare: CURRUMBIN_SHARE, daysThroughToday: 4, usualWeekSpend: null, estimatedMissing: 0 })
  const grossed = projectEndOfWeekSpend({ estimatedSpentToDate: 21290, spendShare: CURRUMBIN_SHARE, daysThroughToday: 4, usualWeekSpend: null, estimatedMissing: 0 })
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
    const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: share, daysThroughToday: 7, usualWeekSpend: null, estimatedMissing: 1200 })
    assert.equal(r.method, "weighted")
    assert.equal(r.projectedEndOfWeek, cents(spent + 1200))
  }
})

test("Wednesday morning, nothing invoiced, no usual week to add: projection is just the missing suppliers", () => {
  assert.deepEqual(
    projectEndOfWeekSpend({ estimatedSpentToDate: 0, spendShare: CURRUMBIN_SHARE, daysThroughToday: 1, usualWeekSpend: null, estimatedMissing: 850 }),
    { projectedEndOfWeek: 850, method: "weighted" }
  )
  assert.deepEqual(
    projectEndOfWeekSpend({ estimatedSpentToDate: 0, spendShare: null, daysThroughToday: 1, usualWeekSpend: null, estimatedMissing: 0 }),
    { projectedEndOfWeek: 0, method: "flat" }
  )
})

test("elapsed share of exactly 10% is still weighted; just under falls back to flat", () => {
  const atFloor = [0.1, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1]
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 1234.56, spendShare: atFloor, daysThroughToday: 1, usualWeekSpend: null, estimatedMissing: 0 })
  assert.equal(r.method, "weighted")
  assert.equal(r.projectedEndOfWeek, 12345.6)
  const under = [0.0999, 0.2001, 0.2, 0.2, 0.1, 0.1, 0.1]
  const f = projectEndOfWeekSpend({ estimatedSpentToDate: 1234.56, spendShare: under, daysThroughToday: 1, usualWeekSpend: null, estimatedMissing: 0 })
  assert.equal(f.method, "flat")
  assert.equal(f.projectedEndOfWeek, cents(1234.56 * 7))
})

test("flat fallback: ÷ days × 7 from the grossed-up figure, missing added in full", () => {
  // Burleigh with under 2 weeks of history: Wed+Thu grossed to 6100 from 5200 in hand
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 6100, spendShare: null, daysThroughToday: 2, usualWeekSpend: null, estimatedMissing: 640 })
  assert.deepEqual(r, { projectedEndOfWeek: 6100 / 2 * 7 + 640, method: "flat" })
  // Flat never projects below what is already counted either
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    const p = projectEndOfWeekSpend({ estimatedSpentToDate: 9876.54, spendShare: null, daysThroughToday: days, usualWeekSpend: null, estimatedMissing: 0 })
    assert.ok(p.projectedEndOfWeek + 0.01 >= 9876.54, `day ${days}`)
  }
})

// ---------------------------------------------------- nasty inputs

test("every weekday of the week, weighted never projects below the grossed-up spend", () => {
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    const r = projectEndOfWeekSpend({ estimatedSpentToDate: 7900, spendShare: CURRUMBIN_SHARE, daysThroughToday: days, usualWeekSpend: null, estimatedMissing: 0 })
    assert.ok(r.projectedEndOfWeek + 0.01 >= 7900, `day ${days}: ${r.projectedEndOfWeek}`)
  }
})

test("inputs are not mutated and the share array is read, not consumed", () => {
  const share = [...CURRUMBIN_SHARE]
  const input = { estimatedSpentToDate: 1000, spendShare: share, daysThroughToday: 3, usualWeekSpend: null, estimatedMissing: 0 }
  projectEndOfWeekSpend(input)
  projectEndOfWeekSpend(input)
  assert.deepEqual(share, CURRUMBIN_SHARE)
  assert.deepEqual(input, { estimatedSpentToDate: 1000, spendShare: CURRUMBIN_SHARE, daysThroughToday: 3, usualWeekSpend: null, estimatedMissing: 0 })
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
      const { projectedEndOfWeek, method } = projectEndOfWeekSpend({ estimatedSpentToDate: 7900, spendShare: share, daysThroughToday: days, usualWeekSpend: null, estimatedMissing: 0 })
      assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek, spendProjectionMethod: method }), "2026-10-18"), [], `day ${days} ${method}`)
    }
  }
})

// ------------------------------------- usual rest of week (22 Oct 2026)
// Thu 22 Oct 2026 5pm, the inputs live-cogs had: Shifts' owner note read
// Burleigh "week heading for 55.3% (target 27.0%)" and Currumbin 68%, on
// one day of sales. Spend through Thursday was divided by Wednesday's
// delivery share alone, then set against Wednesday's takings × 9.

const BURLEIGH_22OCT = {
  estimatedSpentToDate: 11748.01,
  spendShare: [0.1994, 0.1783, 0.2051, 0.0737, 0.0623, 0.2257, 0.0554],
  revenueShare: [0.108, 0.1102, 0.1437, 0.1893, 0.218, 0.1272, 0.1036],
  wedTakings: 11505.04,
  forecast: 106000,
  historySpend: 253751,
  historyRevenue: 959194,
}
const CURRUMBIN_22OCT = {
  estimatedSpentToDate: 12047.64,
  spendShare: [0.1792, 0.2149, 0.1972, 0.0782, 0.0812, 0.1281, 0.1212],
  revenueShare: [0.1033, 0.0978, 0.1336, 0.2078, 0.2675, 0.1097, 0.0803],
  wedTakings: 10295.56,
  forecast: 94500,
  historySpend: 258701,
  historyRevenue: 859307,
}

function heading(v: typeof BURLEIGH_22OCT) {
  const rev = projectWeekRevenue({ revenueToDate: v.wedTakings, daysReported: 1, reportedShare: v.revenueShare[0], forecast: v.forecast, usualWeekRevenue: null })
  const usual = usualWeekSpend({ historySpend: v.historySpend, historyRevenue: v.historyRevenue, expectedWeekRevenue: rev.projectedRevenueExGst })
  const spend = projectEndOfWeekSpend({ estimatedSpentToDate: v.estimatedSpentToDate, spendShare: v.spendShare, daysThroughToday: 2, usualWeekSpend: usual, estimatedMissing: 0 })
  return { rev, spend, pct: (spend.projectedEndOfWeek / rev.projectedRevenueExGst!) * 100 }
}

test("Thu 22 Oct 2026: Burleigh heads for about 27.5%, not 55.3%", () => {
  const h = heading(BURLEIGH_22OCT)
  assert.equal(h.rev.method, "forecast")
  assert.equal(h.spend.method, "usual")
  // Takings: Wednesday's $11,505 plus the forecast's Thu..Tue share
  assert.equal(h.rev.projectedRevenueExGst, cents(11505.04 + (1 - 0.108) * 106000))
  assert.ok(Math.abs(h.pct - 27.5) < 0.2, `got ${h.pct}`)
  // What the old maths printed, for the record: so far ÷ Wednesday's share
  const old = (11748.01 / 0.1994) / (11505.04 / 0.108) * 100
  assert.ok(old > 55 && old < 56)
  // Last finished week, Louise's COGS: Burleigh 29.4% (Kitchen basis 28.9%)
  assert.ok(Math.abs(h.pct - 29.4) < 3)
})

test("Thu 22 Oct 2026: Currumbin heads for about 31%, not 68%", () => {
  const h = heading(CURRUMBIN_22OCT)
  assert.ok(Math.abs(h.pct - 30.9) < 0.2, `got ${h.pct}`)
  // Louise w/e 20 Oct: 32.8%
  assert.ok(Math.abs(h.pct - 32.8) < 3)
})

test("a week that goes exactly as usual reads the usual COGS % on every day", () => {
  // 30c of deliveries per $1 of takings, forecast spot on, each day's
  // spend and takings landing on their usual share.
  const forecast = 100000
  const ratio = 0.3
  const spendShare = CURRUMBIN_SHARE
  const revShare = [0.1, 0.1, 0.13, 0.21, 0.27, 0.11, 0.08]
  for (let day = 1; day <= 7; day++) {
    const spent = spendShare.slice(0, day).reduce((a, b) => a + b, 0) * forecast * ratio
    // Takings are in for the days before today
    const reported = revShare.slice(0, day - 1).reduce((a, b) => a + b, 0)
    const rev = projectWeekRevenue({ revenueToDate: day > 1 ? reported * forecast : null, daysReported: day - 1, reportedShare: day > 1 ? reported : null, forecast, usualWeekRevenue: null })
    const expected = rev.projectedRevenueExGst ?? forecast
    const usual = usualWeekSpend({ historySpend: ratio * 800000, historyRevenue: 800000, expectedWeekRevenue: expected })
    const s = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare, daysThroughToday: day, usualWeekSpend: usual, estimatedMissing: 0 })
    assert.equal(s.method, "usual")
    assert.ok(Math.abs((s.projectedEndOfWeek / expected) * 100 - 30) < 0.01, `day ${day}: ${s.projectedEndOfWeek}`)
  }
})

test("usual rest of week: Wednesday adds Thursday to Tuesday, Tuesday adds nothing", () => {
  const wed = projectEndOfWeekSpend({ estimatedSpentToDate: 5000, spendShare: CURRUMBIN_SHARE, daysThroughToday: 1, usualWeekSpend: 30000, estimatedMissing: 0 })
  assert.deepEqual(wed, { projectedEndOfWeek: cents(5000 + (1 - 0.21) * 30000), method: "usual" })
  const tue = projectEndOfWeekSpend({ estimatedSpentToDate: 31234.56, spendShare: CURRUMBIN_SHARE, daysThroughToday: 7, usualWeekSpend: 30000, estimatedMissing: 250 })
  assert.deepEqual(tue, { projectedEndOfWeek: cents(31234.56 + 250), method: "usual" })
  // A heavy Wednesday is counted once, not multiplied up to a week
  const heavy = projectEndOfWeekSpend({ estimatedSpentToDate: 12000, spendShare: CURRUMBIN_SHARE, daysThroughToday: 1, usualWeekSpend: 30000, estimatedMissing: 0 })
  assert.equal(heavy.projectedEndOfWeek, cents(12000 + 0.79 * 30000))
})

test("usual rest of week never projects below spend to date, and days are clamped to 1-7", () => {
  for (const days of [0, 1, 3, 7, 9]) {
    for (const spent of [0, 0.01, 7900, 60000]) {
      const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: CURRUMBIN_SHARE, daysThroughToday: days, usualWeekSpend: 28000, estimatedMissing: 0 })
      assert.ok(r.projectedEndOfWeek + 0.01 >= spent, `days ${days} spent ${spent}`)
      assert.ok(Number.isFinite(r.projectedEndOfWeek))
    }
  }
})

test("no usual week (thin history) falls back to dividing by the share through today", () => {
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 11748.01, spendShare: BURLEIGH_22OCT.spendShare, daysThroughToday: 2, usualWeekSpend: null, estimatedMissing: 0 })
  assert.equal(r.method, "weighted")
  // Wed + Thu share, not Wednesday alone
  assert.equal(r.projectedEndOfWeek, cents(11748.01 / (0.1994 + 0.1783)))
  // A zero or negative usual week is ignored, not added
  assert.equal(projectEndOfWeekSpend({ estimatedSpentToDate: 100, spendShare: CURRUMBIN_SHARE, daysThroughToday: 2, usualWeekSpend: 0, estimatedMissing: 0 }).method, "weighted")
})

test("guard: the usual-rest-of-week output always satisfies the live guard", () => {
  for (const days of [1, 2, 4, 7]) {
    const { projectedEndOfWeek, method } = projectEndOfWeekSpend({ estimatedSpentToDate: 7900, spendShare: CURRUMBIN_SHARE, daysThroughToday: days, usualWeekSpend: 9000, estimatedMissing: 0 })
    assert.deepEqual(checkBucket(guardBucket({ projectedEndOfWeek, spendProjectionMethod: method }), "2026-10-22"), [], `day ${days}`)
  }
})

// ----------------------------------------------------- week's takings

test("takings: so far plus the forecast's share for the days to come", () => {
  const r = projectWeekRevenue({ revenueToDate: 23000, daysReported: 2, reportedShare: 0.2, forecast: 100000, usualWeekRevenue: 120000 })
  assert.deepEqual(r, { projectedRevenueExGst: 103000, method: "forecast" })
  // No forecast: the 8-week average week stands in
  assert.deepEqual(
    projectWeekRevenue({ revenueToDate: 23000, daysReported: 2, reportedShare: 0.2, forecast: null, usualWeekRevenue: 120000 }),
    { projectedRevenueExGst: 119000, method: "usual" }
  )
  // Neither: scale up by the days' usual share
  assert.deepEqual(
    projectWeekRevenue({ revenueToDate: 23000, daysReported: 2, reportedShare: 0.2, forecast: null, usualWeekRevenue: null }),
    { projectedRevenueExGst: 115000, method: "weighted" }
  )
  // No weekday profile at all: flat
  assert.deepEqual(
    projectWeekRevenue({ revenueToDate: 23000, daysReported: 2, reportedShare: null, forecast: 100000, usualWeekRevenue: null }),
    { projectedRevenueExGst: 80500, method: "flat" }
  )
})

test("takings: none in yet is null; a full week is exactly what was taken", () => {
  assert.deepEqual(projectWeekRevenue({ revenueToDate: null, daysReported: 0, reportedShare: null, forecast: 100000, usualWeekRevenue: 100000 }), { projectedRevenueExGst: null, method: null })
  const weekdaySums = [11e3, 11.2e3, 14.4e3, 18.9e3, 21.8e3, 12.7e3, 10.4e3]
  const total = weekdaySums.reduce((a, b) => a + b, 0)
  const share = weekdaySums.reduce((a, b) => a + b / total, 0) // sums to 1 give or take a float
  const r = projectWeekRevenue({ revenueToDate: 104567.89, daysReported: 7, reportedShare: share, forecast: 120000, usualWeekRevenue: null })
  assert.equal(r.projectedRevenueExGst, 104567.89)
})

test("takings: never below what is already in, whatever the forecast", () => {
  for (const forecast of [null, 0, 1, 50000, 500000]) {
    for (const share of [null, 0.05, 0.5, 1, 1.2]) {
      const r = projectWeekRevenue({ revenueToDate: 40000, daysReported: 3, reportedShare: share, forecast, usualWeekRevenue: null })
      assert.ok(r.projectedRevenueExGst! + 0.01 >= 40000, `forecast ${forecast} share ${share}`)
    }
  }
})

test("usual week of spend: 8-week ratio on the week's takings, null when history looks broken", () => {
  assert.equal(usualWeekSpend({ historySpend: 253751, historyRevenue: 959194, expectedWeekRevenue: 106056 }), cents(106056 * (253751 / 959194)))
  assert.equal(usualWeekSpend({ historySpend: 0, historyRevenue: 959194, expectedWeekRevenue: 106056 }), null)
  assert.equal(usualWeekSpend({ historySpend: 253751, historyRevenue: 0, expectedWeekRevenue: 106056 }), null)
  assert.equal(usualWeekSpend({ historySpend: 253751, historyRevenue: 959194, expectedWeekRevenue: null }), null)
  // A month of sales missing doubles the ratio: refuse rather than invent
  assert.equal(usualWeekSpend({ historySpend: 253751, historyRevenue: 253751 / (USUAL_RATIO_MAX + 0.01), expectedWeekRevenue: 100000 }), null)
  assert.equal(usualWeekSpend({ historySpend: 5000, historyRevenue: 959194, expectedWeekRevenue: 100000 }), null)
})

// ------------------------------------- test-guard additions (22 Oct 2026)

// Delivery profiles built the way buildShares() builds them (weekday sums
// over their total), one summing a hair over 1 and one a hair under.
// CURRUMBIN_SHARE above happens to sum to exactly 1, so it cannot catch this.
const sharesFrom = (sums: number[]) => {
  const total = sums.reduce((a, b) => a + b, 0)
  return sums.map((s) => s / total)
}
const SHARE_OVER = sharesFrom([29876.5, 26543.2, 23111.1, 17654.3, 13222.2, 27888.8, 18703.9])
const SHARE_UNDER = sharesFrom([7392.2, 12180.8, 14964.4, 13183.7, 8475.9, 5169.4, 6304.1])
const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0)

test("usual rest of week on a Tuesday adds nothing when the shares sum a hair over or under 1", () => {
  assert.ok(sumOf(SHARE_OVER) > 1, "fixture should sum just over 1")
  assert.ok(sumOf(SHARE_UNDER) < 1, "fixture should sum just under 1")
  for (const share of [SHARE_OVER, SHARE_UNDER]) {
    for (const spent of [0, 0.01, 18456.78, 50000]) {
      const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: share, daysThroughToday: 7, usualWeekSpend: 31000, estimatedMissing: 1200 })
      assert.deepEqual(r, { projectedEndOfWeek: cents(spent + 1200), method: "usual" }, `spent ${spent}`)
    }
  }
})

test("credit-note-heavy week: zero or negative spend to date never projects below itself on the usual path", () => {
  // A $5,377.12 credit note dated Wednesday can leave the week net negative
  // early on. The second profile has a net-credit weekday, so the share
  // through Thursday tops 1 and the rest of week must clamp at zero.
  const creditDay = [0.6, 0.5, -0.2, 0.05, 0.02, 0.02, 0.01]
  for (const share of [SHARE_OVER, SHARE_UNDER, creditDay]) {
    for (const spent of [-5377.12, -0.01, 0, 0.01]) {
      for (let days = 1; days <= 7; days++) {
        const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: share, daysThroughToday: days, usualWeekSpend: 28000, estimatedMissing: 0 })
        assert.equal(r.method, "usual")
        assert.ok(Number.isFinite(r.projectedEndOfWeek))
        assert.ok(r.projectedEndOfWeek + 0.01 >= spent, `days ${days} spent ${spent}: ${r.projectedEndOfWeek}`)
        assert.equal(r.projectedEndOfWeek, cents(r.projectedEndOfWeek))
      }
    }
  }
  // Thursday on the net-credit profile: Wed+Thu are 110% of a week, nothing added
  assert.equal(
    projectEndOfWeekSpend({ estimatedSpentToDate: 9000, spendShare: creditDay, daysThroughToday: 2, usualWeekSpend: 28000, estimatedMissing: 0 }).projectedEndOfWeek,
    9000
  )
})

test("takings: a null, zero or negative forecast falls through to the 8-week week, then to scaling, never to zero", () => {
  for (const forecast of [null, 0, -100]) {
    assert.deepEqual(
      projectWeekRevenue({ revenueToDate: 11505.04, daysReported: 1, reportedShare: 0.108, forecast, usualWeekRevenue: 119899.25 }),
      { projectedRevenueExGst: cents(11505.04 + (1 - 0.108) * 119899.25), method: "usual" }
    )
    const r = projectWeekRevenue({ revenueToDate: 11505.04, daysReported: 1, reportedShare: 0.108, forecast, usualWeekRevenue: null })
    assert.equal(r.method, "weighted")
    assert.equal(r.projectedRevenueExGst, cents(11505.04 / 0.108))
  }
})

// The pure part of the glue in current-week.ts: takings first, then a usual
// week of deliveries at those takings (else the forecast, else the 8-week
// average week), then the bucket the guard sees. Trading week Wed 21 Oct to
// Tue 27 Oct 2026; takings are in for the days before today.
const WEEK_DATES = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]
const WEEK_DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]

function liveBucket(o: {
  day: number
  forecast: number | null
  usualWeekRevenue: number | null
  spentToDate: number
  completeness: number
  spendShare: number[] | null
  revShare: number[] | null
  estimatedMissing: number
}): BucketSpendData {
  const weekTakings = 112345.67
  let running = 0
  const revenueDaily = WEEK_DATES.map((date, i) => {
    const reported = i < o.day - 1
    const amount = reported ? cents((o.revShare ? o.revShare[i] : 1 / 7) * weekTakings) : 0
    running += amount
    return { date, dayName: WEEK_DAYS[i], amount, cumulative: cents(running), reported }
  })
  const daysReported = o.day - 1
  const revenueToDateExGst = daysReported > 0 ? cents(running) : null
  const revShare = o.revShare
  const rev = projectWeekRevenue({
    revenueToDate: revenueToDateExGst,
    daysReported,
    reportedShare: revShare ? revenueDaily.reduce((s, c, i) => (c.reported ? s + revShare[i] : s), 0) : null,
    forecast: o.forecast,
    usualWeekRevenue: o.usualWeekRevenue,
  })
  const estimatedSpentToDate = cents(Math.max(o.spentToDate, o.spentToDate / o.completeness))
  const spend = projectEndOfWeekSpend({
    estimatedSpentToDate,
    spendShare: o.spendShare,
    daysThroughToday: o.day,
    usualWeekSpend:
      o.spendShare && o.revShare
        ? usualWeekSpend({ historySpend: 253751, historyRevenue: 959194, expectedWeekRevenue: rev.projectedRevenueExGst ?? (o.forecast != null && o.forecast > 0 ? o.forecast : o.usualWeekRevenue) })
        : null,
    estimatedMissing: o.estimatedMissing,
  })
  const budget = o.forecast == null ? null : cents((o.forecast * 27) / 100)
  return guardBucket({
    spentToDate: o.spentToDate,
    forecastRevenue: o.forecast,
    estimatedMissingSpend: o.estimatedMissing,
    budget,
    estimatedSpentToDate,
    estimatedUninvoiced: cents(estimatedSpentToDate - o.spentToDate),
    leftToSpend: budget == null ? null : cents(budget - estimatedSpentToDate),
    projectedEndOfWeek: spend.projectedEndOfWeek,
    spendProjectionMethod: spend.method,
    revenueProjectionMethod: rev.method,
    paceStatus:
      budget == null ? "no-forecast" : spend.projectedEndOfWeek > budget * 1.05 ? "over" : spend.projectedEndOfWeek > budget * 0.95 ? "watch" : "on-track",
    revenueToDateExGst,
    revenueDaysReported: daysReported,
    lastRevenueDate: daysReported > 0 ? WEEK_DATES[daysReported - 1] : null,
    projectedRevenueExGst: rev.projectedRevenueExGst,
    revenueDaily,
  })
}

test("guard: every day of the week, with or without a forecast or history, the live chain passes checkBucket", () => {
  const revShare = BURLEIGH_22OCT.revenueShare
  for (let day = 1; day <= 7; day++) {
    for (const forecast of [null, 0, 106000]) {
      for (const usualWeekRevenue of [null, 119899.25]) {
        for (const shares of [{ s: SHARE_OVER, r: revShare }, { s: SHARE_UNDER, r: sharesFrom([11e3, 11.2e3, 14.4e3, 18.9e3, 21.8e3, 12.7e3, 10.4e3]) }, { s: null, r: null }]) {
          for (const spentToDate of [0, 0.01, 11748.01]) {
            const b = liveBucket({ day, forecast, usualWeekRevenue, spentToDate, completeness: 0.83, spendShare: shares.s, revShare: shares.r, estimatedMissing: 412.5 })
            const label = `day ${day} forecast ${forecast} usual ${usualWeekRevenue} shares ${shares.s ? "yes" : "none"} spent ${spentToDate}`
            assert.deepEqual(checkBucket(b, WEEK_DATES[day - 1]), [], label)
            for (const v of [b.projectedEndOfWeek, b.projectedRevenueExGst ?? 0]) assert.ok(Number.isFinite(v), label)
          }
        }
      }
    }
  }
})

test("Wednesday, no takings yet: the usual week of spend comes from the forecast, else the 8-week average week", () => {
  const base = { day: 1, spentToDate: 4200, completeness: 0.7, spendShare: SHARE_OVER, revShare: BURLEIGH_22OCT.revenueShare, estimatedMissing: 0 }
  const withForecast = liveBucket({ ...base, forecast: 106000, usualWeekRevenue: 119899.25 })
  assert.equal(withForecast.revenueProjectionMethod, null)
  assert.equal(withForecast.projectedRevenueExGst, null)
  assert.equal(withForecast.spendProjectionMethod, "usual")
  const ratio = 253751 / 959194
  assert.equal(withForecast.projectedEndOfWeek, cents(6000 + (1 - SHARE_OVER[0]) * cents(106000 * ratio)))
  const noForecast = liveBucket({ ...base, forecast: null, usualWeekRevenue: 119899.25 })
  assert.equal(noForecast.spendProjectionMethod, "usual")
  assert.equal(noForecast.projectedEndOfWeek, cents(6000 + (1 - SHARE_OVER[0]) * cents(119899.25 * ratio)))
  // Nothing to size a usual week from: back to dividing by Wednesday's share
  assert.equal(liveBucket({ ...base, forecast: null, usualWeekRevenue: null }).spendProjectionMethod, "weighted")
})

// ------------------------------------------- usual week from history

test("historyWeekIndex: Tue 20 Oct is the week just gone, Wed 26 Aug eight weeks back, the week itself is out", () => {
  const start = Date.UTC(2026, 9, 21) // Wed 21 Oct 2026, @db.Date at UTC midnight
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 9, 20)), 0)
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 9, 14)), 0)
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 9, 13)), 1)
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 7, 26)), 7)
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 7, 25)), null)
  assert.equal(historyWeekIndex(start, start), null)
  assert.equal(historyWeekIndex(start, Date.UTC(2026, 9, 22)), null)
})

test("usualHistory: weeks short of takings days are left out on both sides, so the ratio holds", () => {
  const full = (spend: number, revenue: number): HistoryWeek => ({ spend, revenue, revenueDays: 7 })
  const weeks: HistoryWeek[] = [
    full(28000, 106000), full(29000, 110000), full(27500, 104000), full(30000, 112000),
    // Lightspeed emails lost for most of a week: whole spend, a third of the takings
    { spend: 29000, revenue: 35000, revenueDays: 2 },
    // A public holiday closure is still a full week
    { spend: 25000, revenue: 95000, revenueDays: 6 },
    full(28500, 108000), full(29500, 111000),
  ]
  const u = usualHistory(weeks)!
  assert.equal(u.weeks, 7)
  assert.equal(u.spend, 28000 + 29000 + 27500 + 30000 + 25000 + 28500 + 29500)
  assert.equal(u.revenue, 106000 + 110000 + 104000 + 112000 + 95000 + 108000 + 111000)
  const ratio = u.spend / u.revenue
  assert.ok(ratio > 0.26 && ratio < 0.27, `ratio ${ratio}`)
  // Counting the short week would have read about 29%
  const naive = weeks.reduce((a, w) => a + w.spend, 0) / weeks.reduce((a, w) => a + w.revenue, 0)
  assert.ok(naive > 0.28)
})

test("usualHistory: under three full weeks, or no takings at all, is no usual week", () => {
  const w = (revenueDays: number, revenue = 100000): HistoryWeek => ({ spend: 27000, revenue, revenueDays })
  assert.equal(usualHistory([]), null)
  assert.equal(usualHistory([w(7), w(7), w(5), w(0, 0), w(7, 0)]), null)
  assert.deepEqual(usualHistory([w(7), w(7), w(6)]), { spend: 81000, revenue: 300000, weeks: 3 })
})
