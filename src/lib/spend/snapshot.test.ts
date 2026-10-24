import { test } from "node:test"
import assert from "node:assert/strict"
import { buildSpendSnapshot, type SpendSnapshotRows } from "./snapshot"
import { checkSpendSnapshot } from "./guards"
import { render } from "./weekly-email"
import { arrivalCompleteness, BACKFILL_AFTER_DAYS } from "./arrival-lag"

// A Burleigh-shaped week, end to end through the code that ships. Every
// history week has the same deliveries, so each figure can be worked by hand:
//   Bidfood Wed $1,000, Fri $2,000, Mon $1,800
//   Gold Coast Eggs Fri $800 (invoiced 2 days later), Mon $700
//   Pixel Bread $300 every day
//   + Parallel Roasters Thu $800 a week, on time for the last two weeks and
//     backfilled on 16 Oct for the six before
// = $9,200 a week on $35,000 of takings ($5,000 a day). Budget 27% of a
// $35,000 forecast = $9,450.

const DAY = 24 * 60 * 60 * 1000
const H = 60 * 60 * 1000
const WEEK_START = Date.UTC(2026, 9, 14) // Wed 14 Oct 2026, AEST date at UTC midnight
const WED = 0, THU = 1, FRI = 2, SAT = 3, SUN = 4, MON = 5, TUE = 6

/** The real instant of AEST wall time on a trading day of week `w` (0 = this week, 1 = last week). */
const at = (w: number, day: number, hour: number) => new Date(WEEK_START - w * 7 * DAY + day * DAY + hour * H - 10 * H)
const dateOf = (w: number, day: number) => new Date(WEEK_START - w * 7 * DAY + day * DAY)

type Inv = SpendSnapshotRows["invoiceHistory"][number]
function inv(supplierName: string, w: number, day: number, amount: number, created: Date): Inv {
  return { supplierName, invoiceDate: dateOf(w, day), createdAt: created, venue: "BURLEIGH", subtotal: amount, total: amount * 1.1, gst: amount * 0.1 }
}

function usualWeek(w: number): Inv[] {
  return [
    inv("Bidfood", w, WED, 1000, at(w, WED, 8)),
    inv("Bidfood", w, FRI, 2000, at(w, FRI, 8)),
    inv("Bidfood", w, MON, 1800, at(w, MON, 8)),
    inv("Gold Coast Eggs", w, FRI, 800, at(w, SUN, 12)),
    inv("Gold Coast Eggs", w, MON, 700, at(w, TUE + 2, 12)),
    ...[WED, THU, FRI, SAT, SUN, MON, TUE].map((d) => inv("Pixel Bread", w, d, 300, at(w, d, 18))),
    // weeks 3 to 8 imported weeks later: real spend, not delivery lag
    inv("Parallel Roasters", w, THU, 800, w <= 2 ? at(w, THU, 10) : new Date(Date.UTC(2026, 9, 16, 2))),
  ]
}

function rows(now: Date, thisWeek: Inv[]): SpendSnapshotRows {
  const history = [1, 2, 3, 4, 5, 6, 7, 8].flatMap(usualWeek)
  const salesHistory = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((w) =>
    [WED, THU, FRI, SAT, SUN, MON, TUE].map((d) => ({ date: dateOf(w, d), venue: "BURLEIGH" as const, totalRevenueExGst: 5000 }))
  )
  const todayIdx = Math.floor((now.getTime() + 10 * H - WEEK_START) / DAY)
  const salesSummaries = [WED, THU, FRI, SAT, SUN, MON, TUE]
    .filter((d) => d < todayIdx)
    .map((d) => ({ date: dateOf(0, d), venue: "BURLEIGH" as const, totalRevenueExGst: 5000, source: "EMAIL" as const }))
  return {
    invoices: thisWeek.filter((i) => i.createdAt <= now),
    forecasts: [{ venue: "BURLEIGH", amount: 35000 }],
    targets: [{ venue: "BURLEIGH", targetPct: 27 }],
    cogsSupplierHistory: [],
    unassignedRaw: [],
    latestInvoiceByAlias: [],
    salesSummaries,
    salesHistory,
    invoiceHistory: history,
  }
}

// This week to Sunday afternoon: a normal Wed to Sun, Sunday's bread in
const THIS_WEEK: Inv[] = [
  inv("Bidfood", 0, WED, 1000, at(0, WED, 8)),
  inv("Bidfood", 0, FRI, 2000, at(0, FRI, 8)),
  inv("Gold Coast Eggs", 0, FRI, 800, at(0, SUN, 12)),
  ...[WED, THU, FRI, SAT, SUN].map((d) => inv("Pixel Bread", 0, d, 300, at(0, d, 12))),
]

