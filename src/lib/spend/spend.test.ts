import { test } from "node:test"
import { isCompletedSalesDay } from "./sales-day"
import { arrivalCompleteness } from "./arrival-lag"
import assert from "node:assert/strict"
import { sharedSplit, sharedSplitLabel } from "./shared-split"
import { venueToBucket, SPEND_BUCKETS } from "./types"
import { EXPECTED_SUPPLIERS, matchExpectedSupplier } from "./expected-suppliers"
import { render, renderWithheld, SpendSnapshotInconsistent } from "./weekly-email"
import { checkSpendSnapshot, suspectRevenueDay } from "./guards"
import type { BucketSpendData, CurrentWeekSpendSnapshot } from "./types"

// -------------------------------------------------------- shared split

test("shared invoices default to half each", () => {
  assert.deepEqual(sharedSplit("Breadtop"), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(null), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(undefined), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.deepEqual(sharedSplit(""), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.equal(sharedSplitLabel("Breadtop"), "50/50")
})

test("Parallel Roasters no longer carries a special split (per-venue invoices since 2026-10-16)", () => {
  assert.deepEqual(sharedSplit("Parallel Roasters"), { BURLEIGH: 0.5, CURRUMBIN: 0.5 })
  assert.equal(sharedSplitLabel("parallel roasters"), "50/50")
})

test("every split sums to exactly one dollar per dollar (no money lost or invented)", () => {
  for (const name of ["Breadtop", "Parallel Roasters", null]) {
    const s = sharedSplit(name)
    assert.equal(Math.round((s.BURLEIGH + s.CURRUMBIN) * 1e9) / 1e9, 1)
    assert.ok(s.BURLEIGH > 0 && s.CURRUMBIN > 0)
  }
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
  // Currumbin seafood added 2026-10-16 so a week without them reads "missing", not zero
  assert.equal(matchExpectedSupplier("The Fish Factory")?.canonicalName, "The Fish Factory")
  assert.equal(matchExpectedSupplier("Fish Factory")?.category, "seafood")
  assert.equal(matchExpectedSupplier("Ocean Made Seafood")?.canonicalName, "Ocean Made Seafood")
  assert.equal(matchExpectedSupplier("OCEANMADE")?.canonicalName, "Ocean Made Seafood")
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

/**
 * Fixture builder. Fields not given are DERIVED so the fixture satisfies
 * checkSpendSnapshot (render() refuses inconsistent snapshots): budget from
 * forecast × target, leftToSpend from budget − used, revenueDaily cells
 * from the takings. Pass a field explicitly to override.
 */
function bucket(over: Partial<BucketSpendData> & { bucket: BucketSpendData["bucket"] }): BucketSpendData {
  const label = over.bucket === "BURLEIGH" ? "Burleigh" : "Currumbin (Beach House + Tea Garden)"
  const targetPct = over.targetPct ?? 27
  const spentToDate = over.spentToDate ?? 0
  const estimatedSpentToDate = over.estimatedSpentToDate ?? Math.max(spentToDate, spentToDate + (over.estimatedUninvoiced ?? 0))
  const estimatedUninvoiced = over.estimatedUninvoiced ?? Math.round((estimatedSpentToDate - spentToDate) * 100) / 100
  let budget = over.budget
  let forecastRevenue = over.forecastRevenue
  if (budget === undefined) budget = forecastRevenue == null ? null : (forecastRevenue * targetPct) / 100
  if (forecastRevenue === undefined) forecastRevenue = budget == null ? null : (budget * 100) / targetPct
  const leftToSpend = over.leftToSpend !== undefined ? over.leftToSpend : budget == null ? null : Math.round((budget - estimatedSpentToDate) * 100) / 100
  const paceStatus = over.paceStatus ?? (budget == null ? "no-forecast" : "on-track")
  const projectedEndOfWeek = over.projectedEndOfWeek ?? estimatedSpentToDate
  const revenueToDateExGst = over.revenueToDateExGst ?? null
  const revenueDaysReported = over.revenueDaysReported ?? (revenueToDateExGst == null ? 0 : 1)
  const dates = ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]
  const names = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]
  let running = 0
  const revenueDaily =
    over.revenueDaily ??
    dates.map((date, i) => {
      const reported = revenueToDateExGst != null && i < revenueDaysReported
      const amount = reported ? Math.round((revenueToDateExGst! / revenueDaysReported) * 100) / 100 : 0
      running += amount
      return { date, dayName: names[i], amount, cumulative: running, reported }
    })
  const lastRevenueDate =
    over.lastRevenueDate !== undefined ? over.lastRevenueDate : revenueToDateExGst == null ? null : dates[Math.max(0, revenueDaysReported - 1)]
  return {
    label,
    estimatedMissingSpend: 0,
    missingSpendBreakdown: [],
    spendProjectionMethod: "flat",
    revenueProjectionMethod: null,
    invoiceCount: 0,
    daily: [],
    suppliers: [],
    projectedRevenueExGst: null,
    todaySoFarExGst: null,
    revenueNotes: [],
    ...over,
    targetPct,
    spentToDate,
    estimatedSpentToDate,
    estimatedUninvoiced,
    budget,
    forecastRevenue,
    leftToSpend,
    paceStatus,
    projectedEndOfWeek,
    revenueToDateExGst,
    revenueDaysReported,
    revenueDaily,
    lastRevenueDate,
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
        estimatedSpentToDate: 7000,
        budget: 10000,
        leftToSpend: 3000,
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
        estimatedSpentToDate: 8500,
        budget: 8000,
        leftToSpend: -500,
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
    buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 9000, estimatedSpentToDate: 9000, budget: 10000, leftToSpend: 1000, paceStatus: "watch" })],
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
  assert.match(text, /pace: No forecast, projected full-week spend \$4,321 vs — budget\./)
  assert.doesNotMatch(text, /NaN|Infinity/)
})

