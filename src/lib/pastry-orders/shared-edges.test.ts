import { test } from "node:test"
import assert from "node:assert/strict"
import { buildFeed, cakesNotInPastry, pastryItems, type CakeRowIn } from "@/lib/upcoming/merge"
import {
  SCAN_FIELDS,
  STAFF_FIELDS,
  addDays,
  brisbaneDay,
  brisbaneIso,
  cleanLine,
  cleanLog,
  countCards,
  groupCards,
  inNext7,
  logId,
  logIdMs,
  openLines,
  pastryFeedRows,
  scanPatch,
  toMake,
  validDay,
  validId,
  validTime,
  venueName,
  type PastryLine,
} from "./shared"

// Edge cases for Pastry Orders (pre-push guard, 28 Nov 2026).
// Customer names are made up.

const TODAY = "2026-11-28"

function line(p: Partial<PastryLine> & { id: string }): PastryLine {
  return {
    order: p.id.replace(/-\d+$/, ""),
    customer: "Nora Field",
    venue: "Burleigh",
    date: TODAY,
    time: "14:00",
    item: "Strawberry Tarte",
    qty: 1,
    price: 0,
    contact: "",
    notes: "",
    flag: "",
    flagKind: "",
    status: "active",
    source: "Squarespace",
    channel: "",
    payment: "",
    takenBy: "",
    staffStatus: "",
    staffStatusBy: "",
    staffStatusAt: "",
    staffStatusNote: "",
    changeNote: "",
    pickedUp: false,
    pickedUpBy: "",
    pickedUpAt: "",
    flagResolved: false,
    resolvedBy: "",
    resolvedAt: "",
    resolvedNote: "",
    updatedAt: "",
    ...p,
  }
}

test("Brisbane day rolls over at 14:00 UTC, all year (no daylight saving)", () => {
  assert.equal(brisbaneDay(new Date("2026-11-28T13:59:59Z")), "2026-11-28")
  assert.equal(brisbaneDay(new Date("2026-11-28T14:00:00Z")), "2026-11-29")
  assert.equal(brisbaneDay(new Date("2026-12-31T14:00:00Z")), "2027-01-01")
  assert.equal(brisbaneDay(new Date("2026-06-30T13:59:59Z")), "2026-06-30")
  assert.equal(brisbaneDay(new Date("2026-11-28T20:30:00Z"), 1), "2026-11-30")
  // The 6:30am push (20:30 UTC the day before) and the 2pm push (04:00 UTC) land on the right day.
  assert.equal(brisbaneDay(new Date("2026-11-27T20:30:00Z")), "2026-11-28")
  assert.equal(brisbaneDay(new Date("2026-11-28T04:00:00Z")), "2026-11-28")
  assert.equal(brisbaneIso(new Date("2026-11-28T14:00:05Z")), "2026-11-29T00:00:05+10:00")
  assert.equal(Date.parse(brisbaneIso(new Date("2026-11-28T08:13:05Z"))), Date.parse("2026-11-28T08:13:05Z"))
})

test("days: month ends, leap day, and dates that do not exist", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01")
  assert.equal(addDays("2026-12-31", 1), "2027-01-01")
  assert.equal(addDays("2028-02-28", 1), "2028-02-29")
  assert.equal(addDays("2026-03-01", -1), "2026-02-28")
  assert.equal(validDay("2028-02-29"), "2028-02-29")
  assert.equal(validDay("2026-02-29"), "")
  assert.equal(validDay("2026-11-31"), "")
  assert.equal(validDay("28/11/2026"), "")
  assert.equal(validDay(20261128), "")
  assert.equal(validDay(null), "")
  assert.equal(inNext7("2026-12-04", TODAY), true)
  assert.equal(inNext7("2026-12-05", TODAY), false)
  assert.equal(inNext7("2026-11-27", TODAY), false)
  assert.equal(inNext7("", TODAY), false)
})

test("times: only real 24 hour times get through", () => {
  assert.equal(validTime("9:30"), "09:30")
  assert.equal(validTime("13:00:00"), "13:00")
  assert.equal(validTime("23:59"), "23:59")
  assert.equal(validTime("24:00"), "")
  assert.equal(validTime("13:60"), "")
  assert.equal(validTime("1pm"), "")
  assert.equal(validTime("1:30pm"), "13:30")
  assert.equal(validTime("12:15 am"), "00:15")
  assert.equal(validTime("14:00pm"), "")
  assert.equal(validTime(930), "")
  assert.equal(validTime(undefined), "")
})

test("open orders: yesterday drops out, today and no date stay", () => {
  const open = openLines([line({ id: "1-1", date: "2026-11-27" }), line({ id: "2-1" }), line({ id: "3-1", date: "" }), line({ id: "4-1", item: "eGift Card $50" })], TODAY)
  assert.deepEqual(open.map((l) => l.id), ["2-1", "3-1"])
})