const burleigh = (now: Date, thisWeek = THIS_WEEK) => {
  const snap = buildSpendSnapshot(rows(now, thisWeek), now)
  assert.deepEqual(checkSpendSnapshot(snap), [])
  return snap.buckets.find((b) => b.bucket === "BURLEIGH")!
}

test("Sunday 5pm: left is the budget less spend so far less Monday and Tuesday's usual deliveries", () => {
  const b = burleigh(at(0, SUN, 17))
  assert.equal(b.budget, 9450)
  assert.equal(b.spentToDate, 5300)
  // the backfilled roasters are not read as "a seventh of spend arrives late"
  assert.equal(b.estimatedSpentToDate, 5300)
  assert.equal(b.estimatedUninvoiced, 0)
  // Bidfood Mon 1,800 + eggs Mon 700 + bread Mon and Tue 600; Sunday's bread is in already
  assert.equal(b.usualStillToCome, 3100)
  assert.deepEqual(
    b.stillToCome.map((r) => [r.supplier, r.amount, r.days.join("/")]),
    [["Bidfood", 1800, "Mon"], ["Gold Coast Eggs", 700, "Mon"], ["Pixel Bread", 600, "Mon/Tue"]]
  )
  assert.equal(b.leftToSpend, 1050)
  assert.equal(b.leftBeforeStillToCome, 4150) // what the page used to lead with
  assert.equal(b.projectedEndOfWeek, 8400)
  assert.equal(b.spendProjectionMethod, "usual")
  assert.equal(b.paceStatus, "on-track")
})

test("overnight with nothing new in, the figure does not jump at midnight", () => {
  const sun = burleigh(at(0, SUN, 23.9))
  const mon = burleigh(at(0, MON, 7))
  assert.equal(mon.leftToSpend, sun.leftToSpend)
  assert.equal(mon.usualStillToCome, 3100)
})

test("Monday 5pm: a bigger than usual Bidfood drop is in, so it comes off once and the rest of Monday stays to come", () => {
  const b = burleigh(at(0, MON, 17), [...THIS_WEEK, inv("Bidfood", 0, MON, 2400, at(0, MON, 8))])
  assert.equal(b.estimatedSpentToDate, 7700)
  // Bidfood's Monday is done; eggs (invoiced Wednesday) and bread are not in yet
  assert.equal(b.usualStillToCome, 1300)
  assert.equal(b.stillToCome.find((r) => r.supplier === "Bidfood"), undefined)
  // $600 over the usual Bidfood is $600 less to order
  assert.equal(b.leftToSpend, 450)
})

test("the Sunday email leads with the honest figure and names who is still to come", () => {
  const now = at(0, SUN, 8.5)
  const { text } = render(buildSpendSnapshot(rows(now, THIS_WEEK.filter((i) => i.createdAt <= now)), now))
  assert.match(text, /Burleigh: \$\d[\d,]* left to spend after the usual deliveries still to come\./)
  // 08:30: Sunday's bread is not in yet, so it is still to come too
  assert.match(text, /usual deliveries still to come \(Bidfood \$1,800, Pixel Bread \$900, Gold Coast Eggs \$700\)/)
  assert.match(text, /Before those deliveries: \$[\d,]+ left\./)
})

test("Wednesday morning, nothing in yet: the whole usual week is still to come", () => {
  const b = burleigh(at(0, WED, 6))
  assert.equal(b.spentToDate, 0)
  assert.equal(b.usualStillToCome, 9200)
  assert.equal(b.leftToSpend, 250)
})

test("arrival lag: an invoice that turns up more than two weeks after its date is an import and is left out", () => {
  const wk = WEEK_START
  const base = (createdAtMs: number, amount = 100, day = 0) => ({ weekStartMs: wk, invoiceDateMs: wk + day * DAY, createdAtMs, amount })
  const onTime = Array.from({ length: 14 }, (_, i) => base(wk + (i % 3) * DAY + 2 * H, 100, i % 3))
  const elapsed = 3 * DAY + 10 * H
  assert.equal(arrivalCompleteness(onTime, elapsed, 3), 1)
  // $1,400 of normal invoices, plus $1,000 backfilled 20 days on: still complete
  const backfill = base(wk + 20 * DAY, 1000, 1)
  assert.equal(arrivalCompleteness([...onTime, backfill], elapsed, 3), 1)
  // A genuinely slow invoice (3 days) still counts as lag
  const slow = base(wk + 4 * DAY, 600, 1)
  assert.equal(arrivalCompleteness([...onTime, slow], elapsed, 3), 1400 / 2000)
  // The boundary: exactly the cut-off is still lag, a minute more is an import
  const edge = base(wk + DAY + BACKFILL_AFTER_DAYS * DAY, 600, 1)
  assert.equal(arrivalCompleteness([...onTime, edge], elapsed, 3), 1400 / 2000)
  const past = base(wk + DAY + BACKFILL_AFTER_DAYS * DAY + 60 * 1000, 600, 1)
  assert.equal(arrivalCompleteness([...onTime, past], elapsed, 3), 1)
})

