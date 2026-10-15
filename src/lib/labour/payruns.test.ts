import { test } from "node:test"
import assert from "node:assert/strict"
import { mergePayRunsByWeek, payRunOrgs, payRunForWeek, PAY_RUN_ORG_VENUES } from "./payruns"
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

test("payRunForWeek picks the run whose period starts on the digest week's Wednesday (w/e 13 Oct 2026 real figures)", () => {
  const runs = [
    run({ payRunId: "bakery-6oct", grossWages: 48246.64, superAmount: 5520.88, totalCost: 53767.52 }),
    run({ payRunId: "bakery-13oct", weekStart: new Date("2026-10-07T00:00:00.000Z"), weekEnd: new Date("2026-10-13T00:00:00.000Z"), grossWages: 40937.67, superAmount: 4748.79, totalCost: 45686.46, headcount: 51 }),
  ]
  assert.equal(payRunForWeek(runs, new Date("2026-10-07T00:00:00.000Z"))?.payRunId, "bakery-13oct")
  assert.equal(payRunForWeek(runs, new Date("2026-10-07T00:00:00.000Z"))?.totalCost, 45686.46)
  // Not posted yet: the digest must say so rather than show another week.
  assert.equal(payRunForWeek(runs, new Date("2026-10-14T00:00:00.000Z")), null)
  assert.equal(payRunForWeek([], new Date("2026-10-07T00:00:00.000Z")), null)
})

test("every venue is paid by exactly one Xero entity", () => {
  const venues = PAY_RUN_ORG_VENUES.flatMap((o) => [...o.venues]).sort()
  assert.deepEqual(venues, ["BEACH_HOUSE", "BURLEIGH", "TEA_GARDEN"])
  assert.deepEqual(PAY_RUN_ORG_VENUES.map((o) => o.org), ["Tarte Bakery", "Tarte Currumbin"])
})

// ---------------------------------------------------------------- test-guard: feed config + fetch (16 Oct 2026)
// The Friday digest now reads posted pay runs straight from the Tarte Shifts
// feed when Louise's PDFs are missing, so the fetch helper that moved here
// from the cron route is exercised with fetch stubbed (no network).

import { mock } from "node:test"
import { fetchShiftsPayRuns, shiftsPayRunsConfigured } from "./payruns"

const FEED_ENV = { SHIFTS_PAYRUNS_URL: "https://shifts.tarte.com.au/api/internal/payruns", SHIFTS_SECRET: "shh" }
const WED_7_OCT = new Date("2026-10-07T00:00:00.000Z")

test("shiftsPayRunsConfigured needs both the feed URL and the secret; docker-compose empty strings do not count", () => {
  assert.equal(shiftsPayRunsConfigured(FEED_ENV), true)
  assert.equal(shiftsPayRunsConfigured({ SHIFTS_PAYRUNS_URL: FEED_ENV.SHIFTS_PAYRUNS_URL }), false)
  assert.equal(shiftsPayRunsConfigured({ SHIFTS_SECRET: "shh" }), false)
  assert.equal(shiftsPayRunsConfigured({ SHIFTS_PAYRUNS_URL: "", SHIFTS_SECRET: "shh" }), false)
  assert.equal(shiftsPayRunsConfigured({ SHIFTS_PAYRUNS_URL: FEED_ENV.SHIFTS_PAYRUNS_URL, SHIFTS_SECRET: "" }), false)
  assert.equal(shiftsPayRunsConfigured({}), false)
})

interface FeedCall { url: URL; auth: string | undefined; cache: unknown }

async function withFeed(status: number, body: unknown, fn: (calls: FeedCall[]) => Promise<void>) {
  const calls: FeedCall[] = []
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url: new URL(String(url)), auth: h.Authorization, cache: init?.cache })
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  })
  try {
    await fn(calls)
  } finally {
    mock.restoreAll()
  }
}

test("fetchShiftsPayRuns asks for one org from the digest Wednesday with the bearer secret, and revives the dates (w/e 13 Oct 2026 Bakery run)", async () => {
  const feed = {
    ok: true,
    payRuns: [{ payRunId: "PR-13OCT", weekStart: "2026-10-07", weekEnd: "2026-10-13", paymentDate: "2026-10-15", grossWages: 40937.67, superAmount: 4748.79, totalCost: 45686.46, headcount: 51 }],
  }
  await withFeed(200, feed, async (calls) => {
    // A caller passing an instant later in the UTC day must still ask from that date.
    const runs = await fetchShiftsPayRuns("Tarte Bakery", new Date("2026-10-07T09:30:00.000Z"), FEED_ENV)
    assert.equal(calls.length, 1, "one call per org")
    assert.equal(calls[0].url.origin + calls[0].url.pathname, FEED_ENV.SHIFTS_PAYRUNS_URL)
    assert.equal(calls[0].url.searchParams.get("org"), "Tarte Bakery")
    assert.equal(calls[0].url.searchParams.get("from"), "2026-10-07")
    assert.equal(calls[0].auth, "Bearer shh")
    assert.equal(calls[0].cache, "no-store")
    assert.equal(runs.length, 1)
    assert.ok(runs[0].weekStart instanceof Date)
    assert.equal(runs[0].weekStart.toISOString(), "2026-10-07T00:00:00.000Z")
    assert.equal(runs[0].weekEnd.toISOString(), "2026-10-13T00:00:00.000Z")
    assert.equal(runs[0].paymentDate.toISOString(), "2026-10-15T00:00:00.000Z")
    assert.equal(runs[0].totalCost, 45686.46)
    assert.equal(runs[0].headcount, 51)
    // The revived run is the one the digest week picks up.
    assert.equal(payRunForWeek(runs, WED_7_OCT)?.payRunId, "PR-13OCT")
  })
})

test("fetchShiftsPayRuns: an empty or absent payRuns list is [], a feed error or HTTP failure throws naming the org", async () => {
  await withFeed(200, { ok: true, payRuns: [] }, async () => {
    assert.deepEqual(await fetchShiftsPayRuns("Tarte Currumbin", WED_7_OCT, FEED_ENV), [])
  })
  await withFeed(200, { ok: true }, async () => {
    assert.deepEqual(await fetchShiftsPayRuns("Tarte Currumbin", WED_7_OCT, FEED_ENV), [])
  })
  await withFeed(200, { ok: false, error: "Xero token expired" }, async () => {
    await assert.rejects(
      fetchShiftsPayRuns("Tarte Currumbin", WED_7_OCT, FEED_ENV),
      /Tarte Shifts pay-runs feed \(Tarte Currumbin\): Xero token expired/
    )
  })
  await withFeed(401, {}, async () => {
    await assert.rejects(fetchShiftsPayRuns("Tarte Bakery", WED_7_OCT, FEED_ENV), /Tarte Shifts pay-runs feed \(Tarte Bakery\): 401/)
  })
})

test("payRunForWeek keys on the UTC calendar date: a feed that ever sent a true AEST instant would read as 'not posted'", () => {
  // Shifts sends date-only strings today (the sync route stores them as
  // LabourWeekActual.weekStartWed the same way). Documenting the assumption.
  const aestWed = run({ payRunId: "aest", weekStart: new Date("2026-10-07T00:00:00+10:00"), totalCost: 1 })
  assert.equal(payRunForWeek([aestWed], WED_7_OCT), null)
  assert.equal(payRunForWeek([aestWed], new Date("2026-10-06T00:00:00.000Z"))?.payRunId, "aest")
})