test("takings line: revenue pace vs forecast and projected COGS % against live revenue", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        spentToDate: 7000,
        estimatedSpentToDate: 7000,
        budget: 10800,
        leftToSpend: 3800,
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
  assert.match(text, /Takings to Saturday close \$20,000 ex GST, pacing 88% of forecast\. On that pace the week finishes near 28\.0% COGS \(target 27%\)\./)
  assert.doesNotMatch(text, /so far today/)
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
        leftToSpend: 10800,
        revenueToDateExGst: 0,
        revenueDaysReported: 1,
        projectedRevenueExGst: null,
      }),
    ],
  })
  const { text } = render(snap)
  assert.match(text, /Takings to Wednesday close \$0 ex GST\. On that pace the week finishes near 25\.0% COGS/)
  assert.doesNotMatch(text, /\$-0|to  close/)
})

test("zero revenue everywhere: no COGS % and no NaN / Infinity leak", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        forecastRevenue: 0,
        spentToDate: 5000,
        projectedEndOfWeek: 5000,
        budget: 0,
        leftToSpend: -5000,
        revenueToDateExGst: 0,
        revenueDaysReported: 1,
        projectedRevenueExGst: 0,
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(text, /Takings to Wednesday close \$0 ex GST\.$/m)
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

test("rounding is to whole dollars; an impossible day-of-week is refused, not rendered", () => {
  const { subject, text } = render(
    snapshot({ dayOfWeek: 7, buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 1234.567, budget: 2000.4 })] })
  )
  assert.match(subject, /: 1 day to go$/)
  assert.match(text, /\$766 left to spend \(\$1,235 of \$2,000 used\)\./)
  assert.throws(
    () => render(snapshot({ dayOfWeek: 9, buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 1234.567, budget: 2000.4 })] })),
    (e: unknown) => e instanceof SpendSnapshotInconsistent && /dayOfWeek 9/.test(e.problems.join())
  )
})

test("left to spend is the grossed-up basis the /spend headline uses, with the uninvoiced share spelt out", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        spentToDate: 19582,
        estimatedSpentToDate: 23819,
        estimatedUninvoiced: 4237,
        budget: 26880,
        leftToSpend: 3061,
        projectedEndOfWeek: 26000,
        paceStatus: "watch",
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(
    text,
    /Currumbin \(Beach House \+ Tea Garden\): \$3,061 left to spend \(\$23,819 of \$26,880 used: \$19,582 invoiced plus about \$4,237 delivered but not invoiced yet\)\. That's about \$1,020\/day for the 3 days left\./
  )
  assert.doesNotMatch(text, /\$6,826/)
  assert.match(html, /\$3,061/)
  assert.doesNotMatch(html, /\$6,826/)
})