// ------------------------------------------------ edges (test guard, 23 Oct 2026)
// A history where every week, both venues, runs the same and every invoice
// is on time, so a week that runs exactly to pattern has a known answer at
// every hour: spent so far + usual still to come = the usual week. Anything
// counted twice (gross-up and still to come both covering a day) or dropped
// (today falling between the two) moves the sum off it.
//   Burleigh: the week above, roasters on time, + half a Breadtop Sat ($300)
//     = $9,500 on $35,000 of takings
//   Currumbin: Bidfood Fri $1,000 and Mon $1,500 (Beach House), Fino Thu
//     $400 (Tea Garden), half the Breadtop = $3,200 on $28,000 of takings

const cents = (n: number) => Math.round(n * 100) / 100
const ALL_DAYS = [WED, THU, FRI, SAT, SUN, MON, TUE]

function venueInv(supplierName: string, venue: Inv["venue"], w: number, day: number, amount: number, created: Date): Inv {
  return { ...inv(supplierName, w, day, amount, created), venue }
}

function patternWeek(w: number): Inv[] {
  return [
    inv("Bidfood", w, WED, 1000, at(w, WED, 8)),
    inv("Bidfood", w, FRI, 2000, at(w, FRI, 8)),
    inv("Bidfood", w, MON, 1800, at(w, MON, 8)),
    inv("Gold Coast Eggs", w, FRI, 800, at(w, SUN, 12)),
    inv("Gold Coast Eggs", w, MON, 700, at(w, TUE + 2, 12)),
    ...ALL_DAYS.map((d) => inv("Pixel Bread", w, d, 300, at(w, d, 18))),
    inv("Parallel Roasters", w, THU, 800, at(w, THU, 10)),
    venueInv("Breadtop", "BOTH", w, SAT, 600, at(w, SAT, 9)),
    venueInv("Bidfood", "BEACH_HOUSE", w, FRI, 1000, at(w, FRI, 9)),
    venueInv("Bidfood", "BEACH_HOUSE", w, MON, 1500, at(w, MON, 9)),
    venueInv("Fino", "TEA_GARDEN", w, THU, 400, at(w, THU, 11)),
  ]
}

const HISTORY_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]

function salesFor(weeks: number[], days: number[] = ALL_DAYS) {
  return weeks.flatMap((w) =>
    days.flatMap((d) => [
      { date: dateOf(w, d), venue: "BURLEIGH" as const, totalRevenueExGst: 5000 },
      { date: dateOf(w, d), venue: "BEACH_HOUSE" as const, totalRevenueExGst: 3000 },
      { date: dateOf(w, d), venue: "TEA_GARDEN" as const, totalRevenueExGst: 1000 },
    ])
  )
}

function edgeRows(
  now: Date,
  o: {
    history?: Inv[]
    salesWeeks?: number[]
    thisWeek?: Inv[]
    forecasts?: SpendSnapshotRows["forecasts"]
    targets?: SpendSnapshotRows["targets"]
  } = {}
): SpendSnapshotRows {
  const todayIdx = Math.floor((now.getTime() + 10 * H - WEEK_START) / DAY)
  const thisWeek = o.thisWeek ?? patternWeek(0)
  return {
    invoices: thisWeek.filter((i) => i.createdAt <= now),
    forecasts: o.forecasts ?? [
      { venue: "BURLEIGH", amount: 35000 },
      { venue: "BEACH_HOUSE", amount: 21000 },
      { venue: "TEA_GARDEN", amount: 7000 },
    ],
    targets: o.targets ?? [
      { venue: "BURLEIGH", targetPct: 27 },
      { venue: "BEACH_HOUSE", targetPct: 28 },
    ],
    cogsSupplierHistory: [],
    unassignedRaw: [],
    latestInvoiceByAlias: [],
    salesSummaries: salesFor([0], ALL_DAYS.filter((d) => d < todayIdx)).map((s) => ({ ...s, source: "EMAIL" as const })),
    salesHistory: salesFor(o.salesWeeks ?? HISTORY_WEEKS),
    invoiceHistory: o.history ?? HISTORY_WEEKS.flatMap(patternWeek),
  }
}

/** Snapshot that must pass its own guards, keyed by bucket. */
function edgeSnap(now: Date, o: Parameters<typeof edgeRows>[1] = {}) {
  const snap = buildSpendSnapshot(edgeRows(now, o), now)
  assert.deepEqual(checkSpendSnapshot(snap), [], `guards at ${now.toISOString()}`)
  const by = Object.fromEntries(snap.buckets.map((b) => [b.bucket, b]))
  return { snap, burleigh: by.BURLEIGH, currumbin: by.CURRUMBIN }
}

