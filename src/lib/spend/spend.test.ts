import { test } from "node:test"
import assert from "node:assert/strict"
import { sharedSplit, sharedSplitLabel, PARALLEL_SINGLE_INVOICE_FROM } from "./shared-split"
import { venueToBucket, SPEND_BUCKETS } from "./types"
import { EXPECTED_SUPPLIERS, matchExpectedSupplier } from "./expected-suppliers"
import { render } from "./weekly-email"
import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"

// -------------------------------------------------------- shared split

test("shared invoices default to half each", () => {
  assert.deepEqual(sharedSplit("Breadtop"), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(null), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(undefined), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(""), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.equal(sharedSplitLabel("Breadtop"), "50/50")
})

test("Parallel Roasters is 55 Burleigh / 45 Currumbin, matched by case-insensitive prefix", () => {
  assert.deepEqual(sharedSplit("Parallel Roasters"), { BURLEIGH: 0.55, CURRUMBIN: 0.45 })
  assert.deepEqual(sharedSplit("  PARALLEL ROASTERS PTY LTD "), { BURLEIGH: 0.55, CURRUMBIN: 0.45 })
  assert.equal(sharedSplitLabel("parallel roasters"), "55/45")
  // a name that merely contains the words is not a prefix match
  assert.deepEqual(sharedSplit("Not Parallel Roasters"), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
})

test("every split sums to exactly one dollar per dollar (no money lost or invented)", () => {
  for (const name of ["Breadtop", "Parallel Roasters", null]) {
    const s = sharedSplit(name)
    assert.equal(Math.round((s.BURLEIGH + s.CURRUMBIN) * 1e9) / 1e9, 1)
    assert.ok(s.BURLEIGH > 0 && s.CURRUMBIN > 0)
  }
  // a real weekly coffee invoice splits to the cent
  const s = sharedSplit("Parallel Roasters")
  const amt = 1234.56
  assert.equal(Math.round(amt * s.BURLEIGH * 100) / 100, 679.01)
  assert.equal(Math.round(amt * s.CURRUMBIN * 100) / 100, 555.55)
  assert.equal(679.01 + 555.55, 1234.56)
})

test("single-invoice cutover for Parallel Roasters is 12 Aug 2026 UTC midnight", () => {
  assert.equal(PARALLEL_SINGLE_INVOICE_FROM.toISOString(), "2026-08-12T00:00:00.000Z")
})

// ------------------------------------------------------------- buckets

test("Tea Garden rolls into the Currumbin bucket; BOTH and null are not a bucket", () => {
  assert.equal(venueToBucket("BURLEIGH"), "BURLEIGH")
  assert.equal(venueToBucket("BEACH_HOUSE"), "CURRUMBIN")
  assert.equal(venueToBucket("TEA_GARDEN"), "CURRUMBIN")
  assert.equal(venueToBucket("BOTH"), null)
  assert.equal(venueToBucket(null), null)
  assert.deepEqual(SPEND_BUCKETS, ["BURLEIGH", "CURRUMBIN"])
})

// --------------------------------------------------- expected suppliers

test("supplier aliases match case- and whitespace-insensitively", () => {
  assert.equal(matchExpectedSupplier("  BIDFOOD ")?.canonicalName, "Bidfood")
  assert.equal(matchExpectedSupplier("produce oz")?.canonicalName, "Jensens")
  assert.equal(matchExpectedSupplier("Produce Oz by Jensens")?.canonicalName, "Jensens")
  assert.equal(matchExpectedSupplier("EAC Business Group")?.canonicalName, "Breadtop")
  assert.equal(matchExpectedSupplier("Paramount")?.canonicalName, "Paramount Liquor")
})

test("near-misses do not match (exact alias only, no substring)", () => {
  assert.equal(matchExpectedSupplier("Bidfoods"), null)
  assert.equal(matchExpectedSupplier("Jensens Produce"), null)
  assert.equal(matchExpectedSupplier(""), null)
})

test("expected supplier list is internally consistent", () => {
  const seen = new Map<string, string>()
  for (const s of EXPECTED_SUPPLIERS) {
    assert.ok(s.expectedIntervalDays > 0, `${s.canonicalName} interval`)
    assert.ok(s.nameAliases.length > 0, `${s.canonicalName} aliases`)
    for (const a of s.nameAliases) {
      const k = a.toLowerCase().trim()
      const prev = seen.get(k)
      // case variants inside one supplier are fine; the same alias under
      // two suppliers would make matchExpectedSupplier order-dependent
      if (prev !== undefined) {
        assert.equal(prev, s.canonicalName, `alias "${a}" appears under both ${prev} and ${s.canonicalName}`)
      }
      seen.set(k, s.canonicalName)
    }
  }
  const canonical = EXPECTED_SUPPLIERS.map((s) => s.canonicalName)
  assert.equal(new Set(canonical).size, canonical.length, "duplicate canonical names")
})

// ------------------------------------------------ Sunday email renderer

function bucket(over: Partial<BucketSpendData> & { bucket: BucketSpendData["bucket"] }): BucketSpendData {
  const label = over.bucket === "BURLEIGH" ? "Burleigh" : "Currumbin (Beach House + Tea Garden)"
  return {
    label,
    spentToDate: 0,
    forecastRevenue: null,
    estimatedMissingSpend: 0,
    effectiveSpent: 0,
    missingSpendBreakdown: [],
    targetPct: 27,
    budget: null,
    remaining: null,
    projectedEndOfWeek: 0,
    spendProjectionMethod: "flat",
    revenueProjectionMethod: null,
    paceStatus: "no-forecast",
    invoiceCount: 0,
    daily: [],
    suppliers: [],
    revenueToDateExGst: null,
    revenueDaysReported: 0,
    lastRevenueDate: null,
    projectedRevenueExGst: null,
    revenueDaily: [],
    ...over,
  }
}

function snapshot(over: Partial<CurrentWeekSpendSnapshot> = {}): CurrentWeekSpendSnapshot {
  return {
    weekStartWed: "2026-09-23",
    weekEndTue: "2026-09-29",
    todayAest: "2026-09-27",
    dayOfWeek: 5, // Sunday
    daysElapsedFull: 4,
    buckets: [],
    coverage: [],
    unassigned: [],
    ...over,
  }
}

test("Sunday send: 3 days to go, remaining spread per day", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        spentToDate: 7000,
        budget: 10000,
        remaining: 3000,
        forecastRevenue: 37037,
        projectedEndOfWeek: 9800,
        paceStatus: "on-track",
      }),
    ],
  })
  const { subject, text } = render(snap)
  assert.match(subject, /^COGS TRACKING \(.+\): 3 days to go$/)
  assert.match(text, /Burleigh: \$3,000 left to spend \(\$7,000 of \$10,000 used\)\. That's about \$1,000\/day for the 3 days left\./)
  assert.match(text, /pace: On track, projected full-week spend \$9,800 vs \$10,000 budget\./)
  // no takings line when no EOD report has landed
  assert.doesNotMatch(text, /Takings so far/)
})

