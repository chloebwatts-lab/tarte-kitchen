import { test } from "node:test"
import assert from "node:assert/strict"
import {
  stationsForVenue,
  isKitchenStation,
  stationLabel,
  stationShortLabel,
  prepSectionsFor,
  sectionHint,
  sectionPrompt,
  sectionRank,
  VENUE_PREP_SECTIONS,
} from "./stations"

test("every real venue counts on one MAIN sheet; BOTH has no stations", () => {
  assert.deepEqual(stationsForVenue("BURLEIGH"), ["MAIN"])
  assert.deepEqual(stationsForVenue("BEACH_HOUSE"), ["MAIN"])
  assert.deepEqual(stationsForVenue("TEA_GARDEN"), ["MAIN"])
  assert.deepEqual(stationsForVenue("BOTH"), [])
})

test("isKitchenStation accepts the three enum values only", () => {
  assert.equal(isKitchenStation("MAIN"), true)
  assert.equal(isKitchenStation("CAFE"), true)
  assert.equal(isKitchenStation("RESTAURANT"), true)
  assert.equal(isKitchenStation("main"), false)
  assert.equal(isKitchenStation(""), false)
  assert.equal(isKitchenStation(null), false)
})

test("station labels describe the whole-venue list at Beach House and Burleigh, plain elsewhere", () => {
  assert.equal(stationLabel("BEACH_HOUSE", "MAIN"), "Both kitchens, one list")
  assert.equal(stationLabel("BURLEIGH", "MAIN"), "Main kitchen, Market and Production")
  assert.equal(stationLabel("TEA_GARDEN", "MAIN"), "Kitchen")
  assert.equal(stationLabel("BEACH_HOUSE", "CAFE"), "Cafe kitchen")
  assert.equal(stationShortLabel("BEACH_HOUSE", "MAIN"), "Both kitchens")
  assert.equal(stationShortLabel("BURLEIGH", "MAIN"), "All stations")
  assert.equal(stationShortLabel("BEACH_HOUSE", "RESTAURANT"), "Restaurant")
})

test("prep sections per venue", () => {
  assert.deepEqual([...prepSectionsFor("BEACH_HOUSE")], ["Restaurant", "Café", "KP", "Main prep"])
  assert.equal(prepSectionsFor("BURLEIGH").length, 5)
  assert.deepEqual([...prepSectionsFor("TEA_GARDEN")], [])
  assert.deepEqual([...prepSectionsFor("BOTH")], [])
})

test("section names never repeat across venues (sectionRank relies on it)", () => {
  const all = Object.values(VENUE_PREP_SECTIONS).flat()
  assert.equal(new Set(all).size, all.length)
})

test("sectionHint: owner first, 'responsible' at Beach House, nothing at Burleigh", () => {
  assert.equal(sectionHint("BEACH_HOUSE", "Main prep"), "Michelle")
  assert.equal(sectionHint("BEACH_HOUSE", "KP"), "responsible")
  assert.equal(sectionHint("BURLEIGH", "Market grill"), null)
  assert.equal(sectionHint("TEA_GARDEN", "anything"), null)
})

test("sectionPrompt asks which station at Burleigh and who makes it elsewhere", () => {
  assert.equal(sectionPrompt("BURLEIGH"), "Which station:")
  assert.equal(sectionPrompt("BEACH_HOUSE"), "Who makes it:")
})

test("sectionRank orders venue sections, then the legacy header, then everything else", () => {
  assert.equal(sectionRank("Restaurant"), 0)
  assert.equal(sectionRank("Main prep"), 3)
  assert.equal(sectionRank("Main kitchen grill"), 4)
  assert.equal(sectionRank("Production"), 8)
  assert.equal(sectionRank("Station restock"), 9)
  assert.equal(sectionRank("Sauces"), 10)
  assert.equal(sectionRank(""), 10)
  assert.ok(sectionRank("Production") < sectionRank("Station restock"))
  assert.ok(sectionRank("Station restock") < sectionRank("Zzz"))
})