test("over budget with uninvoiced deliveries: parenthetical reads cleanly, no stray colon", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        spentToDate: 24500,
        estimatedSpentToDate: 28380,
        estimatedUninvoiced: 3880,
        budget: 26880,
        leftToSpend: -1500,
        projectedEndOfWeek: 31000,
        paceStatus: "over",
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(
    text,
    /Currumbin \(Beach House \+ Tea Garden\): \$28,380 spent of a \$26,880 budget \(\$24,500 invoiced plus about \$3,880 delivered but not invoiced yet\), \$1,500 OVER\. Hold all non-essential orders for the rest of the week\./
  )
  assert.doesNotMatch(text, /\(: /)
  assert.doesNotMatch(text, /used:/)
  assert.doesNotMatch(text, /left to spend/)
  // table: grossed-up spent, signed left, old-basis figure nowhere
  assert.match(html, /\$28,380/)
  assert.match(html, /-\$1,500/)
  assert.doesNotMatch(html, /\$2,380/)
})

test("zero uninvoiced: no 'plus about' clause and the parenthetical closes straight after 'used'", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        spentToDate: 6500,
        estimatedSpentToDate: 6500,
        estimatedUninvoiced: 0,
        budget: 10000,
        leftToSpend: 3500,
        paceStatus: "on-track",
      }),
    ],
  })
  const { text, html } = render(snap)
  assert.match(text, /Burleigh: \$3,500 left to spend \(\$6,500 of \$10,000 used\)\. That's about \$1,167\/day for the 3 days left\./)
  assert.doesNotMatch(text, /plus about/)
  assert.doesNotMatch(text, /not invoiced/)
  assert.doesNotMatch(html, /plus about/)
  assert.match(html, /Spent \(incl\. uninvoiced\)/)
})

test("over budget with zero uninvoiced: no empty parenthetical", () => {
  const snap = snapshot({
    buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 10400, estimatedSpentToDate: 10400, budget: 10000, leftToSpend: -400, paceStatus: "over" })],
  })
  const { text } = render(snap)
  assert.match(text, /Burleigh: \$10,400 spent of a \$10,000 budget, \$400 OVER\./)
  assert.doesNotMatch(text, /\(\)/)
  assert.doesNotMatch(text, /budget \(/)
})

test("last day with uninvoiced deliveries: detail inside the parens, then the whole-budget-for-today tail", () => {
  const snap = snapshot({
    dayOfWeek: 7,
    buckets: [
      bucket({
        bucket: "BURLEIGH",
        spentToDate: 8800,
        estimatedSpentToDate: 9100,
        estimatedUninvoiced: 300,
        budget: 10000,
        leftToSpend: 900,
        projectedEndOfWeek: 9800,
        paceStatus: "watch",
      }),
    ],
  })
  const { text } = render(snap)
  assert.match(
    text,
    /Burleigh: \$900 left to spend \(\$9,100 of \$10,000 used: \$8,800 invoiced plus about \$300 delivered but not invoiced yet\)\. That's the whole budget for today, the last day of the week\./
  )
  assert.doesNotMatch(text, /\/day/)
})

test("HTML Spent column: grossed-up figure when there is a budget, raw invoiced figure when there is none", () => {
  const withBudget = render(
    snapshot({ buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 7000, estimatedSpentToDate: 7900, estimatedUninvoiced: 900, budget: 10000, leftToSpend: 2100, projectedEndOfWeek: 8500 })] })
  )
  assert.match(withBudget.html, /\$7,900/)
  assert.match(withBudget.html, /\$2,100/)
  assert.doesNotMatch(withBudget.html, /\$3,000/)

  // No forecast loaded: estimatedSpentToDate is still computed upstream but
  // the table must show what was actually invoiced, not a $0 placeholder.
  const noBudget = render(snapshot({ buckets: [bucket({ bucket: "CURRUMBIN", spentToDate: 4321.49, estimatedSpentToDate: 4800 })] }))
  assert.match(noBudget.html, /\$4,321/)
  assert.doesNotMatch(noBudget.html, /\$4,800/)
  assert.match(noBudget.html, /—/) // Left column is the null dash
  assert.doesNotMatch(noBudget.text, /NaN|Infinity/)
})

test("nasty input: a grossed-up figure below invoices in hand is refused, never rendered", () => {
  // current-week clamps estimatedSpentToDate >= spentToDate, so this cannot
  // happen in prod; if it ever does the email must not go out.
  const snap = snapshot({
    buckets: [bucket({ bucket: "BURLEIGH", spentToDate: 7000, estimatedSpentToDate: 6900, estimatedUninvoiced: -100, budget: 10000, leftToSpend: 3100 })],
  })
  assert.throws(
    () => render(snap),
    (e: unknown) => e instanceof SpendSnapshotInconsistent && /below invoices in hand/.test(e.problems.join())
  )
})

