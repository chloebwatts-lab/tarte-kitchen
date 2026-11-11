import { test, mock } from "node:test"
import assert from "node:assert/strict"
import {
  labourFromPayWeek,
  parsePayWeekFigures,
  PAYWEEK_CUTOVER,
  PAYWEEK_ORG_FOR_VENUE,
  PAYWEEK_ORGS,
  PAYWEEK_VENUES,
  type PostedTotals,
} from "./payweek-figures"
import { PAY_RUN_ORG_VENUES, postedPayRunTotals, sumPostedForWeek } from "./payruns"
import { lastCompletedTarteWeek } from "@/lib/dates"
import type { ProcessedPayRun } from "@/lib/xero/client"

// Edge cases for the 11 Nov 2026 switch of the Friday digest's wages to the
// Xero pay runs. Every figure here is made up: the repo is public.

const W = "2026-11-04"
const WED = new Date(`${W}T00:00:00.000Z`)
const DAY = 86400000

function venue(revenue: number, total: number, d: [number, number, number, number, number]) {
  return {
    revenue,
    wages: { total, exAdmin: total - d[3], exAdminLeaveBackpay: total - d[3], admin: d[3], leaveBackpay: 0 },
    depts: {
      chefsKp: { dollars: d[0], band: [11.5, 12] },
      fohBarista: { dollars: d[1], band: [20.5, 21] },
      pastry: { dollars: d[2], band: [4.75, 5.25] },
      admin: { dollars: d[3] },
      other: { dollars: d[4] },
    },
  }
}

// Made up: Burleigh 10,000 + Beach House 7,000 + Tea Garden 500 = 10,000 + 7,500.
function figures(): Record<string, any> {
  return {
    weekStartWed: W,
    generatedAt: "2026-11-11T21:35:00.000Z",
    payRuns: {
      "Tarte Bakery": { status: "POSTED", total: 10000 },
      "Tarte Currumbin": { status: "POSTED", total: 7500.3 },
    },
    stop: null,
    venues: {
      BURLEIGH: venue(40000, 10000, [4000, 4000, 1500, 500, 0]),
      BEACH_HOUSE: venue(30000, 7000.3, [3000, 3000, 800, 200.3, 0]),
      TEA_GARDEN: venue(2000, 500, [0, 500, 0, 0, 0]),
    },
    checks: { venuesSumToBothRuns: true },
  }
}

const run = (id: string, startIso: string, total: number, head = 1): ProcessedPayRun => ({
  payRunId: id,
  weekStart: new Date(startIso),
  weekEnd: new Date(startIso),
  paymentDate: new Date(startIso),
  grossWages: total,
  superAmount: 0,
  totalCost: total,
  headcount: head,
})

// ---------------------------------------------------------------- cutover

test("cutover is a Wednesday, and the first Friday digest after it (Fri 13 Nov 08:00 AEST) reads week 2026-11-04", () => {
  assert.equal(new Date(`${PAYWEEK_CUTOVER}T00:00:00.000Z`).getUTCDay(), 3)
  // docker-compose: weekly-digest at 0 22 * * 4 (Thu 22:00 UTC = Fri 08:00 AEST).
  const first = lastCompletedTarteWeek(new Date("2026-11-12T22:00:00Z"))
  assert.equal(first.startKey, PAYWEEK_CUTOVER)
  assert.equal(first.endKey, "2026-11-10")
  // The Friday before still reads the week before the cutover: old path allowed.
  const before = lastCompletedTarteWeek(new Date("2026-11-05T22:00:00Z"))
  assert.equal(before.startKey, "2026-10-28")
})

test("the aggregator's string compare puts the cutover week and every later week on the pay runs, the week before on the old path", () => {
  // buildLabour does `key >= PAYWEEK_CUTOVER` on yyyy-mm-dd keys.
  assert.equal("2026-10-28" >= PAYWEEK_CUTOVER, false)
  assert.equal("2026-11-03" >= PAYWEEK_CUTOVER, false)
  assert.equal("2026-11-04" >= PAYWEEK_CUTOVER, true)
  assert.equal("2026-11-11" >= PAYWEEK_CUTOVER, true)
  assert.equal("2026-12-30" >= PAYWEEK_CUTOVER, true)
  assert.equal("2027-01-06" >= PAYWEEK_CUTOVER, true, "year roll keeps the order")
})

