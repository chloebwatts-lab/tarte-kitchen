import { test } from "node:test"
import assert from "node:assert/strict"
import { isDeadSession, validateChromeRows, chromeIngestSql } from "./chrome-pull"
import { UberAuthError } from "./client"

test("isDeadSession: both UberAuthError wordings are dead, other errors and null are not", () => {
  assert.equal(isDeadSession(new UberAuthError().message), true)
  assert.equal(isDeadSession("Uber answered with a login page, not data. Paste a fresh cookie in Settings > Integrations."), true)
  assert.equal(isDeadSession("fetch failed"), false)
  assert.equal(isDeadSession("Uber getHomepageDataV2 HTTP 500: oops"), false)
  assert.equal(isDeadSession(null), false)
  assert.equal(isDeadSession(undefined), false)
  assert.equal(isDeadSession(""), false)
})

test("validateChromeRows: keeps good rows from { rows } or a bare array, rounds sales to cents", () => {
  const good = { date: "2026-11-05", venue: "BEACH_HOUSE", sales: 1001.534, orders: 18 }
  assert.deepEqual(validateChromeRows({ signedIn: true, rows: [good] }), { rows: [{ ...good, sales: 1001.53 }], rejected: 0 })
  assert.deepEqual(validateChromeRows([good]).rows.length, 1)
  assert.deepEqual(validateChromeRows(null), { rows: [], rejected: 0 })
  assert.deepEqual(validateChromeRows({ rows: "nope" }), { rows: [], rejected: 0 })
})

test("validateChromeRows: drops bad dates, unknown venues, odd numbers and duplicate venue-days", () => {
  const { rows, rejected } = validateChromeRows([
    { date: "2026-02-30", venue: "BURLEIGH", sales: 1, orders: 1 },
    { date: "5/11/2026", venue: "BURLEIGH", sales: 1, orders: 1 },
    { date: "2026-11-05'; drop table x; --", venue: "BURLEIGH", sales: 1, orders: 1 },
    { date: "2026-11-05", venue: "TEA_GARDEN", sales: 1, orders: 1 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: -1, orders: 1 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: "12", orders: 1 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: Number.NaN, orders: 1 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: 10, orders: 1.5 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: 379.65, orders: 11 },
    { date: "2026-11-05", venue: "BURLEIGH", sales: 999, orders: 99 },
    null,
  ])
  assert.deepEqual(rows, [{ date: "2026-11-05", venue: "BURLEIGH", sales: 379.65, orders: 11 }])
  assert.equal(rejected, 10)
})

test("chromeIngestSql: upserts every row, keeps a stored day with orders from a $0 answer, stamps lastSyncAt", () => {
  assert.equal(chromeIngestSql([]), "")
  const sql = chromeIngestSql([
    { date: "2026-11-05", venue: "BURLEIGH", sales: 379.65, orders: 11 },
    { date: "2026-11-07", venue: "BEACH_HOUSE", sales: 0, orders: 0 },
  ])
  assert.match(sql, /date '2026-11-05', 'BURLEIGH', 379\.65, 11, now\(\)/)
  assert.match(sql, /date '2026-11-07', 'BEACH_HOUSE', 0\.00, 0, now\(\)/)
  assert.match(sql, /on conflict \(date, venue\) do update/)
  assert.match(sql, /where not \(excluded\.orders = 0 and "DailyUberSales"\.orders > 0\);/)
  assert.match(sql, /update "UberEatsConnection" set "lastSyncAt" = now\(\);/)
})