test("the old 'remaining' basis can no longer leak: left + used must equal budget or the email is withheld", () => {
  // Exactly the 11 Oct 2026 fault: headline on one basis, "used" on another.
  const snap = snapshot({
    buckets: [bucket({ bucket: "CURRUMBIN", targetPct: 28, spentToDate: 17193, budget: 26880, leftToSpend: 9522 })],
  })
  assert.throws(() => render(snap), SpendSnapshotInconsistent)
  const { subject, text, html } = renderWithheld(snap, checkSpendSnapshot(snap))
  assert.match(subject, /numbers withheld, check needed$/)
  assert.match(text, /leftToSpend 9522 \+ used 17193 ≠ budget 26880/)
  assert.doesNotMatch(text, /left to spend \(/)
  assert.match(html, /Spend email withheld/)
})

test("takings that do not add up to the counted days are refused", () => {
  const b = bucket({ bucket: "BURLEIGH", budget: 10000, revenueToDateExGst: 20000, revenueDaysReported: 4 })
  b.revenueDaily[0].amount += 2141 // one day silently revised after the sum was taken
  assert.throws(() => render(snapshot({ buckets: [b] })), (e: unknown) => e instanceof SpendSnapshotInconsistent && /sum of reported days/.test(e.problems.join()))
})

test("a suspect day cannot also be counted", () => {
  const b = bucket({ bucket: "CURRUMBIN", targetPct: 28, budget: 26880, revenueToDateExGst: 59349, revenueDaysReported: 4 })
  b.revenueDaily[3].suspect = true
  assert.deepEqual(checkSpendSnapshot(snapshot({ buckets: [b] })).length, 1)
  b.revenueDaily[3].reported = false
  b.revenueDaily[3].amount = 0
  b.revenueToDateExGst = b.revenueDaily.filter((d) => d.reported).reduce((s, d) => s + d.amount, 0)
  b.revenueDaysReported = 3
  b.lastRevenueDate = "2026-09-25"
  assert.deepEqual(checkSpendSnapshot(snapshot({ buckets: [b] })), [])
})

test("revenue notes from the suspect-day guard are printed under the takings line", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        targetPct: 28,
        budget: 26880,
        revenueToDateExGst: 36040,
        revenueDaysReported: 3,
        revenueNotes: ["Sat 10-10 shows $2,141 against a usual $23,100, so it looks incomplete and is left out of the pace."],
      }),
    ],
  })
  const { text } = render(snap)
  assert.match(text, /Takings to Friday close \$36,040 ex GST\..*Sat 10-10 shows \$2,141 against a usual \$23,100, so it looks incomplete and is left out of the pace\./)
})

test("today's intraday Square figure is shown as so-far and kept out of the pace", () => {
  const snap = snapshot({
    buckets: [
      bucket({
        bucket: "CURRUMBIN",
        spentToDate: 17193,
        estimatedSpentToDate: 19000,
        estimatedUninvoiced: 1807,
        budget: 26880,
        leftToSpend: 7880,
        targetPct: 28,
        forecastRevenue: 96000,
        projectedEndOfWeek: 25945,
        paceStatus: "on-track",
        revenueToDateExGst: 59349,
        revenueDaysReported: 4,
        lastRevenueDate: "2026-10-10",
        projectedRevenueExGst: 91000,
        revenueProjectionMethod: "weighted",
        todaySoFarExGst: 2141,
      }),
    ],
  })
  const { text } = render(snap)
  assert.match(text, /Takings to Saturday close \$59,349 ex GST, pacing 95% of forecast\./)
  assert.match(text, /Plus \$2,141 so far today, not in the pace yet\./)
  // the so-far figure must not be folded into the takings
  assert.doesNotMatch(text, /\$61,490/)
})

test("isCompletedSalesDay: today's API row is intraday, an EMAIL row or any earlier day is final", () => {
  assert.equal(isCompletedSalesDay("2026-10-11", "2026-10-11", "API"), false)
  assert.equal(isCompletedSalesDay("2026-10-11", "2026-10-11", "EMAIL"), true)
  assert.equal(isCompletedSalesDay("2026-10-10", "2026-10-11", "API"), true)
  assert.equal(isCompletedSalesDay("2026-10-12", "2026-10-11", "API"), true)
})

// ------------------------------------------------ suspect-day guard

