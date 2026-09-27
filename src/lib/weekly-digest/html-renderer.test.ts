import { test } from "node:test"
import assert from "node:assert/strict"
import { renderDigestHtml, renderDigestText, seoLines, type DigestNarrative } from "./html-renderer"
import type { WeeklyDigestSnapshot } from "./aggregator"

// A realistic closed week: Wed 16 Sep -> Tue 22 Sep 2026. Everything here is
// hand-built so the renderer can be exercised with no database.

const narrative: DigestNarrative = {
  headline: "Burleigh down 7% on quieter weekday mornings; Beach House pastry over band.",
  sectionNotes: { sales: "Burleigh soft, Currumbin flat.", wages: "BH pastry 3.4% vs 3.0% cap." },
  actionItems: ["Re-quote olive oil: Bidfood up 18% since April", "Call Stoddart re Meiko warranty"],
}

function snapshot(over: Partial<WeeklyDigestSnapshot> = {}): WeeklyDigestSnapshot {
  return {
    weekStart: "2026-09-16",
    weekEnd: "2026-09-22",
    labourWeekStart: "2026-09-16",
    labourWeekEnd: "2026-09-22",
    reviews: {
      totalCount: 3,
      averageRating: 4.3333,
      perVenue: [
        {
          venue: "Burleigh",
          count: 2,
          averageThisWeek: 4,
          aggregateRating: 4.7,
          aggregateTotalRatings: 1234,
          aggregateAsAt: "2026-09-21",
          sentimentBreakdown: { POSITIVE: 2 },
          topThemes: ["pastry"],
          staffMentioned: [],
          notable: [],
        },
        {
          venue: "Beach House",
          count: 1,
          averageThisWeek: 5,
          aggregateRating: 4.6,
          aggregateTotalRatings: 2100,
          aggregateAsAt: "2026-09-01",
          sentimentBreakdown: {},
          topThemes: [],
          staffMentioned: [],
          notable: [],
        },
        {
          venue: "Tea Garden",
          count: 0,
          averageThisWeek: null,
          aggregateRating: null,
          aggregateTotalRatings: null,
          sentimentBreakdown: {},
          topThemes: [],
          staffMentioned: [],
          notable: [],
        },
      ],
      overallNegatives: [
        { venue: "Burleigh", rating: 2, author: "Sam <T>", summary: "Cold coffee", text: "Latte was lukewarm & slow" },
      ],
      responseWatch: {
        windowDays: 28,
        negativesTotal: 3,
        negativesAnswered: 1,
        medianResponseDays: 2.5,
        unanswered: [{ venue: "Burleigh", rating: 2, author: null, summary: "Cold coffee", daysWaiting: 4 }],
      },
    },
    priceSpikes: {
      count: 3,
      produce: [
        {
          ingredient: "Avocado",
          supplier: "Provedores",
          oldPrice: 1.8,
          newPrice: 2.4,
          unit: "ea",
          changePct: 33.333,
          weeklyImpactDollars: 42.5,
          isNew: true,
        },
      ],
      stable: [
        {
          ingredient: "Anchor butter 5kg",
          supplier: "Fermex",
          oldPrice: 0.0123,
          newPrice: 0.0141,
          unit: "g",
          changePct: 14.634,
          weeklyImpactDollars: 88.2,
          isNew: false,
        },
        {
          ingredient: "Bridor croissant",
          supplier: "Eustralis",
          oldPrice: 1.5,
          newPrice: 1.35,
          unit: "piece",
          changePct: -10,
          weeklyImpactDollars: -27,
          isNew: false,
        },
      ],
      produceTotal: 1,
      stableTotal: 5,
    },
    wastage: {
      totalDollarsThisWeek: 412.5,
      totalDollarsLastWeek: 0,
      wowChangePct: null,
      perVenue: [
        { venue: "Burleigh", total: 300 },
        { venue: "Beach House", total: 112.5 },
        { venue: "Tea Garden", total: 0 },
      ],
      topItems: [
        { name: "Ham & Cheese Croissant", venue: "Burleigh", occurrences: 4, totalDollars: 96.4, totalQty: 22, unit: "ea", reason: "END_OF_DAY" },
      ],
      recurringOffenders: [{ name: "Ham & Cheese Croissant", daysSeen: 4, venues: ["Burleigh"] }],
    },
    cogs: {
      weekStartWed: "2026-09-16",
      perVenue: [
        {
          venue: "Burleigh",
          revenueExGst: 61000,
          totalCogs: 17812,
          cogsPct: 29.2,
          targetPct: 28,
          delta: 1.2,
          biggestCategory: { name: "Food", dollars: 15000 },
          nonFoodFoh: 2812,
        },
        {
          venue: "Beach House + Tea Garden",
          revenueExGst: 95000,
          totalCogs: 27000,
          cogsPct: 28.4,
          targetPct: 29,
          delta: -0.6,
          biggestCategory: { name: "Food", dollars: 22000 },
          nonFoodFoh: 5000,
          note: "BH $80,000 + TG $15,000",
        },
        {
          venue: "Beach House (BH only, as-reported)",
          revenueExGst: 80000,
          totalCogs: 27000,
          cogsPct: 33.75,
          targetPct: 29,
          delta: 4.75,
          biggestCategory: null,
          nonFoodFoh: 5000,
          note: "Reference only",
        },
      ],
    },
    labour: {
      weekStartWed: "2026-09-16",
      perVenue: [
        {
          venue: "Burleigh",
          revenueExGst: 61000,
          grossWages: 27450,
          overallPct: 45,
          exAdminPct: 41.2,
          departmentGroups: [
            { label: "Chefs + KP", dollars: 7000, pct: 11.48, target: { min: 11.5, max: 12 }, status: "ok" },
            { label: "FOH + Barista", dollars: 13000, pct: 21.31, target: { min: 20.5, max: 21 }, status: "amber" },
            { label: "Pastry", dollars: 3700, pct: 6.07, target: { min: 4.75, max: 5.25 }, status: "red" },
          ],
          recoded: true,
        },
        { venue: "Beach House", revenueExGst: null, grossWages: 0, overallPct: null, exAdminPct: null, departmentGroups: [] },
        {
          venue: "Tea Garden",
          revenueExGst: 15000,
          grossWages: 4500,
          overallPct: 30,
          exAdminPct: null,
          departmentGroups: [{ label: "FOH (incl. Barista)", dollars: 4500, pct: 30, target: null, status: "no-target" }],
        },
      ],
    },
    topSellers: {
      perVenue: [
        {
          venue: "Burleigh",
          byQuantity: [
            { name: "Plain croissant", qty: 812, revenue: 5684 },
            { name: "Ham & Cheese Croissant", qty: 300, revenue: 3000 },
          ],
          byRevenue: [{ name: "Plain croissant", qty: 812, revenue: 5684 }],
          risers: ["Ham & Cheese Croissant"],
        },
        { venue: "Beach House", byQuantity: [], byRevenue: [], risers: [] },
        { venue: "Tea Garden", byQuantity: [], byRevenue: [], risers: [] },
      ],
    },
    sales: {
      totalThisWeek: 156000,
      totalLastWeek: 160000,
      wowChangePct: -2.5,
      perVenue: [
        { venue: "Burleigh", thisWeek: 61000, lastWeek: 65600, wowPct: -7.0122 },
        { venue: "Beach House", thisWeek: 80000, lastWeek: 79000, wowPct: 1.2658 },
        { venue: "Tea Garden", thisWeek: 15000, lastWeek: 0, wowPct: null },
      ],
    },
    operations: {
      perVenue: [
        {
          venue: "Burleigh",
          runsCompleted: 21,
          overdueAlerts: 0,
          tempReadings: 84,
          tempBreaches: [
            { template: "Cafe Kitchen - Open", label: "Display fridge", tempCelsius: 7.4, hotCheck: false, runDate: "2026-09-18" },
          ],
        },
        { venue: "Beach House", runsCompleted: 30, overdueAlerts: 2, tempReadings: 120, tempBreaches: [] },
        { venue: "Tea Garden", runsCompleted: 0, overdueAlerts: 0, tempReadings: 0, tempBreaches: [] },
      ],
      cooling: {
        total: 5,
        breaches: [{ venue: "Beach House", itemName: "Pumpkin soup", reason: "6h temp 7.0°C (target ≤21°C)", startedAt: "2026-09-19T05:00:00.000Z" }],
      },
    },
    spendPacing: {
      weekStartWed: "2026-09-23",
      weekEndTue: "2026-09-29",
      dayOfWeek: 3,
      daysElapsedFull: 2,
      buckets: [
        {
          bucket: "BURLEIGH",
          label: "Burleigh",
          forecastRevenue: 60000,
          targetPct: 28,
          budget: 16800,
          spentToDate: 5000,
          estimatedMissingSpend: 400,
          projectedEndOfWeek: 17500,
          remaining: 11800,
          paceStatus: "watch",
        },
        {
          bucket: "CURRUMBIN",
          label: "Currumbin",
          forecastRevenue: null,
          targetPct: 29,
          budget: null,
          spentToDate: 3000,
          estimatedMissingSpend: 0,
          projectedEndOfWeek: 10500,
          remaining: null,
          paceStatus: "no-forecast",
        },
      ],
      coverageProblems: [
        { canonicalName: "Son of a Bunn", status: "overdue", daysSinceLast: 12, expectedIntervalDays: 7, note: "meats" },
        { canonicalName: "Alsco", status: "missing", daysSinceLast: null, expectedIntervalDays: 7 },
      ],
    },
    commitments: {
      overdueOneOffs: [
        {
          promise: "Send Fermex the butter quote",
          saidBy: "CHLOE",
          agreedOn: "2026-09-01",
          effectiveDueOn: "2026-09-15",
          wasRescheduled: true,
          missedReason: "waiting on Trent",
          daysOverdue: 7,
        },
      ],
      standingConcerns: [{ title: "Sunday stock walk", consecutiveMissedWeeks: 3, lastNote: null }],
      overdueMeetingActions: [],
      openCount: 4,
      doneLast7Days: 2,
    },
    maintenance: {
      openCount: 2,
      safetyCount: 1,
      unbookedCount: 1,
      fixedLast7Days: 3,
      openIssues: [
        {
          venue: "Burleigh",
          machine: "Meiko dishwasher, Takeaway",
          slug: "B07",
          title: "Not draining",
          daysOpen: 9,
          isSafety: false,
          bookedFor: null,
          underWarranty: true,
          warrantyProvider: "Stoddart",
        },
        {
          venue: "Beach House",
          machine: null,
          slug: null,
          title: "Gas smell at the fryer",
          daysOpen: 0,
          isSafety: true,
          bookedFor: "2026-09-24",
          underWarranty: false,
          warrantyProvider: null,
        },
      ],
      warrantiesEnding: [
        {
          venue: "Burleigh",
          machine: "Turbo Air underbench fridge",
          slug: "B12",
          endsOn: "2026-10-30",
          daysLeft: 1,
          warrantyProvider: "CKC",
          hasOpenIssue: true,
        },
      ],
    },
    seo: {
      available: true,
      pushedOn: "2026-09-25",
      pushAgeDays: 0,
      searchConsole: {
        readOn: "2026-09-01",
        windowEnd: "2026-08-31",
        clicks3mo: 9500,
        previous: { windowEnd: "2026-05-31", clicks3mo: 8000 },
        pagesIndexed: 41,
        pagesNotIndexed: 3,
        changePct: 18.75,
      },
      ratings: [
        { label: "Beach House", reviewCount: 2100, exact: 4.5537, displayed: 4.6, oneStarsToDrop: 1, fiveStarsToRise: 250 },
        { label: "Burleigh", reviewCount: 1234, exact: 4.72, displayed: 4.7, oneStarsToDrop: 12, fiveStarsToRise: null },
      ],
      posts: { windowDays: 7, published: [{ label: "Beach House", count: 2 }, { label: "Burleigh", count: 1 }], draftsWaiting: 1 },
    },
    ...over,
  }
}

