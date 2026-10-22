import { test } from "node:test"
import assert from "node:assert/strict"
import { squareLocations, toAccount } from "./token"

// Only the pure parts: reading the stored location mapping and shaping an
// account row for the settings card. Token storage and lookup hit the DB.

test("squareLocations: null connection, empty and junk entries", () => {
  assert.deepEqual(squareLocations(null), [])
  assert.deepEqual(squareLocations({ locations: null }), [])
  assert.deepEqual(squareLocations({ locations: [] }), [])
  const stored = [
    { id: "L-BH", name: "Beach House", venue: "BEACH_HOUSE" },
    null,
    { name: "No id", venue: "BURLEIGH" },
    { id: 42, name: "Numeric id", venue: "BURLEIGH" },
    { id: "L-TG", name: "Tea Garden", venue: "TEA_GARDEN" },
  ]
  assert.deepEqual(squareLocations({ locations: stored }), [
    { id: "L-BH", name: "Beach House", venue: "BEACH_HOUSE" },
    { id: "L-TG", name: "Tea Garden", venue: "TEA_GARDEN" },
  ])
})

test("toAccount: drops the encrypted token, keeps the account facts and the cleaned locations", () => {
  const connectedAt = new Date("2026-10-01T00:00:00Z")
  const lastSyncAt = new Date("2026-10-22T03:30:00Z")
  const row = {
    id: "conn-currumbin",
    accessToken: "aa:bb:cc",
    merchantId: "ML-CURRUMBIN",
    merchantName: "Tarte Currumbin",
    connectedAt,
    lastSyncAt,
    lastError: null,
    locations: [{ id: "L-BH", name: "Beach House", venue: "BEACH_HOUSE" }, { id: "L-TG", name: "Tea Garden", venue: "TEA_GARDEN" }, {}],
  }
  const account = toAccount(row)
  assert.deepEqual(account, {
    id: "conn-currumbin",
    merchantId: "ML-CURRUMBIN",
    merchantName: "Tarte Currumbin",
    connectedAt,
    lastSyncAt,
    lastError: null,
    locations: [{ id: "L-BH", name: "Beach House", venue: "BEACH_HOUSE" }, { id: "L-TG", name: "Tea Garden", venue: "TEA_GARDEN" }],
  })
  assert.equal("accessToken" in account, false)
  // A fresh Burleigh row that has never synced
  const burleigh = toAccount({ id: "conn-burleigh", accessToken: "x", merchantId: "ML-BURLEIGH", merchantName: "Tarte Bakery", connectedAt, lastSyncAt: null, lastError: "Square /orders/search failed: 401", locations: null })
  assert.equal(burleigh.lastSyncAt, null)
  assert.equal(burleigh.lastError, "Square /orders/search failed: 401")
  assert.deepEqual(burleigh.locations, [])
})