test("suspectRevenueDay: Sunday 08:30 partial ($2,141 vs a $27k Sunday) is suspect, a soft Thursday is not", () => {
  assert.equal(suspectRevenueDay(2141, 27000), true)
  assert.equal(suspectRevenueDay(9547, 11000), false) // 87% of normal: a real quiet day
  assert.equal(suspectRevenueDay(10000, 26000), true) // 38%: still suspect
  assert.equal(suspectRevenueDay(10400, 26000), false) // 40% exactly: counted
  assert.equal(suspectRevenueDay(300, 1500), false) // tiny weekday average: no judgement
  assert.equal(suspectRevenueDay(0, null), false) // no history: no judgement
})

// ------------------------------------------------ invoice arrival lag

test("arrivalCompleteness: share of spend dated to today that had arrived by this point", () => {
  const DAY = 24 * 60 * 60 * 1000
  const TEN_H = 10 * 60 * 60 * 1000
  const wk = Date.UTC(2026, 8, 23) // Wed 23 Sep, AEST date at UTC midnight
  // createdAt as a real instant for "AEST day d, hour h" of that week
  const at = (d: number, h: number) => wk + d * DAY + h * 60 * 60 * 1000 - TEN_H
  const rows = []
  // 15 invoices dated Wed..Mon, $100 each, 12 arrived same day, 3 arrive Tuesday
  for (let i = 0; i < 12; i++) rows.push({ weekStartMs: wk, invoiceDateMs: wk + (i % 6) * DAY, createdAtMs: at(i % 6, 15), amount: 100 })
  for (let i = 0; i < 3; i++) rows.push({ weekStartMs: wk, invoiceDateMs: wk + 5 * DAY, createdAtMs: at(6, 9), amount: 100 })
  // A Tuesday-dated invoice is outside "through Monday" and must be ignored
  rows.push({ weekStartMs: wk, invoiceDateMs: wk + 6 * DAY, createdAtMs: at(6, 9), amount: 5000 })
  const monday6pm = 5 * DAY + 18 * 60 * 60 * 1000
  assert.equal(arrivalCompleteness(rows, monday6pm, 6), 0.8)
  // By Tuesday night everything dated through Monday is in
  assert.equal(arrivalCompleteness(rows, 6 * DAY + 20 * 60 * 60 * 1000, 6), 1)
  // Too little history: no estimate
  assert.equal(arrivalCompleteness(rows.slice(0, 5), monday6pm, 6), null)
})

// --------------------------------------------------- ex-GST invoice amount
// Now exported: the Friday digest's provisional COGS (invoices in hand when
// Louise's sheet for the week is missing) must read each invoice the same
// way the live tracker does.

import { exGstInvoiceAmount } from "./gst"

test("exGstInvoiceAmount: a parsed subtotal wins outright, even when the totals disagree with it", () => {
  // Fermex, 4 x Anchor butter 5kg: subtotal line found by the parser
  assert.equal(exGstInvoiceAmount({ subtotal: "212.00", total: "233.20", gst: "21.20" }), 212)
  assert.equal(exGstInvoiceAmount({ subtotal: "212.00", total: "999.99", gst: null }), 212)
})

test("exGstInvoiceAmount: no subtotal line strips GST from the inc-GST total, unless the invoice says GST is zero", () => {
  const stripped = exGstInvoiceAmount({ subtotal: null, total: "233.20", gst: "21.20" })
  assert.ok(Math.abs(stripped - 212) < 1e-9, `233.20 / 1.1 = 212, got ${stripped}`)
  // GST-free produce run (fresh fruit and veg): the total already IS ex GST
  assert.equal(exGstInvoiceAmount({ subtotal: null, total: "95.40", gst: "0.00" }), 95.4)
  assert.equal(exGstInvoiceAmount({ subtotal: null, total: "95.40", gst: "0" }), 95.4)
  // GST unknown: assume it is in there
  const unknown = exGstInvoiceAmount({ subtotal: null, total: "95.40", gst: null })
  assert.ok(Math.abs(unknown - 95.4 / 1.1) < 1e-9)
})

test("exGstInvoiceAmount: credit notes stay negative so they net off, and an empty invoice is $0 not NaN", () => {
  // Global Food & Wine credit, stored negative by the parser
  assert.equal(exGstInvoiceAmount({ subtotal: "-1417.27", total: "-1559.00", gst: "-141.73" }), -1417.27)
  const creditNoSubtotal = exGstInvoiceAmount({ subtotal: null, total: "-1559.00", gst: "-141.73" })
  assert.ok(Math.abs(creditNoSubtotal - -1417.272727) < 1e-5)
  assert.equal(exGstInvoiceAmount({ subtotal: null, total: null, gst: null }), 0)
  assert.equal(exGstInvoiceAmount({ subtotal: null, total: null, gst: "0" }), 0)
  assert.equal(exGstInvoiceAmount({ subtotal: "0", total: "0", gst: "0" }), 0)
})