test("scan and staff fields never overlap, and together with id cover the whole row", () => {
  const scan = new Set<string>(SCAN_FIELDS)
  for (const k of STAFF_FIELDS) assert.equal(scan.has(k), false, k)
  assert.deepEqual([...SCAN_FIELDS, ...STAFF_FIELDS, "id"].sort(), Object.keys(line({ id: "x-1" })).sort())
})

test("scan patch: whatever is posted, no staff field and no id is ever in the patch", () => {
  const was = line({
    id: "90040-1",
    channel: "Phone",
    payment: "Deposit paid",
    takenBy: "Jess",
    staffStatus: "refunded",
    staffStatusBy: "Mia",
    staffStatusAt: "2026-11-28T10:00:00+10:00",
    staffStatusNote: "Refunded in Square",
    changeNote: "swapped (Jess)",
    pickedUp: true,
    pickedUpBy: "Jess",
    pickedUpAt: "2026-11-28T09:00:00+10:00",
    flag: "Check the venue",
    flagResolved: true,
    resolvedBy: "Mia",
    resolvedAt: "2026-11-28T09:30:00+10:00",
    resolvedNote: "Rang her",
  })
  // The scan posts the same order with every staff field wiped and every scan field changed.
  const posted = cleanLine({ id: "90040-1", order: "90040", customer: "Nora F", venue: "Currumbin", date: "2026-12-01", time: "10:00", item: "Cherry Pie", qty: 3, price: 42, contact: "0400 000 000", notes: "Nut free", flag: "", status: "cancelled", source: "Email or form", updatedAt: "2026-11-28T19:00:00+10:00" })!
  const patch = scanPatch(was, posted)!
  const allowed = new Set<string>(SCAN_FIELDS)
  for (const k of Object.keys(patch)) assert.equal(allowed.has(k), true, k)
  for (const k of STAFF_FIELDS) assert.equal(k in patch, false, k)
  assert.equal("id" in patch, false)
  const after = { ...was, ...patch }
  for (const k of STAFF_FIELDS) assert.equal(after[k], was[k], k)
  assert.equal(after.item, "Cherry Pie")
  assert.equal(after.status, "cancelled")
})

test("scan patch: a Manual row is left alone even when the post says it is something else", () => {
  const manual = line({ id: "MABC234-1", source: "Manual", takenBy: "Jess", payment: "Pay on pickup" })
  assert.equal(scanPatch(manual, { ...manual, source: "Squarespace", item: "Changed", status: "cancelled", date: "" }), null)
  assert.equal(scanPatch(manual, cleanLine({ id: "MABC234-1" })!), null)
})

test("clean line: junk in, safe row out", () => {
  assert.equal(cleanLine(null), null)
  assert.equal(cleanLine("90035-1"), null)
  assert.equal(cleanLine([{ id: "90035-1" }]), null)
  assert.equal(cleanLine({ id: "" }), null)
  assert.equal(cleanLine({ id: "a".repeat(201) }), null)
  assert.equal(cleanLine({ id: "../90035-1" }), null)
  assert.equal(cleanLine({ id: 30351 }), null)
  assert.equal(validId("NBI-10000001-1"), "NBI-10000001-1")
  const l = cleanLine({ id: "90035-1", qty: "lots", price: "free", status: "deleted", staffStatus: "deleted", pickedUp: "yes", flagResolved: 1, venue: "Tea Garden", time: "25:00", item: { a: 1 }, notes: "x".repeat(5000) })!
  assert.equal(l.qty, 1)
  assert.equal(l.price, 0)
  assert.equal(l.status, "active")
  assert.equal(l.staffStatus, "")
  assert.equal(l.pickedUp, false)
  assert.equal(l.flagResolved, false)
  assert.equal(l.venue, "")
  assert.equal(l.time, "")
  assert.equal(l.item, "")
  assert.equal(l.notes.length, 2000)
  assert.equal(cleanLine({ id: "90035-1", qty: "Infinity" })!.qty, 1)
  assert.equal(venueName("Tarte Beach House"), "Currumbin")
  assert.equal(venueName("BURLEIGH HEADS"), "Burleigh")
  // Only the row's own keys come back, whatever else was posted.
  assert.deepEqual(Object.keys(cleanLine({ id: "90035-1", createdAt: "2020-01-01", extra: "x" })!).sort(), [...SCAN_FIELDS, ...STAFF_FIELDS, "id"].sort())
  assert.equal(cleanLog({ id: "not-a-log-id", action: "Added" })!.at, "")
  assert.equal(cleanLog({ id: "8204145999999-90035", action: "" }), null)
})

test("log ids: round trip, newest first", () => {
  const ms = Date.parse("2026-11-28T08:13:05Z")
  assert.equal(logIdMs(logId(ms, "90035")), ms)
  assert.equal(logId(ms + 1, "90035") < logId(ms, "90035"), true)
  assert.equal(logIdMs("90035"), null)
})