test("a week run exactly to pattern reads the usual week at every hour, both venues: nothing counted twice, nothing dropped", () => {
  for (let h = 0; h < 7 * 24; h++) {
    const now = at(0, WED, h + 0.5)
    const { burleigh: b, currumbin: c } = edgeSnap(now)
    const label = `${now.toISOString()} (hour ${h})`
    assert.ok(Math.abs(b.estimatedSpentToDate + b.usualStillToCome - 9500) < 0.05, `Burleigh ${label}: ${b.estimatedSpentToDate} + ${b.usualStillToCome}`)
    assert.ok(Math.abs(c.estimatedSpentToDate + c.usualStillToCome - 3200) < 0.05, `Currumbin ${label}: ${c.estimatedSpentToDate} + ${c.usualStillToCome}`)
    // the headline and the pace agree, and the old figure is the headline plus still to come
    assert.ok(Math.abs(b.leftToSpend! - (9450 - 9500)) < 0.05, label)
    assert.ok(Math.abs(c.leftToSpend! - (7840 - 3200)) < 0.05, label)
    assert.ok(Math.abs(b.leftBeforeStillToCome! - b.leftToSpend! - b.usualStillToCome) < 0.015, label)
    assert.equal(b.spendProjectionMethod, "usual")
    assert.ok(Math.abs(b.projectedEndOfWeek - 9500) < 0.05, label)
  }
})

test("Wednesday, the first day, has no days before it: invoices in hand count as they are, no gross-up", () => {
  const { snap, burleigh: b } = edgeSnap(at(0, WED, 0.25))
  assert.equal(snap.weekStartWed, "2026-10-14")
  assert.equal(snap.dayOfWeek, 1)
  assert.equal(b.spentToDate, 0)
  assert.equal(b.estimatedSpentToDate, 0)
  assert.equal(b.usualStillToCome, 9500)
  const late = edgeSnap(at(0, WED, 20)).burleigh
  assert.equal(late.spentToDate, 1300) // Bidfood $1,000 + bread $300
  assert.equal(late.estimatedSpentToDate, 1300)
  assert.equal(late.estimatedUninvoiced, 0)
})

test("Saturday 5pm: Friday's eggs, not invoiced yet, are grossed up; Saturday's own invoices count as they are", () => {
  const b = burleigh(at(0, SAT, 17), [...THIS_WEEK.filter((i) => i.invoiceDate!.getTime() < dateOf(0, SAT).getTime()), inv("Pixel Bread", 0, SAT, 300, at(0, SAT, 12))])
  // in hand: Bidfood $3,000, bread Wed to Sat $1,200; eggs Fri lands Sunday
  assert.equal(b.spentToDate, 4200)
  // Wed to Fri: $3,900 in, history says 32,800 of 39,200 (backfilled roasters out) is in by now
  assert.equal(b.estimatedSpentToDate, cents((3900 * 39200) / 32800 + 300))
  assert.equal(b.estimatedUninvoiced, cents(b.estimatedSpentToDate - 4200))
  // Saturday's bread is in, so not to come; Sun to Tue bread, Mon Bidfood and eggs are
  assert.equal(b.usualStillToCome, 3400)
  assert.deepEqual(b.stillToCome.find((r) => r.supplier === "Pixel Bread")!.days, ["Sun", "Mon", "Tue"])
  assert.equal(b.leftToSpend, cents(9450 - b.estimatedSpentToDate - 3400))
})

test("AEST, not UTC, decides today: Sunday 9am is still Saturday in UTC", () => {
  const now = at(0, SUN, 9)
  assert.match(now.toISOString(), /^2026-10-17T23:00/)
  const { snap, burleigh: b } = edgeSnap(now)
  assert.equal(snap.todayAest, "2026-10-18")
  assert.equal(snap.dayOfWeek, 5)
  // Sunday's bread (18:00) is not in, so Sunday is still to come; Saturday's is in and is not
  assert.deepEqual(b.stillToCome.find((r) => r.supplier === "Pixel Bread")!.days, ["Sun", "Mon", "Tue"])
  // Saturday 11:30pm AEST is still Saturday
  const sat = edgeSnap(at(0, SAT, 23.5)).snap
  assert.equal(sat.todayAest, "2026-10-17")
  assert.equal(sat.dayOfWeek, 4)
  // Tuesday 11:45pm AEST is the last day of this week, not the start of the next
  const tue = edgeSnap(at(0, TUE, 23.75)).snap
  assert.equal(tue.weekStartWed, "2026-10-14")
  assert.equal(tue.weekEndTue, "2026-10-20")
  assert.equal(tue.dayOfWeek, 7)
})