test("Currumbin seafood coverage: Fish Factory is critical and near-daily, Ocean Made weekly and soft", () => {
  const ff = matchExpectedSupplier("The Fish Factory")
  assert.equal(ff?.critical, true)
  assert.equal(ff?.expectedIntervalDays, 2)
  const om = matchExpectedSupplier("Ocean Made")
  assert.equal(om?.canonicalName, "Ocean Made Seafood")
  assert.equal(om?.critical, false)
  assert.equal(om?.expectedIntervalDays, 7)
  assert.equal(om?.category, "seafood")
  // Tasman, Fish Factory and Ocean Made are three distinct Currumbin seafood rows
  assert.equal(matchExpectedSupplier("Tasman Star Seafood")?.canonicalName, "Tasman Distribution")
  assert.notEqual(matchExpectedSupplier("Fish Factory")?.canonicalName, matchExpectedSupplier("Oceanmade")?.canonicalName)
})

// --------------------------------------------------- end-of-week projection
// The Sunday 18 Oct 2026 email read Currumbin "On track, 24.3% COGS" while
// the same email counted $5,900 delivered-but-uninvoiced in "left to spend":
// the pace divided invoices in hand only. Projection now shares the
// grossed-up basis.

import { projectEndOfWeekSpend } from "./projection"

test("projection is taken from the grossed-up spend, not invoices in hand", () => {
  // Wed..Sat are 65% of a normal week's deliveries
  const share = [0.2, 0.15, 0.15, 0.15, 0.2, 0.1, 0.05]
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 21290, spendShare: share, daysThroughToday: 4, usualWeekSpend: null, estimatedMissing: 0 })
  assert.equal(r.method, "weighted")
  assert.equal(r.projectedEndOfWeek, Math.round((21290 / 0.65) * 100) / 100)
  // The old basis (invoices in hand, 15389) would have read on track against a 26740 budget
  assert.ok(r.projectedEndOfWeek > 26740 * 1.05)
})

test("projection: missing-supplier weekly average is added in full, never scaled", () => {
  const share = [0.25, 0.25, 0.25, 0.25, 0, 0, 0]
  const r = projectEndOfWeekSpend({ estimatedSpentToDate: 1000, spendShare: share, daysThroughToday: 2, usualWeekSpend: null, estimatedMissing: 300 })
  assert.equal(r.projectedEndOfWeek, 2000 + 300)
})

test("projection falls back to flat ÷days×7 without history or with a thin elapsed share", () => {
  assert.deepEqual(
    projectEndOfWeekSpend({ estimatedSpentToDate: 700, spendShare: null, daysThroughToday: 2, usualWeekSpend: null, estimatedMissing: 0 }),
    { projectedEndOfWeek: 2450, method: "flat" }
  )
  // Only 5% of a week lands on Wednesday: too thin to divide by
  const share = [0.05, 0.15, 0.2, 0.2, 0.2, 0.15, 0.05]
  assert.equal(projectEndOfWeekSpend({ estimatedSpentToDate: 100, spendShare: share, daysThroughToday: 1, usualWeekSpend: null, estimatedMissing: 0 }).method, "flat")
})

test("projection never falls below the spend already counted", () => {
  const share = [0.2, 0.15, 0.15, 0.15, 0.2, 0.1, 0.05]
  for (const spent of [0, 1, 999.99, 50000]) {
    const r = projectEndOfWeekSpend({ estimatedSpentToDate: spent, spendShare: share, daysThroughToday: 7, usualWeekSpend: null, estimatedMissing: 0 })
    assert.ok(r.projectedEndOfWeek + 0.01 >= spent)
  }
})

test("guard: a projection below the grossed-up spend to date is refused", () => {
  const b = bucket({ bucket: "CURRUMBIN", spentToDate: 8000, estimatedSpentToDate: 9000, estimatedUninvoiced: 1000, budget: 12000, forecastRevenue: 40000, leftToSpend: 3000, projectedEndOfWeek: 8500, paceStatus: "on-track" })
  assert.throws(() => render(snapshot({ buckets: [b] })), (e: unknown) => e instanceof SpendSnapshotInconsistent && /below spend to date/.test(e.problems.join()))
})