// ------------------------------------------------ route ?labour=1&week=

test("route week maths: Wednesday + 8 days + 2 hours lands the digest on that Wednesday, every week for a year and a half", () => {
  // Mirrors src/app/api/cron/weekly-digest/route.ts (start + 8d + 2h).
  const routeNow = (wedIso: string) => new Date(new Date(`${wedIso}T00:00:00Z`).getTime() + 8 * DAY + 2 * 3600000)
  // That instant is Thursday midday AEST, the day after the week closed.
  const n = routeNow(W)
  assert.equal(n.toISOString(), "2026-11-12T02:00:00.000Z")
  let d = new Date("2026-09-30T00:00:00Z")
  for (let i = 0; i < 80; i++) {
    const key = d.toISOString().slice(0, 10)
    const w = lastCompletedTarteWeek(routeNow(key))
    assert.equal(w.startKey, key, `week ${key}`)
    assert.equal(w.start.getUTCDay(), 3)
    assert.equal((Date.parse(`${w.endKey}T00:00:00Z`) - Date.parse(`${key}T00:00:00Z`)) / DAY, 6)
    d = new Date(d.getTime() + 7 * DAY)
  }
  // Year end and the 2028 leap day.
  assert.equal(lastCompletedTarteWeek(routeNow("2026-12-30")).endKey, "2027-01-05")
  assert.equal(lastCompletedTarteWeek(routeNow("2028-02-23")).endKey, "2028-02-29")
})

// ------------------------------------------------ posted totals, cents

test("posted totals round to the cent across several runs and still tie to the file's figure", () => {
  const runs = [
    run("main", `${W}T00:00:00.000Z`, 7000.1, 9),
    run("leaver", `${W}T00:00:00.000Z`, 500.1, 1),
    run("backpay", `${W}T00:00:00.000Z`, 0.1, 0),
    run("prev", "2026-10-28T00:00:00.000Z", 999.99, 9),
  ]
  const s = sumPostedForWeek(runs, WED)
  assert.notEqual(7000.1 + 500.1 + 0.1, 7500.3, "the raw float sum is not 7500.3")
  assert.equal(s.total, 7500.3)
  assert.equal(s.runs, 3)
  assert.equal(s.headcount, 10)
  const out = labourFromPayWeek(
    (parsePayWeekFigures(figures(), W) as { ok: true; figures: any }).figures,
    new Map<string, { total: number; runs: number } | null>([["Tarte Bakery", { total: 10000, runs: 1 }], ["Tarte Currumbin", s]])
  )
  assert.deepEqual(out.notes, ["Ties to the posted Xero pay runs to the cent (Tarte Bakery and Tarte Currumbin)."])
})

test("posted totals: a reversal run nets off, the week's own date at any UTC hour counts, an AEST-instant start does not", () => {
  const s = sumPostedForWeek(
    [
      run("main", `${W}T00:00:00.000Z`, 7600.3, 9),
      run("fix", `${W}T00:00:00.000Z`, -100, 0),
      run("late-in-day", `${W}T05:00:00.000Z`, 0.01, 0),
      run("aest", `${W}T00:00:00+10:00`, 5000, 5),
    ],
    WED
  )
  assert.equal(s.total, 7500.31)
  assert.equal(s.runs, 3)
  assert.deepEqual(sumPostedForWeek([], WED), { total: 0, grossWages: 0, superAmount: 0, headcount: 0, runs: 0 })
})

test("a one-cent difference after summing is reported with both totals", () => {
  const s = sumPostedForWeek([run("a", `${W}T00:00:00.000Z`, 3750.15), run("b", `${W}T00:00:00.000Z`, 3750.16)], WED)
  assert.equal(s.total, 7500.31)
  const f = parsePayWeekFigures(figures(), W)
  assert.ok(f.ok)
  if (!f.ok) return
  const out = labourFromPayWeek(f.figures, new Map<string, { total: number; runs: number } | null>([["Tarte Bakery", { total: 10000, runs: 1 }], ["Tarte Currumbin", s]]))
  assert.match(out.notes.join(" "), /Tarte Currumbin: the posted run is now \$7,500\.31, \$0\.01 more than the \$7,500\.30 the Thursday pull read/)
})