test("BOTH-venue Breadtop: half each side, and once it is in neither venue counts it again", () => {
  const before = edgeSnap(at(0, SAT, 8))
  for (const b of [before.burleigh, before.currumbin]) {
    const bt = b.stillToCome.find((r) => r.supplier === "Breadtop")
    assert.ok(bt, `${b.label}: Breadtop still to come before 9am`)
    assert.equal(bt!.amount, 300)
    assert.deepEqual(bt!.days, ["Sat"])
  }
  const after = edgeSnap(at(0, SAT, 10))
  for (const [b, was] of [[after.burleigh, before.burleigh], [after.currumbin, before.currumbin]] as const) {
    assert.equal(b.stillToCome.find((r) => r.supplier === "Breadtop"), undefined, b.label)
    assert.equal(cents(b.spentToDate - was.spentToDate), 300, b.label)
    assert.equal(cents(was.usualStillToCome - b.usualStillToCome), 300, b.label)
    assert.equal(b.leftToSpend, was.leftToSpend, b.label)
  }
  // Currumbin's budget is Beach House + Tea Garden forecast at the Beach House target
  assert.equal(after.currumbin.budget, 7840)
})

test("credit notes: one dated today does not mark the supplier delivered, and the figures still add up", () => {
  const now = at(0, SUN, 10)
  const plain = edgeSnap(now).burleigh
  const credits = [
    inv("Bidfood", 0, FRI, -600, at(0, SAT, 9)), // short-delivery credit for Friday
    inv("Pixel Bread", 0, SUN, -50, at(0, SUN, 9)), // credit for yesterday's stale loaves, dated today
  ]
  const b = edgeSnap(now, { thisWeek: [...patternWeek(0), ...credits] }).burleigh
  assert.equal(cents(plain.spentToDate - b.spentToDate), 650)
  assert.ok(b.estimatedSpentToDate <= plain.estimatedSpentToDate - 650 + 0.01)
  // Pixel's real Sunday bread (18:00) is still to come despite the credit
  assert.deepEqual(b.stillToCome.find((r) => r.supplier === "Pixel Bread")!.days, ["Sun", "Mon", "Tue"])
  assert.equal(b.usualStillToCome, plain.usualStillToCome)

  // A credit bigger than the week is refused by the guard, never printed
  const huge = buildSpendSnapshot(edgeRows(now, { thisWeek: [...patternWeek(0), inv("Bidfood", 0, FRI, -20000, at(0, SAT, 9))] }), now)
  assert.match(checkSpendSnapshot(huge).join(), /Burleigh: spentToDate is negative/)
  assert.throws(() => render(huge), /consistency check/)
})

test("fractional budgets, no forecast, and thin or no history: the guards hold at every hour", () => {
  const cases: Array<[string, Parameters<typeof edgeRows>[1]]> = [
    ["fractional budget", { forecasts: [{ venue: "BURLEIGH", amount: 103751.37 }, { venue: "BEACH_HOUSE", amount: 20999.99 }], targets: [{ venue: "BURLEIGH", targetPct: 27.5 }, { venue: "BEACH_HOUSE", targetPct: 28.25 }] }],
    ["no forecast", { forecasts: [] }],
    ["two weeks of takings history", { salesWeeks: [1, 2] }],
    ["no history at all", { history: [], salesWeeks: [] }],
  ]
  for (const [name, o] of cases) {
    for (let h = 0; h < 7 * 24; h += 5) {
      const now = at(0, WED, h + 0.5)
      // edgeSnap asserts checkSpendSnapshot is clean
      const { burleigh: b } = edgeSnap(now, o)
      const label = `${name} at ${now.toISOString()}`
      assert.ok(b.usualStillToCome >= 0, label)
      if (b.budget == null) {
        assert.equal(b.leftToSpend, null, label)
        assert.equal(b.leftBeforeStillToCome, null, label)
        assert.equal(b.paceStatus, "no-forecast", label)
      } else {
        assert.ok(Math.abs(b.leftToSpend! + b.estimatedSpentToDate + b.usualStillToCome - b.budget) <= 0.02, label)
      }
      if (name.includes("history")) {
        // no supplier pattern: no list, and still to come is the fallback's rest of week
        assert.deepEqual(b.stillToCome, [], label)
        assert.notEqual(b.spendProjectionMethod, "usual", label)
      }
    }
  }
  const frac = edgeSnap(at(0, SUN, 17), cases[0][1]).burleigh
  assert.equal(frac.budget, 28531.63)
})

test("spendSupplierKey: aliases, case and spacing all land on one supplier", async () => {
  const { spendSupplierKey } = await import("./snapshot")
  assert.equal(spendSupplierKey("  BIDFOOD "), "Bidfood")
  assert.equal(spendSupplierKey("Produce Oz"), "Jensens")
  assert.equal(spendSupplierKey("GOLD COAST  premium foods"), spendSupplierKey("Gold Coast Premium Foods"))
  assert.equal(spendSupplierKey("gold coast premium foods "), "Gold Coast Premium Foods")
})