// ------------------------------------------------------------- date range

test("header date range: same month collapses, cross-month and cross-year spell both months", () => {
  assert.ok(renderDigestText(snapshot(), narrative).includes("16–22 September 2026"))
  const crossMonth = renderDigestText(snapshot({ weekStart: "2026-09-30", weekEnd: "2026-10-06" }), narrative)
  assert.ok(crossMonth.includes("30 September – 6 October 2026"))
  const crossYear = renderDigestText(snapshot({ weekStart: "2026-12-30", weekEnd: "2027-01-05" }), narrative)
  assert.ok(crossYear.includes("30 December – 5 January 2027"))
})

// ----------------------------------------------------- percent formatting

test("week-on-week percentages are signed and a zero baseline shows as no comparison", () => {
  const text = renderDigestText(snapshot(), narrative)
  assert.match(text, /Burleigh\s+\$61,000\s+\(-7\.0%\)/)
  assert.match(text, /Beach House\s+\$80,000\s+\(\+1\.3%\)/)
  assert.match(text, /Tea Garden\s+\$15,000\s+\(—\)/, "null WoW (last week $0) prints a placeholder, never NaN or Infinity")
  assert.ok(text.includes("WASTAGE  $413 this week (no comparison)"))
  assert.ok(!/NaN|Infinity/.test(text))
})