test("over budget: OVER amount is shown positive and orders are held", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        spentToDate: 8500,
        budget: 8000,
        remaining: -500,
        projectedEndOfWeek: 11200,
        paceStatus: "over",
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(text, /\$8,500 spent of a \$8,000 budget, \$500 OVER\. Hold all non-essential orders/)
  assert.match(text, /pace: Over pace/)
  // the table cell prints the signed remaining
  assert.match(html, /-\$500/)
})

test("last day of the week: singular wording and the whole budget for today", () => {
  const snap = snapshot({
    dayOfWeek: 7,
    buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 9000, budget: 10000, remaining: 1000, paceStatus: "watch" })],
  })
  const { subject, text } = render(snap)
  assert.match(subject, /: 1 day to go$/)
  assert.match(text, /1 day left\./)
  assert.match(text, /\$1,000 left to spend .* That's the whole budget for today, the last day of the week\./)
})

test("no forecast loaded: no budget comparison and no division", () => {
  const snap = snapshot({
    buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 4321.49 })],
  })
  const { text } = render(snap)
  assert.match(text, /Burleigh: \$4,321 spent so far\. No sales forecast loaded, so no budget to compare against\./)
  assert.match(text, /pace: No forecast, projected full-week spend \$0 vs — budget\./)
  assert.doesNotMatch(text, /NaN|Infinity/)
})

