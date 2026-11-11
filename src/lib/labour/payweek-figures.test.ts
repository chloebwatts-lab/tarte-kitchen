import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  bandStatus,
  labourFromPayWeek,
  loadPayWeekFigures,
  parsePayWeekFigures,
  type PostedTotals,
} from "./payweek-figures"
import { sumPostedForWeek } from "./payruns"
import type { ProcessedPayRun } from "@/lib/xero/client"

// Made-up week. The repo is public: never put real pay figures in a test.
// Shaped like the Thursday cards' weeks/<W>.figures.json.
const W = "2026-11-04"

function venue(revenue: number, total: number, admin: number, leave: number, d: [number, number, number, number, number], bands = true) {
  const b = (lo: number, hi: number) => (bands ? [lo, hi] : null)
  return {
    revenue,
    wages: { total, exAdmin: total - admin, exAdminLeaveBackpay: total - admin - leave, admin, leaveBackpay: leave },
    wagesPct: { total: 0 },
    depts: {
      chefsKp: { dollars: d[0], pct: 0, band: b(11.5, 12), result: null },
      fohBarista: { dollars: d[1], pct: 0, band: b(20.5, 21), result: null },
      pastry: { dollars: d[2], pct: 0, band: b(4.75, 5.25), result: null },
      admin: { dollars: d[3], pct: 0, band: null, result: null },
      other: { dollars: d[4], pct: 0, band: null, result: null },
    },
  }
}

function figures(over: Record<string, unknown> = {}) {
  return {
    weekStartWed: W,
    weekEnd: "2026-11-10",
    generatedAt: "2026-11-11T21:35:00.000Z",
    payRuns: {
      "Tarte Bakery": { status: "POSTED", runs: [{ id: "a", wages: 900, super: 100 }], payslips: 10, total: 30000.0 },
      "Tarte Currumbin": { status: "POSTED", runs: [{ id: "b", wages: 900, super: 100 }], payslips: 10, total: 22000.55 },
    },
    stop: null,
    venues: {
      // Venues add to both runs: 30,100 + 20,400.55 + 1,500 = 30,000 + 22,000.55.
      BURLEIGH: venue(100000, 30100, 1600, 2000, [11000, 15000, 2500, 1600, 0]),
      BEACH_HOUSE: venue(80000, 20400.55, 500, 0, [10000, 8400.55, 1500, 500, 0], false),
      TEA_GARDEN: venue(4000, 1500, 0, 300, [0, 1500, 0, 0, 0], false),
    },
    checks: { venuesSumToBothRuns: true },
    // Never copied: the parser only keeps the fields the digest uses.
    sources: { note: "Somebody Surname" },
    ...over,
  }
}

const tie: PostedTotals = new Map([
  ["Tarte Bakery", { total: 30000.0, runs: 1 }],
  ["Tarte Currumbin", { total: 22000.55, runs: 1 }],
])

function parsed(over: Record<string, unknown> = {}) {
  const r = parsePayWeekFigures(figures(over), W)
  assert.ok(r.ok, r.ok ? "" : r.reason)
  return r.figures
}

test("parse: keeps the week's venue and department dollars, run status and the venues-sum check, nothing else", () => {
  const f = parsed()
  assert.equal(f.weekStartWed, W)
  assert.deepEqual(f.payRuns["Tarte Bakery"], { status: "POSTED", total: 30000 })
  assert.equal(f.venues.BURLEIGH?.wages.exAdminLeaveBackpay, 26500)
  assert.deepEqual(f.venues.BURLEIGH?.depts.chefsKp, { dollars: 11000, band: [11.5, 12] })
  assert.equal(f.venues.BEACH_HOUSE?.depts.pastry.band, null)
  assert.equal(f.venuesSumToBothRuns, true)
  assert.ok(!JSON.stringify(f).includes("Somebody"), "stray fields never reach the digest")
})