test("cards: one cancelled line greys the whole card; the same order on two days is two cards", () => {
  const cards = groupCards([line({ id: "5-1" }), line({ id: "5-2", staffStatus: "cancelled" }), line({ id: "6-1" }), line({ id: "6-2", date: "2026-11-30" })])
  assert.equal(cards.find((c) => c.order === "5")!.dead, true)
  assert.equal(cards.filter((c) => c.order === "6").length, 2)
  assert.equal(countCards(cards, TODAY).all, 2)
  assert.equal(toMake(cards)[0].total, 2)
  // Picked up only when every line is ticked.
  assert.equal(groupCards([line({ id: "7-1", pickedUp: true }), line({ id: "7-2" })])[0].state, "confirmed")
  // A cancelled order that was also ticked is still cancelled.
  assert.equal(groupCards([line({ id: "8-1", pickedUp: true, staffStatus: "refunded" })])[0].state, "refunded")
})

test("feed rows: the range is inclusive, hidden and customer-cancelled rows stay out, no long dashes", () => {
  const rows = pastryFeedRows(
    [
      line({ id: "1-1", date: "2026-11-27" }),
      line({ id: "2-1", date: "2026-11-28" }),
      line({ id: "3-1", date: "2026-12-12", venue: "" }),
      line({ id: "4-1", date: "2026-12-13" }),
      line({ id: "5-1", status: "cancelled" }),
      line({ id: "6-1", item: "Gift card" }),
      line({ id: "7-1", staffStatus: "notcollected" }),
      line({ id: "8-1", customer: "Nora \u2014 Field", notes: "Gate code \u2013 1234" }),
    ],
    "2026-11-28",
    "2026-12-12"
  )
  assert.deepEqual(rows.map((r) => r.id).sort(), ["pastry:2:2026-11-28", "pastry:3:2026-12-12", "pastry:8:2026-11-28"])
  // No venue on the order reads as Burleigh, the same as a cake order does.
  assert.equal(rows.find((r) => r.id.startsWith("pastry:3"))!.venue, "BURLEIGH")
  const dash = rows.find((r) => r.id.startsWith("pastry:8"))!
  assert.equal(/[\u2013\u2014]/.test(`${dash.title}${dash.notes}`), false)
})

const cake = (id: string, orderRef: string | null | undefined): CakeRowIn => ({ id, orderRef, venue: "BEACH_HOUSE", pickupDate: "2026-11-29", pickupTime: "13:00", customerName: "Nora Field", product: "Tarte Signature Celebration Cake", quantity: 1, details: null, message: null, dietary: null, status: "NEW" })
const RANGE = { from: "2026-11-28", to: "2026-12-12" }

test("feed: with no pastry orders it is exactly the feed it was", () => {
  const cakes = [cake("c1", "90032"), cake("c2", null), cake("c3", undefined), cake("c4", "")]
  const before = buildFeed({ range: RANGE, invoices: [], calendar: [], cakes })
  assert.equal(before.length, 4)
  assert.deepEqual(buildFeed({ range: RANGE, invoices: [], calendar: [], cakes, pastry: [], pastryOrderNumbers: [] }), before)
  assert.deepEqual(buildFeed({ range: RANGE, invoices: [], calendar: [], cakes, pastry: undefined, pastryOrderNumbers: undefined }), before)
  for (const i of before) assert.equal(i.source, "cake_order")
})

test("feed de-dupe: only a cake with the same order number is dropped", () => {
  const kept = cakesNotInPastry([cake("c1", "90032"), cake("c2", null), cake("c3", ""), cake("c4", "03033"), cake("c5", "3032")], ["90032", ""])
  assert.deepEqual(kept.map((c) => c.id), ["c2", "c3", "c4", "c5"])
})

test("feed: a pastry order with no time sorts first on its day and a flag reads as new", () => {
  const items = pastryItems([
    { id: "pastry:1:2026-11-29", venue: "BURLEIGH", date: "2026-11-29", time: "", title: "Nora Field, 2x Cherry Pie", notes: null, flagged: true },
    { id: "pastry:2:2026-11-29", venue: "BEACH_HOUSE", date: "2026-11-29", time: "09:30", title: "Sam Rowe, 1x Celebration cake 6in", notes: "Nut free", flagged: false },
  ])
  assert.equal(items[0].startMinutes, null)
  assert.equal(items[0].time, null)
  assert.equal(items[0].status, "new")
  assert.equal(items[1].time, "9:30am")
  assert.equal(items[1].status, "seen")
  const feed = buildFeed({ range: RANGE, invoices: [], calendar: [], cakes: [], pastry: [{ id: "pastry:2:2026-11-29", venue: "BEACH_HOUSE", date: "2026-11-29", time: "09:30", title: "Sam Rowe, 1x Celebration cake 6in", notes: null, flagged: false }, { id: "pastry:1:2026-11-29", venue: "BURLEIGH", date: "2026-11-29", time: "", title: "Nora Field, 2x Cherry Pie", notes: null, flagged: true }] })
  assert.deepEqual(feed.map((i) => i.id), ["pastry:1:2026-11-29", "pastry:2:2026-11-29"])
})