test("tiles: sales WoW text, wastage no comparison, reviews average", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("-2.5% vs last week"))
  assert.ok(html.includes("no comparison"))
  assert.ok(html.includes("4.3★ avg"))
  assert.ok(html.includes("$156,000"))
  assert.ok(!/NaN|Infinity|undefined/.test(html))
})

test("a positive sales week prints a plus sign", () => {
  const html = renderDigestHtml(
    snapshot({ sales: { totalThisWeek: 100, totalLastWeek: 80, wowChangePct: 25, perVenue: [] } }),
    narrative
  )
  assert.ok(html.includes("+25.0% vs last week"))
})

// ----------------------------------------------------------- wages / cogs

test("wages section renders bands, statuses, ex-admin line and skips venues with no groups", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("11.50–12.00%"))
  assert.ok(html.includes("On target"))
  assert.ok(html.includes("Close"))
  assert.ok(html.includes("Off target"))
  assert.ok(html.includes("No target"))
  assert.ok(html.includes("Overall 45.00% · ex admin 41.20% · $27,450 wages on $61,000 revenue"))
  assert.ok(html.includes("Department splits are rebuilt from Deputy worked areas"))
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("Burleigh, overall 45.0% (ex admin 41.2%)"))
  assert.ok(!text.includes("Beach House, overall"), "venue with no department groups is skipped")
  assert.ok(text.includes("Tea Garden, overall 30.0%"))
})

