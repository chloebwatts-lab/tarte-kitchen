import { test } from "node:test"
import assert from "node:assert/strict"
import { buildGmLiveSimple, simpleCogs, simpleWage } from "./live-simple"
import type { LiveVenueSnapshot } from "@/lib/labour/live"
import type { BucketSpendData } from "@/lib/spend/types"

function venue(v: string, label: string, o: Partial<LiveVenueSnapshot> = {}): LiveVenueSnapshot {
  return {
    venue: v,
    label,
    workingProjectedPct: 34.26,
    overallProjectedPct: 35.9,
    locked: { labour: 0, revenue: 0, pct: null, days: 0, paidLeave: 0, workingPct: null },
    buckets: [],
    ...o,
  } as unknown as LiveVenueSnapshot
}

function bucket(b: "BURLEIGH" | "CURRUMBIN", o: Partial<BucketSpendData> = {}): BucketSpendData {
  return { bucket: b, label: b === "BURLEIGH" ? "Burleigh" : "Currumbin", targetPct: 30, projectedEndOfWeek: 29000, projectedRevenueExGst: 100000, paceStatus: "on-track", ...o } as unknown as BucketSpendData
}

test("wage headline is the paid-leave-out forecast, the same field Chloe's page shows big", () => {
  const w = simpleWage(venue("BURLEIGH", "Burleigh", { workingProjectedPct: 34.26, overallProjectedPct: 36.8 }))
  assert.equal(w.pct, 34.3)
})

test("finished days show only once a day is done (not on a Wednesday)", () => {
  assert.equal(simpleWage(venue("BURLEIGH", "Burleigh")).lockedPct, null)
  const w = simpleWage(venue("BURLEIGH", "Burleigh", { locked: { labour: 1, revenue: 1, pct: 40, days: 5, paidLeave: 0, workingPct: 33.84 } }))
  assert.equal(w.lockedPct, 33.8)
  assert.equal(w.lockedDays, 5)
})

test("department chips carry the band and the working status colour", () => {
  const w = simpleWage(
    venue("BURLEIGH", "Burleigh", {
      buckets: [
        { key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 11.5, max: 12 }, workingPct: 11.94, workingStatus: "ok" },
        { key: "fohBarista", label: "FOH + Barista", target: { key: "fohBarista", label: "FOH + Barista", min: 20.5, max: 21 }, workingPct: 21.3, workingStatus: "amber" },
        { key: "pastry", label: "Pastry", target: null, workingPct: null, workingStatus: "no-target" },
      ] as unknown as LiveVenueSnapshot["buckets"],
    }),
  )
  assert.deepEqual(w.depts, [
    { label: "Chefs + KP", pct: 11.9, band: "11.5 to 12%", tone: "ok" },
    { label: "FOH + Barista", pct: 21.3, band: "20.5 to 21%", tone: "amber" },
    { label: "Pastry", pct: null, band: "", tone: "none" },
  ])
})

test("COGS headline is projected spend over projected takings, as on Chloe's page", () => {
  const c = simpleCogs(bucket("BURLEIGH", { projectedEndOfWeek: 31250, projectedRevenueExGst: 100000, paceStatus: "over" }))
  assert.equal(c.pct, 31.3)
  assert.equal(c.tone, "red")
  assert.equal(c.status, "Over")
})

test("COGS with no takings forecast yet shows no % instead of dividing by zero", () => {
  const c = simpleCogs(bucket("CURRUMBIN", { projectedRevenueExGst: null, paceStatus: "no-forecast" }))
  assert.equal(c.pct, null)
  assert.equal(c.tone, "none")
  const z = simpleCogs(bucket("CURRUMBIN", { projectedRevenueExGst: 0 }))
  assert.equal(z.pct, null)
})

test("sites: Burleigh on its own, Currumbin is Beach House + Tea Garden wages with the Currumbin COGS bucket", () => {
  const s = buildGmLiveSimple(
    { weekLabel: "18 Nov to 24 Nov", venues: [venue("TEA_GARDEN", "Tea Garden"), venue("BURLEIGH", "Burleigh"), venue("BEACH_HOUSE", "Beach House")] },
    { buckets: [bucket("CURRUMBIN"), bucket("BURLEIGH")] },
  )
  assert.deepEqual(s.sites.map((x) => x.key), ["BURLEIGH", "CURRUMBIN"])
  assert.deepEqual(s.sites[0].wages.map((w) => w.venue), ["BURLEIGH"])
  assert.deepEqual(s.sites[1].wages.map((w) => w.venue), ["BEACH_HOUSE", "TEA_GARDEN"])
  assert.equal(s.sites[0].cogs?.label, "Burleigh")
  assert.equal(s.sites[1].cogs?.label, "Currumbin")
  assert.equal(s.weekLabel, "18 Nov to 24 Nov")
})

test("a venue or bucket missing from the engines is left out, not shown as 0%", () => {
  const s = buildGmLiveSimple({ weekLabel: "w", venues: [venue("BEACH_HOUSE", "Beach House")] }, { buckets: [] })
  assert.deepEqual(s.sites[0].wages, [])
  assert.equal(s.sites[0].cogs, null)
  assert.deepEqual(s.sites[1].wages.map((w) => w.venue), ["BEACH_HOUSE"])
})
