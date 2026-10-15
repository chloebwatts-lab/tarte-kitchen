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
  sectionTone,
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

test("sectionFromParam only accepts the venue's own sections", () => {
  const { sectionFromParam } = require("./stations") as typeof import("./stations")
  assert.equal(sectionFromParam("BEACH_HOUSE", "Café"), "Café")
  assert.equal(sectionFromParam("BEACH_HOUSE", "KP"), "KP")
  assert.equal(sectionFromParam("BURLEIGH", "Market grill"), "Market grill")
  assert.equal(sectionFromParam("BURLEIGH", "Café"), null, "another venue's section")
  assert.equal(sectionFromParam("BEACH_HOUSE", "cafe"), null, "exact spelling only")
  assert.equal(sectionFromParam("TEA_GARDEN", "Café"), null)
  assert.equal(sectionFromParam("BOTH", "Café"), null)
  assert.equal(sectionFromParam("BEACH_HOUSE", null), null)
  assert.equal(sectionFromParam("BEACH_HOUSE", ""), null)
})

// ─── Added by test-guard, 14 Oct 2026 ───────────────────────────────────────

test("sectionFromParam: undefined, the Whole-list sentinel and padded names are the whole list", () => {
  const { sectionFromParam } = require("./stations") as typeof import("./stations")
  assert.equal(sectionFromParam("BEACH_HOUSE", undefined), null)
  assert.equal(sectionFromParam("BEACH_HOUSE", "ALL"), null, "WHOLE_LIST is not a section")
  assert.equal(sectionFromParam("BEACH_HOUSE", " Café"), null)
  assert.equal(sectionFromParam("BEACH_HOUSE", "Main prep"), "Main prep")
  assert.equal(sectionFromParam("BURLEIGH", "Production"), "Production")
  assert.equal(sectionFromParam("BURLEIGH", "Main prep"), null, "Beach House section at Burleigh")
})

test("sectionTone: a colour per section, gold first and for anything unsectioned", () => {
  const bh = prepSectionsFor("BEACH_HOUSE").map((s) => sectionTone("BEACH_HOUSE", s).bg)
  assert.equal(bh[0], "var(--tk-gold)")
  assert.equal(new Set(bh).size, bh.length)
  assert.equal(sectionTone("BEACH_HOUSE", "Station restock").bg, "var(--tk-gold)")
  assert.equal(sectionTone("TEA_GARDEN", "Station restock").bg, "var(--tk-gold)")
  // Burleigh has five sections and five colours, none shared
  const bu = prepSectionsFor("BURLEIGH").map((s) => sectionTone("BURLEIGH", s).bg)
  assert.equal(new Set(bu).size, bu.length)
})

test("sectionTone: another venue's section, BOTH, and a plain list all read gold; Burleigh's fifth section has its own colour", () => {
  assert.equal(sectionTone("BURLEIGH", "Café").bg, "var(--tk-gold)", "Beach House section shown at Burleigh")
  assert.equal(sectionTone("BOTH", "Restaurant").bg, "var(--tk-gold)")
  assert.equal(sectionTone("TEA_GARDEN", "").bg, "var(--tk-gold)")
  assert.notEqual(sectionTone("BURLEIGH", "Production").bg, "var(--tk-gold)")
  assert.equal(sectionTone("BURLEIGH", "Production").bg, sectionTone("BURLEIGH", "Production").bg)
  // Same section name gives the same colour on both the count sheet and the run
  assert.deepEqual(sectionTone("BEACH_HOUSE", "Café"), sectionTone("BEACH_HOUSE", "Café"))
  // Every tone pairs a background with a readable foreground
  for (const s of prepSectionsFor("BURLEIGH")) {
    const t = sectionTone("BURLEIGH", s)
    assert.ok(t.bg && t.fg, `tone for ${s}`)
  }
})