test("wages section says so when nothing is uploaded", () => {
  const html = renderDigestHtml(
    snapshot({ labour: { weekStartWed: null, perVenue: [{ venue: "Burleigh", revenueExGst: null, grossWages: 0, overallPct: null, exAdminPct: null, departmentGroups: [] }] } }),
    narrative
  )
  assert.ok(html.includes("No labour data uploaded for this week."))
})

test("COGS delta pills and the BH-only reference row do not pull the tile average", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("+1.20%"))
  assert.ok(html.includes("-0.60%"))
  // avg of Burleigh 29.2 and combined 28.4 = 28.8, reference row 33.75 excluded
  assert.ok(html.includes(">28.8%<"))
  assert.ok(!html.includes(">30.5%<"))
})

// ------------------------------------------------------------- price alerts

test("price alerts: per-base-unit prices, signed change, savings, and 'top N of M'", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("$0.0123/g"))
  assert.ok(html.includes("$0.0141/g"))
  assert.ok(html.includes("+14.6%"))
  assert.ok(html.includes("-10.0%"))
  assert.ok(html.includes("+$88.20/wk"))
  assert.ok(html.includes("-$27.00/wk"))
  assert.ok(html.includes("top 2 of 5"))
  assert.ok(!html.includes("top 1 of 1"), "no 'top N of N' when the list is complete")
  assert.ok(html.includes(">new<"), "isNew badge")
})

test("no open alerts renders the quiet line", () => {
  const html = renderDigestHtml(
    snapshot({ priceSpikes: { count: 0, produce: [], stable: [], produceTotal: 0, stableTotal: 0 } }),
    narrative
  )
  assert.ok(html.includes("No open price alerts."))
})

// ------------------------------------------------------------- top sellers