// ------------------------------------------------ overdue invoices (25 Oct 2026)
// Sun 25 Oct 2026: Pixel Bread had invoiced nothing since Wednesday. The
// headline ignored the Thursday to Saturday bread, while the pace added
// Pixel's whole 4-week xlsx average on top of the bread already in and the
// bread already in still to come: Burleigh read $237 left and 30.6% COGS,
// about 29.4% really. Each day of Pixel's bread must now be counted once:
// in hand, overdue, or still to come.

/** This week to pattern, except Pixel sends nothing after Wednesday (until `resumeOn`). */
function pixelStops(resumeOn?: number): Inv[] {
  return patternWeek(0).filter((i) => {
    if (i.supplierName !== "Pixel Bread") return true
    const day = Math.round((i.invoiceDate!.getTime() - WEEK_START) / DAY)
    return day === WED || (resumeOn != null && day >= resumeOn)
  })
}

/** Louise's xlsx lines and the latest invoice per supplier, the way current-week.ts reads them. */
function withCoverage(r: SpendSnapshotRows, xlsx: SpendSnapshotRows["cogsSupplierHistory"] = []): SpendSnapshotRows {
  const latest = new Map<string, Date>()
  for (const i of [...r.invoiceHistory, ...r.invoices])
    if (i.invoiceDate && (!latest.has(i.supplierName) || latest.get(i.supplierName)! < i.invoiceDate)) latest.set(i.supplierName, i.invoiceDate)
  return {
    ...r,
    cogsSupplierHistory: xlsx,
    latestInvoiceByAlias: [...latest].map(([supplierName, d]) => ({ supplierName, _max: { invoiceDate: d } })),
  }
}

// Pixel at Burleigh in Louise's xlsx: $2,100 a week, the figure the pace used to add in full
const PIXEL_XLSX = [1, 2, 3, 4].map((w) => ({ venue: "BURLEIGH" as const, supplier: "Pixel Bread", amount: 2100, weekStartWed: dateOf(w, WED) }))

function pixelSnap(now: Date, thisWeek: Inv[] = pixelStops(), history?: Inv[]) {
  const snap = buildSpendSnapshot(withCoverage(edgeRows(now, { thisWeek, history }), PIXEL_XLSX), now)
  assert.deepEqual(checkSpendSnapshot(snap), [], `guards at ${now.toISOString()}`)
  const by = Object.fromEntries(snap.buckets.map((b) => [b.bucket, b]))
  return { snap, burleigh: by.BURLEIGH, currumbin: by.CURRUMBIN }
}

test("25 Oct: Pixel quiet since Wednesday, Sunday 08:30 counts Thursday to Saturday once, on its own line, and the pace agrees", () => {
  const { snap, burleigh: b, currumbin: c } = pixelSnap(at(0, SUN, 8.5))
  assert.equal(snap.coverage.find((r) => r.canonicalName === "Pixel Bread")!.status, "overdue")
  assert.deepEqual(b.overdueGapRows, [{ supplier: "Pixel Bread", amount: 900, days: ["Thu", "Fri", "Sat"], lastInvoiceDate: "2026-10-14" }])
  assert.equal(b.overdueGap, 900)
  // Sunday to Tuesday's bread is still to come, and only there
  assert.deepEqual(b.stillToCome.find((r) => r.supplier === "Pixel Bread"), { supplier: "Pixel Bread", amount: 900, days: ["Sun", "Mon", "Tue"] })
  // in hand + overdue + still to come = the usual week: nothing ignored, nothing doubled
  assert.ok(Math.abs(b.estimatedSpentToDate + b.overdueGap + b.usualStillToCome - 9500) < 0.05, `${b.estimatedSpentToDate} + ${b.overdueGap} + ${b.usualStillToCome}`)
  assert.ok(Math.abs(b.projectedEndOfWeek - 9500) < 0.05, `pace ${b.projectedEndOfWeek}, not 9,500 + the $2,100 xlsx week`)
  assert.ok(Math.abs(b.leftToSpend! - (9450 - 9500)) < 0.05)
  assert.ok(Math.abs(b.leftBeforeStillToCome! - b.leftToSpend! - b.usualStillToCome) < 0.015)
  // Currumbin gets no Pixel in this fixture, so no gap there
  assert.equal(c.overdueGap, 0)
  assert.deepEqual(c.overdueGapRows, [])

  const { text, html } = render(snap)
  assert.match(text, /about \$900 of overdue invoices \(Pixel Bread Thu to Sat \$900, delivered but their invoices stopped coming in\), and about \$[\d,]+ of usual deliveries still to come/)
  assert.match(html, /\+ \$900 overdue invoices/)
})