test("postedPayRunTotals: one feed call per company, sums that week only, a failing company is null (could not check)", async () => {
  const env = { SHIFTS_PAYRUNS_URL: "https://shifts.example.test/api/internal/payruns", SHIFTS_SECRET: "shh" }
  const asked: string[] = []
  mock.method(console, "error", () => {})
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const u = new URL(String(url))
    const org = u.searchParams.get("org") ?? ""
    asked.push(`${org}@${u.searchParams.get("from")}`)
    if (org === "Tarte Currumbin") return new Response(JSON.stringify({ ok: false, error: "made-up outage" }), { status: 502 })
    const body = {
      ok: true,
      payRuns: [
        { payRunId: "a", status: "POSTED", weekStart: W, weekEnd: "2026-11-10", paymentDate: "2026-11-12", grossWages: 9000.05, superAmount: 999.9, totalCost: 9999.95, headcount: 9 },
        { payRunId: "b", status: "POSTED", weekStart: W, weekEnd: "2026-11-10", paymentDate: "2026-11-13", grossWages: 0.05, superAmount: 0, totalCost: 0.05, headcount: 1 },
        // A draft the feed lets through must never count as posted.
        { payRunId: "draft", status: "DRAFT", weekStart: W, weekEnd: "2026-11-10", paymentDate: "2026-11-13", grossWages: 500, superAmount: 50, totalCost: 550, headcount: 5 },
        { payRunId: "next", status: "POSTED", weekStart: "2026-11-11", weekEnd: "2026-11-17", paymentDate: "2026-11-19", grossWages: 1, superAmount: 0, totalCost: 1, headcount: 1 },
      ],
    }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  try {
    const posted = await postedPayRunTotals(WED, env)
    assert.deepEqual(asked.sort(), [`Tarte Bakery@${W}`, `Tarte Currumbin@${W}`])
    assert.equal(posted.get("Tarte Bakery")?.total, 10000)
    assert.equal(posted.get("Tarte Bakery")?.runs, 2)
    assert.equal(posted.get("Tarte Currumbin"), null)
    const f = parsePayWeekFigures(figures(), W)
    assert.ok(f.ok)
    if (!f.ok) return
    const out = labourFromPayWeek(f.figures, posted)
    assert.deepEqual(out.notes, [
      "Ties to the posted Xero pay run to the cent (Tarte Bakery).",
      "Could not re-check the posted run in Xero just now for Tarte Currumbin, so its venues are as the Thursday pull read them.",
    ])
  } finally {
    mock.restoreAll()
  }
})

test("postedPayRunTotals with the feed not set up makes no call and gives null for both companies", async () => {
  let calls = 0
  mock.method(globalThis, "fetch", async () => {
    calls++
    return new Response("{}")
  })
  try {
    const posted = await postedPayRunTotals(WED, { SHIFTS_PAYRUNS_URL: "", SHIFTS_SECRET: "" })
    assert.equal(calls, 0)
    assert.deepEqual([...posted.entries()], [["Tarte Bakery", null], ["Tarte Currumbin", null]])
  } finally {
    mock.restoreAll()
  }
})

test("company names line up between the figures file and the posted-run feed, so a rename cannot silently read as 'could not check'", () => {
  assert.deepEqual([...PAYWEEK_ORGS], PAY_RUN_ORG_VENUES.map((o) => o.org))
  for (const v of PAYWEEK_VENUES) {
    const payer = PAY_RUN_ORG_VENUES.find((o) => o.venues.includes(v))
    assert.equal(payer?.org, PAYWEEK_ORG_FOR_VENUE[v], v)
  }
})

// ---------------------------------------------------- odd and extra fields