test("takings line: revenue pace vs forecast and projected COGS % against live revenue", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        spentToDate: 7000,
        budget: 10800,
        remaining: 3800,
        forecastRevenue: 40000,
        projectedEndOfWeek: 9800,
        paceStatus: "on-track",
        revenueToDateExGst: 20000,
        revenueDaysReported: 4,
        lastRevenueDate: "2026-09-26",
        projectedRevenueExGst: 35000,
        revenueProjectionMethod: "weighted",
      }),
    ],
  })
  const { text, html } = render(snap)
  // 35000 / 40000 = 87.5% -> 88%; 9800 / 35000 = 28.0%
  assert.match(text, /Takings so far \$20,000 ex GST, pacing 88% of forecast\. On that pace the week finishes near 28\.0% COGS \(target 27%\)\./)
  assert.match(html, /28\.0% \/ 27%/)
})

test("takings line falls back to forecast revenue when no revenue projection exists", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        forecastRevenue: 40000,
        projectedEndOfWeek: 10000,
        budget: 10800,
        remaining: 10800,
        revenueToDateExGst: 0,
        revenueDaysReported: 1,
        projectedRevenueExGst: null,
      }),
    ],
  })
  const { text } = render(snap)
  assert.match(text, /Takings so far \$0 ex GST\. On that pace the week finishes near 25\.0% COGS/)
})

test("zero revenue everywhere: no COGS % and no NaN / Infinity leak", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        forecastRevenue: 0,
        projectedEndOfWeek: 5000,
        budget: 0,
        remaining: -5000,
        revenueToDateExGst: 0,
        revenueDaysReported: 1,
        projectedRevenueExGst: 0,
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(text, /Takings so far \$0 ex GST\.$/m)
  assert.doesNotMatch(text, /NaN|Infinity/)
  assert.doesNotMatch(html, /NaN|Infinity/)
  assert.match(html, /n\/a \/ 27%/)
})

test("untagged invoices are totalled and suppliers de-duplicated", () => {
  const snap = snapshot({
    buckets: [bucket({ bucket: "BURLEIGH" })],
    unassigned: [
      { id: "a", supplierName: "Joval Wines", invoiceDate: "2026-09-24", total: 210.5, invoiceNumber: "1" },
      { id: "b", supplierName: "Joval Wines", invoiceDate: "2026-09-25", total: 89.5, invoiceNumber: "2" },
      { id: "c", supplierName: "Paramount Liquor", invoiceDate: "2026-09-25", total: null, invoiceNumber: "3" },
    ],
  })
  const { text } = render(snap)
  assert.match(text, /Note: \$300 of invoices this week aren't tagged to a venue yet \(Joval Wines, Paramount Liquor\), usually liquor\./)
})

test("no untagged invoices: the note is omitted entirely", () => {
  const { text } = render(snapshot({ buckets: [bucket({ bucket: "BURLEIGH" })] }))
  assert.doesNotMatch(text, /aren't tagged/)
  assert.match(text, /Live tracker: https:\/\/kitchen\.tarte\.com\.au\/spend/)
})

test("days left never goes negative and rounding is to whole dollars", () => {
  const { subject, text } = render(
    snapshot({ dayOfWeek: 9, buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 1234.567, budget: 2000.4, remaining: 765.833 })] })
  )
  assert.match(subject, /: 0 days to go$/)
  assert.match(text, /\$766 left to spend \(\$1,235 of \$2,000 used\)\.$/m)
})