test("parse: refuses a file for another week, or one with a missing or non-numeric figure", () => {
  const other = parsePayWeekFigures(figures({ weekStartWed: "2026-10-28" }), W)
  assert.equal(other.ok, false)
  const bad = figures()
  ;(bad.venues.BEACH_HOUSE.wages as Record<string, unknown>).exAdmin = "lots"
  const r = parsePayWeekFigures(bad, W)
  assert.equal(r.ok, false)
  assert.match(r.ok ? "" : r.reason, /BEACH_HOUSE/)
  assert.equal(parsePayWeekFigures(null, W).ok, false)
  assert.equal(parsePayWeekFigures([], W).ok, false)
})

test("parse: a stopped week (a company had no run) parses with no venues", () => {
  const r = parsePayWeekFigures(
    figures({ stop: "No Xero pay run yet for the week starting 2026-11-04 in: Tarte Bakery.", venues: {}, payRuns: { "Tarte Currumbin": { status: "DRAFT", total: 5 } } }),
    W
  )
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.figures.venues, {})
  assert.equal(r.figures.payRuns["Tarte Bakery"].status, "none")
  assert.equal(r.figures.payRuns["Tarte Currumbin"].status, "DRAFT")
})

test("three lines per venue over that venue's own revenue; ties to both posted runs to the cent", () => {
  const out = labourFromPayWeek(parsed(), tie)
  assert.equal(out.source, "payweek")
  assert.equal(out.weekStartWed, W)
  const b = out.perVenue.find((v) => v.venue === "Burleigh")!
  assert.equal(b.grossWages, 30100)
  const r4 = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 10000)
  assert.equal(r4(b.overallPct), 30.1)
  assert.equal(r4(b.exAdminPct), 28.5)
  assert.equal(r4(b.exAdminLeavePct), 26.5)
  assert.equal(b.fromDraft, false)
  assert.deepEqual(out.notes, ["Ties to the posted Xero pay runs to the cent (Tarte Bakery and Tarte Currumbin)."])
})

test("departments: bands from the file, overspend-only pills, admin shown, Beach House pastry on Beach House revenue only", () => {
  const out = labourFromPayWeek(parsed(), tie)
  const b = out.perVenue.find((v) => v.venue === "Burleigh")!
  assert.deepEqual(
    b.departmentGroups.map((g) => [g.label, g.dollars, g.pct == null ? null : Math.round(g.pct * 10000) / 10000, g.status]),
    [
      ["Chefs + KP", 11000, 11, "ok"],
      ["FOH + Barista", 15000, 15, "ok"],
      ["Pastry", 2500, 2.5, "ok"],
      ["Admin", 1600, 1.6, "no-target"],
    ]
  )
  assert.deepEqual(b.departmentGroups[0].target, { min: 11.5, max: 12 })
  const bh = out.perVenue.find((v) => v.venue === "Beach House")!
  assert.equal(bh.departmentGroups[1].label, "FOH (incl. Barista)")
  assert.equal(bh.departmentGroups[2].pct, (1500 / 80000) * 100)
  // The departments add back to line 1.
  for (const v of out.perVenue) {
    const sum = v.departmentGroups.reduce((s, g) => s + g.dollars, 0)
    assert.equal(Math.round(sum * 100), Math.round(v.grossWages * 100), v.venue)
  }
})

test("Tea Garden lists only departments that carry pay; a person with no Shifts department shows as its own row", () => {
  const f = figures()
  f.venues.BURLEIGH.depts.other.dollars = 250
  f.venues.BURLEIGH.depts.fohBarista.dollars = 14750
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const out = labourFromPayWeek(r.figures, tie)
  const tg = out.perVenue.find((v) => v.venue === "Tea Garden")!
  assert.deepEqual(tg.departmentGroups.map((g) => g.label), ["FOH (incl. Barista)"])
  assert.equal(tg.departmentGroups[0].status, "no-target")
  const b = out.perVenue.find((v) => v.venue === "Burleigh")!
  assert.equal(b.departmentGroups.at(-1)?.label, "No department in Shifts")
})