test("parse: numbers as strings, nulls, a missing department or a missing venue are refused, never coerced", () => {
  const asString = figures()
  asString.venues.BURLEIGH.wages.total = "10000"
  assert.match((parsePayWeekFigures(asString, W) as { reason: string }).reason, /BURLEIGH has a missing or non-numeric figure/)

  const asNull = figures()
  asNull.venues.TEA_GARDEN.revenue = null
  assert.equal(parsePayWeekFigures(asNull, W).ok, false)

  const noOther = figures()
  delete noOther.venues.BEACH_HOUSE.depts.other
  assert.match((parsePayWeekFigures(noOther, W) as { reason: string }).reason, /BEACH_HOUSE/)

  const noTg = figures()
  delete noTg.venues.TEA_GARDEN
  assert.match((parsePayWeekFigures(noTg, W) as { reason: string }).reason, /TEA_GARDEN missing/)

  const noWeek = figures()
  delete noWeek.weekStartWed
  assert.equal(parsePayWeekFigures(noWeek, W).ok, false)

  assert.equal(parsePayWeekFigures({ ...figures(), payRuns: [] }, W).ok, false, "payRuns as an array")
  assert.equal(parsePayWeekFigures({ ...figures(), venues: null }, W).ok, false)
})

test("parse: extra venues, extra companies, stray keys and __proto__ are dropped; odd run status and totals fall back safely", () => {
  const text = JSON.stringify({
    ...figures(),
    payRuns: {
      "Tarte Bakery": { status: "posted", total: "10000" },
      "Tarte Currumbin": { status: "PROCESSED", total: 7500.3, employees: ["Made Up Person"] },
      "Some Other Pty Ltd": { status: "POSTED", total: 1 },
    },
    venues: { ...figures().venues, MERMAID: venue(1, 1, [1, 0, 0, 0, 0]) },
    generatedAt: 12345,
    checks: { venuesSumToBothRuns: "true" },
  }).replace('"weekStartWed"', '"__proto__":{"polluted":true},"weekStartWed"')
  const r = parsePayWeekFigures(JSON.parse(text), W)
  assert.ok(r.ok, r.ok ? "" : r.reason)
  if (!r.ok) return
  assert.deepEqual(Object.keys(r.figures.payRuns), ["Tarte Bakery", "Tarte Currumbin"])
  assert.deepEqual(r.figures.payRuns["Tarte Bakery"], { status: "none", total: null })
  assert.deepEqual(r.figures.payRuns["Tarte Currumbin"], { status: "none", total: 7500.3 })
  assert.deepEqual(Object.keys(r.figures.venues), ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"])
  assert.equal(r.figures.generatedAt, null)
  assert.equal(r.figures.venuesSumToBothRuns, null, "a string 'true' is not the check passing")
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  const s = JSON.stringify(r.figures)
  assert.ok(!s.includes("Made Up Person") && !s.includes("polluted") && !s.includes("Some Other"))
})

test("parse: odd band shapes become no target, so the pill says no target instead of a false green", () => {
  const f = figures()
  f.venues.BURLEIGH.depts.chefsKp.band = [11.5]
  f.venues.BURLEIGH.depts.fohBarista.band = ["20.5", "21"]
  f.venues.BURLEIGH.depts.pastry.band = { min: 4.75, max: 5.25 }
  f.venues.BEACH_HOUSE.depts.chefsKp.band = [11.5, 12, 13]
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.figures.venues.BURLEIGH?.depts.chefsKp.band, null)
  assert.equal(r.figures.venues.BURLEIGH?.depts.fohBarista.band, null)
  assert.equal(r.figures.venues.BURLEIGH?.depts.pastry.band, null)
  assert.equal(r.figures.venues.BEACH_HOUSE?.depts.chefsKp.band, null)
  const b = labourFromPayWeek(r.figures, new Map()).perVenue[0]
  assert.deepEqual(b.departmentGroups.slice(0, 3).map((g) => [g.target, g.status]), [
    [null, "no-target"],
    [null, "no-target"],
    [null, "no-target"],
  ])
})

test("parse: a blank stop is no stop (venues still required); a real stop drops any venues and is trimmed", () => {
  const blank = { ...figures(), stop: "   ", venues: {} }
  assert.match((parsePayWeekFigures(blank, W) as { reason: string }).reason, /BURLEIGH missing/)
  const stopped = parsePayWeekFigures({ ...figures(), stop: "  No Xero pay run yet: Tarte Bakery.  " }, W)
  assert.ok(stopped.ok)
  if (!stopped.ok) return
  assert.equal(stopped.figures.stop, "No Xero pay run yet: Tarte Bakery.")
  assert.deepEqual(stopped.figures.venues, {}, "the aggregator then falls to the posted runs")
})