test("Pixel quiet since Wednesday: every hour of the week, each day of bread is counted exactly once", () => {
  for (let h = 24; h < 7 * 24; h++) {
    const now = at(0, WED, h + 0.5)
    const { burleigh: b } = pixelSnap(now)
    const day = Math.floor((h + 0.5) / 24)
    const label = `${now.toISOString()} (day ${day})`
    // Friday: Thursday's bread is a day late, not overdue yet (the coverage rule), so it is not counted
    const expected = day === FRI ? 9500 - 300 : 9500
    assert.ok(Math.abs(b.estimatedSpentToDate + b.overdueGap + b.usualStillToCome - expected) < 0.05, `${label}: ${b.estimatedSpentToDate} + ${b.overdueGap} + ${b.usualStillToCome}`)
    assert.ok(Math.abs(b.projectedEndOfWeek - expected) < 0.05, label)
    assert.equal(b.overdueGap, day >= SAT ? (day - THU) * 300 : 0, label)
  }
})

test("Pixel starts invoicing again on Sunday without the missing days: Monday still counts them; once sent the headline does not move", () => {
  const now = at(0, MON, 7)
  const { burleigh: b } = pixelSnap(now, pixelStops(SUN))
  assert.deepEqual(b.overdueGapRows.map((r) => [r.supplier, r.amount, r.days.join("/")]), [["Pixel Bread", 900, "Thu/Fri/Sat"]])
  assert.ok(Math.abs(b.estimatedSpentToDate + b.overdueGap + b.usualStillToCome - 9500) < 0.05)
  // Pixel backfills Thursday to Saturday at 6am Monday
  const backfill = [THU, FRI, SAT].map((d) => inv("Pixel Bread", 0, d, 300, at(0, MON, 6)))
  const sent = pixelSnap(now, [...pixelStops(SUN), ...backfill]).burleigh
  assert.equal(sent.overdueGap, 0)
  assert.equal(cents(sent.spentToDate - b.spentToDate), 900)
  assert.ok(Math.abs(sent.leftToSpend! - b.leftToSpend!) < 0.05, `${sent.leftToSpend} vs ${b.leftToSpend}`)
  assert.ok(Math.abs(sent.projectedEndOfWeek - b.projectedEndOfWeek) < 0.05)
})

test("a supplier that stopped weeks ago gets no gap, and its xlsx 4-week average no longer reaches the pace", () => {
  // Tasman to the Beach House every Friday, $500, until five weeks ago; nothing since
  const tasman = [5, 6, 7, 8].map((w) => venueInv("Tasman Distribution", "BEACH_HOUSE", w, FRI, 500, at(w, FRI, 12)))
  const xlsx = [5, 6, 7, 8].map((w) => ({ venue: "BEACH_HOUSE" as const, supplier: "Tasman Distribution", amount: 500, weekStartWed: dateOf(w, WED) }))
  const now = at(0, SUN, 8.5)
  const snap = buildSpendSnapshot(withCoverage(edgeRows(now, { history: [...HISTORY_WEEKS.flatMap(patternWeek), ...tasman] }), xlsx), now)
  assert.deepEqual(checkSpendSnapshot(snap), [])
  assert.equal(snap.coverage.find((r) => r.canonicalName === "Tasman Distribution")!.status, "overdue")
  const c = snap.buckets.find((b) => b.bucket === "CURRUMBIN")!
  assert.equal(c.overdueGap, 0)
  assert.ok(Math.abs(c.projectedEndOfWeek - (c.estimatedSpentToDate + c.usualStillToCome)) < 0.01)
})

// ------------------------------------------------ overdue edges (test guard, 25 Oct 2026)

test("a credit note is not an invoice: Pixel's stale-loaf credit dated Saturday does not end its silence", () => {
  // Pixel quiet since Wednesday, but sends a $40 credit dated Saturday. It is
  // Pixel's newest document, so it also comes back as latestInvoiceByAlias.
  const credit = inv("Pixel Bread", 0, SAT, -40, at(0, SAT, 15))
  const sun = pixelSnap(at(0, SUN, 8.5), [...pixelStops(), credit]).burleigh
  assert.deepEqual(sun.overdueGapRows.map((r) => [r.supplier, r.amount, r.days.join("/")]), [["Pixel Bread", 900, "Thu/Fri/Sat"]])
  // every day of bread once; the credit is a real $40 off
  assert.ok(Math.abs(sun.estimatedSpentToDate + sun.overdueGap + sun.usualStillToCome - (9500 - 40)) < 0.05, `${sun.estimatedSpentToDate} + ${sun.overdueGap} + ${sun.usualStillToCome}`)
  const mon = pixelSnap(at(0, MON, 7), [...pixelStops(), credit]).burleigh
  assert.equal(mon.overdueGap, 1200, "Thu to Sun overdue on Monday, the credit does not restart the clock")
})