test("draft when the cards ran and nothing posted now: both Currumbin venues say so, Burleigh does not", () => {
  const f = parsed({
    payRuns: {
      "Tarte Bakery": { status: "POSTED", total: 30000.0 },
      "Tarte Currumbin": { status: "DRAFT", total: 22000.55 },
    },
  })
  const out = labourFromPayWeek(
    f,
    new Map([
      ["Tarte Bakery", { total: 30000.0, runs: 1 }],
      ["Tarte Currumbin", { total: 0, runs: 0 }],
    ])
  )
  assert.deepEqual(out.perVenue.map((v) => [v.venue, v.fromDraft]), [
    ["Burleigh", false],
    ["Beach House", true],
    ["Tea Garden", true],
  ])
  assert.deepEqual(out.notes, [
    "Ties to the posted Xero pay run to the cent (Tarte Bakery).",
    "Tarte Currumbin's pay run is not posted yet. These are from the draft, so they can move a little once it is posted.",
  ])
})

test("a draft that was posted unchanged since counts as posted", () => {
  const f = parsed({ payRuns: { "Tarte Bakery": { status: "DRAFT", total: 30000.0 }, "Tarte Currumbin": { status: "POSTED", total: 22000.55 } } })
  const out = labourFromPayWeek(f, tie)
  assert.ok(out.perVenue.every((v) => !v.fromDraft))
  assert.deepEqual(out.notes, ["Ties to the posted Xero pay runs to the cent (Tarte Bakery and Tarte Currumbin)."])
})

test("a posted run that differs from what the cards read is called out with both totals, never silently swapped", () => {
  const out = labourFromPayWeek(
    parsed(),
    new Map([
      ["Tarte Bakery", { total: 30123.45, runs: 2 }],
      ["Tarte Currumbin", { total: 22000.55, runs: 1 }],
    ])
  )
  assert.equal(out.perVenue[0].grossWages, 30100, "still the cards' placed figure")
  assert.deepEqual(out.notes, [
    "Ties to the posted Xero pay run to the cent (Tarte Currumbin).",
    "Tarte Bakery: the posted run is now $30,123.45, $123.45 more than the $30,000.00 the Thursday pull read. These figures are from that pull until the venue cards are re-run for this week.",
  ])
  const less = labourFromPayWeek(parsed(), new Map([["Tarte Bakery", { total: 29999.99, runs: 1 }], ["Tarte Currumbin", { total: 22000.55, runs: 1 }]]))
  assert.match(less.notes.join(" "), /\$0\.01 less than the \$30,000\.00/)
})

test("one cent either way is a difference; a fraction of a cent is not", () => {
  const near = labourFromPayWeek(parsed(), new Map([["Tarte Bakery", { total: 30000.004, runs: 1 }], ["Tarte Currumbin", { total: 22000.546, runs: 1 }]]))
  assert.equal(near.notes.length, 1)
  assert.match(near.notes[0], /^Ties to the posted Xero pay runs/)
})

test("feed down: figures still shown, the note says the runs could not be re-checked, a draft is still flagged", () => {
  const f = parsed({ payRuns: { "Tarte Bakery": { status: "DRAFT", total: 30000 }, "Tarte Currumbin": { status: "POSTED", total: 22000.55 } } })
  const out = labourFromPayWeek(f, new Map([["Tarte Bakery", null], ["Tarte Currumbin", null]]))
  assert.equal(out.perVenue.length, 3)
  assert.equal(out.perVenue[0].fromDraft, true)
  assert.deepEqual(out.notes, [
    "Tarte Bakery's pay run was still a draft when the cards ran, so its venues can move a little once it is posted.",
    "Could not re-check the posted runs in Xero just now, so these are as the Thursday pull read them.",
  ])
  // A posted org that has vanished from Xero is named, not hidden.
  const gone = labourFromPayWeek(parsed(), new Map([["Tarte Bakery", { total: 0, runs: 0 }], ["Tarte Currumbin", { total: 22000.55, runs: 1 }]]))
  assert.match(gone.notes.join(" "), /Xero no longer shows a posted Tarte Bakery run/)
})

test("the cards' own venues-sum check failing is passed on", () => {
  const out = labourFromPayWeek(parsed({ checks: { venuesSumToBothRuns: false } }), tie)
  assert.match(out.notes.at(-1) ?? "", /do not add up to the two pay runs/)
})