// ------------------------------------------------------- venue lines

test("overspend through the whole pipeline: top of band is ok, half a point over is amber, past that is red", () => {
  const f = figures()
  // Burleigh revenue 40,000: chefs 4,800 = 12.0%, FOH 8,600 = 21.5%, pastry 2,400 = 6.0%.
  f.venues.BURLEIGH.depts.chefsKp.dollars = 4800
  f.venues.BURLEIGH.depts.fohBarista.dollars = 8600
  f.venues.BURLEIGH.depts.pastry.dollars = 2400
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const b = labourFromPayWeek(r.figures, new Map()).perVenue.find((v) => v.venue === "Burleigh")!
  assert.deepEqual(b.departmentGroups.slice(0, 3).map((g) => g.status), ["ok", "amber", "red"])
})

test("negative revenue gives no percentages and no NaN; a negative (reversal) department still shows", () => {
  const f = figures()
  f.venues.BEACH_HOUSE.revenue = -50
  f.venues.BURLEIGH.depts.other.dollars = -25.5
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const out = labourFromPayWeek(r.figures, new Map())
  const bh = out.perVenue.find((v) => v.venue === "Beach House")!
  assert.equal(bh.revenueExGst, null)
  assert.equal(bh.overallPct, null)
  assert.ok(bh.departmentGroups.every((g) => g.pct === null && g.status === "no-target"))
  const b = out.perVenue.find((v) => v.venue === "Burleigh")!
  assert.equal(b.departmentGroups.at(-1)?.label, "No department in Shifts")
  assert.equal(b.departmentGroups.at(-1)?.dollars, -25.5)
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(out)))
})

test("a file with no total for a company but a posted run now: the note gives the posted total without inventing a difference", () => {
  const f = figures()
  delete f.payRuns["Tarte Bakery"].total
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const out = labourFromPayWeek(r.figures, new Map([["Tarte Bakery", { total: 10000, runs: 1 }], ["Tarte Currumbin", { total: 7500.3, runs: 1 }]]))
  assert.deepEqual(out.notes, [
    "Ties to the posted Xero pay run to the cent (Tarte Currumbin).",
    "Tarte Bakery: the posted run is now $10,000.00. These figures are from that pull until the venue cards are re-run for this week.",
  ])
})

test("an org missing from the posted map is treated as could not check, never as tied", () => {
  const r = parsePayWeekFigures(figures(), W)
  assert.ok(r.ok)
  if (!r.ok) return
  const posted: PostedTotals = new Map([["Tarte Bakery", { total: 10000, runs: 1 }]])
  const out = labourFromPayWeek(r.figures, posted)
  assert.equal(out.notes[0], "Ties to the posted Xero pay run to the cent (Tarte Bakery).")
  assert.match(out.notes.join(" "), /Could not re-check/)
  assert.ok(!out.notes.join(" ").includes("Tarte Currumbin)"))
})

test("only the Bakery read held back: the note names Tarte Bakery alone, after the tie, before the venues-sum warning", () => {
  const f = figures()
  f.checks = { venuesSumToBothRuns: false }
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const posted: PostedTotals = new Map([["Tarte Bakery", null], ["Tarte Currumbin", { total: 7500.3, runs: 1 }]])
  const out = labourFromPayWeek(r.figures, posted)
  assert.deepEqual(out.notes, [
    "Ties to the posted Xero pay run to the cent (Tarte Currumbin).",
    "Could not re-check the posted run in Xero just now for Tarte Bakery, so its venues are as the Thursday pull read them.",
    "The three venues do not add up to the two pay runs in this week's cards file. Check it before relying on the split.",
  ])
  // Wording only: the figures and the draft flag are unchanged.
  assert.equal(out.perVenue.length, 3)
  assert.ok(out.perVenue.every((v) => v.fromDraft === false))
  assert.equal(out.perVenue.find((v) => v.venue === "Burleigh")?.grossWages, 10000)
  assert.ok(!out.notes.join(" ").includes("\u2014"))
})