test("BOTH-venue Fish Factory, invoiced two days late, stops after Wednesday: each venue's half is overdue once, out of its gross-up", () => {
  // $400 a day of fish split 50/50, each invoice raised two days after delivery
  const fish = (w: number) => ALL_DAYS.map((d) => venueInv("The Fish Factory", "BOTH", w, d, 400, at(w, d + 2, 7)))
  const history = HISTORY_WEEKS.flatMap((w) => [...patternWeek(w), ...fish(w)])
  const thisWeek = [...patternWeek(0), ...fish(0).filter((i) => i.invoiceDate!.getTime() === dateOf(0, WED).getTime())]
  const usualWeek = { BURLEIGH: 9500 + 1400, CURRUMBIN: 3200 + 1400 }
  for (let h = 0; h < 7 * 24; h++) {
    const now = at(0, WED, h + 0.5)
    const snap = buildSpendSnapshot(withCoverage(edgeRows(now, { thisWeek, history })), now)
    const label = `${now.toISOString()} (hour ${h})`
    assert.deepEqual(checkSpendSnapshot(snap), [], label)
    const day = Math.floor((h + 0.5) / 24)
    for (const b of snap.buckets) {
      const sum = b.estimatedSpentToDate + b.overdueGap + b.usualStillToCome
      // never counted twice, at any hour
      assert.ok(sum <= usualWeek[b.bucket] + 0.05, `${b.label} ${label}: ${sum}`)
      if (day >= MON) {
        // overdue from Monday (run of 5 days > 2 x 2): Thu to the day before today, $200 a day each side
        assert.deepEqual(b.overdueGapRows.map((r) => r.supplier), ["The Fish Factory"], `${b.label} ${label}`)
        assert.equal(b.overdueGap, (day - THU) * 200, `${b.label} ${label}`)
        assert.ok(Math.abs(sum - usualWeek[b.bucket]) < 0.05, `${b.label} ${label}: ${b.estimatedSpentToDate} + ${b.overdueGap} + ${b.usualStillToCome}`)
      } else {
        assert.equal(b.overdueGap, 0, `${b.label} ${label}`)
      }
    }
  }
})

test("Pixel silent since last Saturday: Wednesday 11:30pm AEST has no gap, Thursday 00:30 AEST (still Wednesday in UTC) has Wednesday's", () => {
  const history = HISTORY_WEEKS.flatMap(patternWeek).filter(
    (i) => !(i.supplierName === "Pixel Bread" && i.invoiceDate!.getTime() > dateOf(1, SAT).getTime())
  )
  const thisWeek = patternWeek(0).filter((i) => i.supplierName !== "Pixel Bread")
  const wed = pixelSnap(at(0, WED, 23.5), thisWeek, history).burleigh
  assert.equal(wed.overdueGap, 0)
  const thuNow = at(0, THU, 0.5)
  assert.match(thuNow.toISOString(), /^2026-10-14T14:30/)
  const thu = pixelSnap(thuNow, thisWeek, history)
  assert.equal(thu.snap.dayOfWeek, 2)
  assert.deepEqual(thu.burleigh.overdueGapRows.map((r) => [r.supplier, r.days.join("/"), r.lastInvoiceDate]), [["Pixel Bread", "Wed", "2026-10-10"]])
  // Wednesday's bread moved from still to come to overdue, the headline did not move
  assert.ok(Math.abs(thu.burleigh.leftToSpend! - wed.leftToSpend!) < 0.05, `${thu.burleigh.leftToSpend} vs ${wed.leftToSpend}`)
  const tue = pixelSnap(at(0, TUE, 23.75), thisWeek, history).burleigh
  assert.deepEqual(tue.overdueGapRows[0].days, ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon"])
  assert.deepEqual(tue.stillToCome.find((r) => r.supplier === "Pixel Bread")!.days, ["Tue"])
})

test("guard: an overdue gap left out of the headline, doubled in the pace, or also still to come is withheld", () => {
  const { snap, burleigh: b } = pixelSnap(at(0, SUN, 8.5))
  const swap = (over: Partial<typeof b>) => checkSpendSnapshot({ ...snap, buckets: [{ ...b, ...over }] }).join(" | ")
  // the 25 Oct headline: gap ignored
  assert.match(swap({ leftToSpend: cents(b.leftToSpend! + b.overdueGap) }), /leftToSpend .* \+ overdue 900 ≠ budget 9450/)
  // the 25 Oct pace: a whole week added on top
  assert.match(swap({ projectedEndOfWeek: cents(b.projectedEndOfWeek + 2100) }), /projectedEndOfWeek .* ≠ used .* \+ overdue 900/)
  // the list must add up, and a day cannot be both overdue and still to come
  assert.match(swap({ overdueGapRows: [] }), /overdue rows add to 0, not overdueGap 900/)
  assert.match(
    swap({ overdueGapRows: [{ ...b.overdueGapRows[0], days: ["Sat", "Sun"] }] }),
    /Pixel Bread Sun is both overdue and still to come/
  )
  assert.match(swap({ overdueGap: -5, overdueGapRows: [] }), /overdueGap is negative/)
})