test("top sellers render per venue with risers; empty venues are dropped", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("Plain croissant"))
  assert.ok(html.includes("new in top 10: Ham &amp; Cheese Croissant"))
  const none = renderDigestHtml(
    snapshot({ topSellers: { perVenue: [{ venue: "Burleigh", byQuantity: [], byRevenue: [], risers: [] }] } }),
    narrative
  )
  assert.ok(none.includes("No POS sales data synced for this week."))
})

// ------------------------------------------------------------ operations

test("operations: temp and cooling breaches are listed with the rule they broke", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("7.4°C"))
  assert.ok(html.includes("cold ≤5°C required"))
  assert.ok(html.includes("Cooling-log breaches"))
  assert.ok(html.includes("5 cooling logs started this week · 1 breach."))
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("! Burleigh: Display fridge: 7.4°C (≤5°C reqd) 2026-09-18"))
  assert.ok(text.includes("Cooling breaches: 1 of 5 logs"))
  assert.match(text, /Burleigh\s+21 runs · 0 overdue · 84 temps · 1 breach$/m)
  assert.match(text, /Beach House\s+30 runs · 2 overdue · 120 temps · 0 breaches$/m)
})

// ---------------------------------------------------------------- reviews

test("reviews: stale rating note only when the aggregate is over 10 days old", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  // Beach House as-at 1 Sep vs week end 22 Sep = 21 days -> note
  assert.match(html, /as at 1 Sep/)
  // Burleigh as-at 21 Sep -> no note
  assert.doesNotMatch(html, /as at 21 Sep/)
  assert.ok(html.includes("1 of 3 negatives in the last 28 days have a reply · median 2.5 days to respond"))
  assert.ok(html.includes("Still waiting: Burleigh · 2★ · Anonymous · 4d"))
  assert.ok(html.includes("Sam &lt;T&gt;"), "author is escaped")
})

test("reviews text block", () => {
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("Reply watch: 1/3 negatives answered (last 28d), median 2.5d"))
  assert.ok(text.includes("Still waiting: Burleigh 2★ Anonymous (4d)"))
  assert.match(text, /Tea Garden\s+—\s+0 new/)
})

// ------------------------------------------------------- commitments/equipment

test("commitments: overdue promises, moved-once note and slipping standing items", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("Send Fermex the butter quote"))
  assert.ok(html.includes("Moved once: waiting on Trent"))
  assert.ok(html.includes(">Chloe<"), "saidBy is title-cased")
  assert.ok(html.includes("7d overdue"))
  assert.ok(html.includes("3 weeks running"))
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("! Send Fermex the butter quote (CHLOE), due 2026-09-15, 7d overdue (already moved once)"))
  assert.ok(text.includes("! Sunday stock walk, missed 3 weeks running"))
})

test("commitments all clear wording", () => {
  const clear = snapshot({
    commitments: { overdueOneOffs: [], standingConcerns: [], overdueMeetingActions: [], openCount: 2, doneLast7Days: 1 },
  })
  assert.ok(renderDigestHtml(clear, narrative).includes("Nothing overdue. 2 open promises on track, 1 closed this week."))
  const one = snapshot({
    commitments: { overdueOneOffs: [], standingConcerns: [], overdueMeetingActions: [], openCount: 1, doneLast7Days: 0 },
  })
  assert.ok(renderDigestHtml(one, narrative).includes("Nothing overdue. 1 open promise on track."))
  assert.ok(!renderDigestText(clear, narrative).includes("COMMITMENTS"))
})

test("equipment: safety badge, nobody called, warranty-first, days left", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("SAFETY"))
  assert.ok(html.includes("Nobody called yet"))
  assert.ok(html.includes("Trade booked 2026-09-24"))
  assert.ok(html.includes("Under warranty, call Stoddart first"))
  assert.ok(html.includes("Open faults (2, 1 with no trade booked)"))
  assert.ok(html.includes("<strong>1 day left</strong>"))
  assert.ok(html.includes("has an open fault, claim it now"))
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("EQUIPMENT  2 open faults, 1 with no trade booked"))
  assert.ok(text.includes("! Burleigh: Not draining (Meiko dishwasher, Takeaway), 9d open, nobody called yet, under warranty"))
  assert.ok(text.includes("! Beach House: [SAFETY] Gas smell at the fryer, 0d open, trade booked 2026-09-24"))
  assert.ok(text.includes("Warranty ending: Turbo Air underbench fridge (B12, Burleigh) on 2026-10-30, 1d left, has an open fault"))
})