test("no revenue on file: dollars kept, no percentages, no NaN", () => {
  const f = figures()
  f.venues.TEA_GARDEN.revenue = 0
  const r = parsePayWeekFigures(f, W)
  assert.ok(r.ok)
  if (!r.ok) return
  const tg = labourFromPayWeek(r.figures, tie).perVenue.find((v) => v.venue === "Tea Garden")!
  assert.equal(tg.revenueExGst, null)
  assert.equal(tg.overallPct, null)
  assert.equal(tg.exAdminLeavePct, null)
  assert.equal(tg.departmentGroups[0].pct, null)
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(tg)))
})

test("band status: at the top of the band is on target, up to half a point over is close, beyond is off", () => {
  assert.equal(bandStatus(12, [11.5, 12]), "ok")
  assert.equal(bandStatus(10, [11.5, 12]), "ok", "under band is fine for wages")
  assert.equal(bandStatus(12.5, [11.5, 12]), "amber")
  assert.equal(bandStatus(12.51, [11.5, 12]), "red")
  assert.equal(bandStatus(null, [11.5, 12]), "no-target")
  assert.equal(bandStatus(40, null), "no-target")
})

test("posted totals sum every run that starts on the week's Wednesday and ignore other weeks", () => {
  const run = (id: string, start: string, total: number, head: number): ProcessedPayRun => ({
    payRunId: id,
    weekStart: new Date(`${start}T00:00:00.000Z`),
    weekEnd: new Date(`${start}T00:00:00.000Z`),
    paymentDate: new Date(`${start}T00:00:00.000Z`),
    grossWages: total * 0.9,
    superAmount: total * 0.1,
    totalCost: total,
    headcount: head,
  })
  const wed = new Date(`${W}T00:00:00.000Z`)
  const s = sumPostedForWeek([run("main", W, 1000.1, 10), run("leaver", W, 200.2, 1), run("prev", "2026-10-28", 999, 9)], wed)
  assert.equal(s.total, 1200.3)
  assert.equal(s.runs, 2)
  assert.equal(s.headcount, 11)
  assert.deepEqual(sumPostedForWeek([run("prev", "2026-10-28", 999, 9)], wed), { total: 0, grossWages: 0, superAmount: 0, headcount: 0, runs: 0 })
})

test("loading: no file is not a problem, a broken or wrong-week file is, a good file parses", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "payweek-"))
  try {
    const env = { PAYWEEK_FIGURES_DIR: dir }
    assert.deepEqual(await loadPayWeekFigures(W, env), { figures: null, problem: null })
    await writeFile(path.join(dir, `${W}.figures.json`), "{not json")
    assert.match((await loadPayWeekFigures(W, env)).problem ?? "", /not valid JSON/)
    await writeFile(path.join(dir, `${W}.figures.json`), JSON.stringify(figures({ weekStartWed: "2026-10-28" })))
    assert.match((await loadPayWeekFigures(W, env)).problem ?? "", /not 2026-11-04/)
    await writeFile(path.join(dir, `${W}.figures.json`), JSON.stringify(figures()))
    const ok = await loadPayWeekFigures(W, env)
    assert.equal(ok.problem, null)
    assert.equal(ok.figures?.venues.BURLEIGH?.wages.total, 30100)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a draft when the cards ran that is posted with a different total is not called a draft, the note says it changed", () => {
  const f = parsed({ payRuns: { "Tarte Bakery": { status: "DRAFT", total: 30000 }, "Tarte Currumbin": { status: "POSTED", total: 22000.55 } } })
  const out = labourFromPayWeek(f, new Map([["Tarte Bakery", { total: 30050, runs: 1 }], ["Tarte Currumbin", { total: 22000.55, runs: 1 }]]))
  assert.equal(out.perVenue.find((v) => v.venue === "Burleigh")?.fromDraft, false)
  assert.match(out.notes.join(" "), /Tarte Bakery: the posted run is now \$30,050\.00, \$50\.00 more than the \$30,000\.00 the Thursday pull read/)
})