test("equipment all clear wording, and stored digests without the block still render", () => {
  const clear = snapshot({
    maintenance: { openCount: 0, safetyCount: 0, unbookedCount: 0, fixedLast7Days: 3, openIssues: [], warrantiesEnding: [] },
  })
  assert.ok(renderDigestHtml(clear, narrative).includes("No open faults. 3 fixed this week."))
  const legacy = snapshot({ maintenance: undefined as unknown as WeeklyDigestSnapshot["maintenance"], seo: undefined as unknown as WeeklyDigestSnapshot["seo"] })
  const html = renderDigestHtml(legacy, narrative)
  assert.ok(!html.includes("Equipment"))
  assert.ok(!html.includes("Search and Google"))
  assert.ok(!renderDigestText(legacy, narrative).includes("SEARCH AND GOOGLE"))
})

// ---------------------------------------------------------------- SEO lines

test("seoLines: unavailable, and the full three-line read", () => {
  assert.deepEqual(seoLines(undefined), [])
  assert.deepEqual(seoLines({ available: false, pushedOn: null, pushAgeDays: null, searchConsole: null, ratings: [], posts: null }), [
    "No numbers received from the SEO engine yet, so nothing to show here this week.",
  ])
  const lines = seoLines(snapshot().seo)
  assert.equal(lines.length, 3)
  assert.ok(lines[0].includes("9.5K clicks in the 3 months to 31 Aug"))
  assert.ok(lines[0].includes("up 19% on the 31 May reading (8.0K)"))
  assert.ok(lines[0].includes("41 pages indexed, 3 not"))
  assert.ok(lines[1].includes("Beach House 4.5537, shows 4.6 (1 one-star from 4.5, 250 straight five-stars to 4.7)"))
  assert.ok(lines[1].includes("Burleigh 4.7200, shows 4.7 (12 one-stars from 4.6)"))
  assert.ok(lines[2].includes("last 7 days: 3 (Beach House 2, Burleigh 1)"))
  assert.ok(lines[2].includes("1 draft is waiting"))
})

test("seoLines: stale-push warning and plural drafts", () => {
  const seo = snapshot().seo
  const lines = seoLines({
    ...seo,
    pushedOn: "2026-09-20",
    pushAgeDays: 5,
    searchConsole: null,
    posts: { windowDays: 7, published: [], draftsWaiting: 2 },
  })
  assert.equal(lines.length, 3)
  assert.ok(lines[1].includes("published in the last 7 days: 0."))
  assert.ok(lines[1].includes("2 drafts are waiting"))
  // ICU prints September as "Sept" in en-AU, so match either spelling.
  assert.match(lines[2], /^Heads up: the SEO engine last sent ratings and posts on 20 Sept?, 5 days ago/)
})

// --------------------------------------------------------- footer + actions

test("footer names the trading week and the labour week; actions are numbered in text", () => {
  const html = renderDigestHtml(snapshot(), narrative)
  assert.ok(html.includes("Labour &amp; COGS reflect Wed 2026-09-16 → Tue 2026-09-22."))
  const noLabour = renderDigestHtml(snapshot({ labourWeekStart: null, labourWeekEnd: null }), narrative)
  assert.ok(noLabour.includes("Labour &amp; COGS not yet uploaded for this week."))
  const text = renderDigestText(snapshot(), narrative)
  assert.ok(text.includes("  1. Re-quote olive oil: Bidfood up 18% since April"))
  assert.ok(text.includes("  2. Call Stoddart re Meiko warranty"))
  assert.ok(text.endsWith("Open dashboard: https://kitchen.tarte.com.au/dashboard"))
})

test("headline and section notes are escaped into the HTML", () => {
  const html = renderDigestHtml(snapshot(), { ...narrative, headline: "Fish & chips <b>up</b>" })
  assert.ok(html.includes("Fish &amp; chips &lt;b&gt;up&lt;/b&gt;"))
  assert.ok(html.includes("Burleigh soft, Currumbin flat."))
})
