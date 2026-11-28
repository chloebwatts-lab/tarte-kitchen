import { test } from "node:test"
import assert from "node:assert/strict"
import {
  cakeLabel,
  cakeStrips,
  cakesTomorrowPush,
  cardTag,
  cleanLine,
  cleanLog,
  countCards,
  groupCards,
  isCake,
  isHiddenItem,
  logId,
  logIdMs,
  manualOrderNo,
  morningPush,
  newOrderPush,
  niceTime,
  openLines,
  pastryFeedRows,
  scanPatch,
  searchCards,
  showCards,
  sourceLine,
  toMake,
  todayLine,
  unseenEntries,
  byVenue,
  brisbaneIso,
  STAFF_FIELDS,
  type PastryLine,
} from "./shared"

const TODAY = "2026-11-28"

function line(p: Partial<PastryLine> & { id: string }): PastryLine {
  return {
    order: p.id.replace(/-\d+$/, ""),
    customer: "Someone",
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

// The shape of the tracker on the evening of 28 Nov 2026 (three cards today), with made-up names and numbers.
const SAM = line({ id: "NBI-10000001-1", order: "NBI-10000001", customer: "Sam Example", venue: "Currumbin", time: "11:30", item: "Celebration cake request (Black Forest style, not confirmed)", flag: "Cake asked for in a Now Book It booking note.", flagKind: "check", source: "Email or form" })
const ALEX = [
  line({ id: "90036-1", customer: "Alex Sample", item: "Cruller Dulce de Leche" }),
  line({ id: "90036-2", customer: "Alex Sample", item: "Strawberry Muffin Top" }),
  line({ id: "90036-3", customer: "Alex Sample", item: "Strawberry Tarte" }),
]
const JO = line({ id: "90040-1", customer: "Jo Testcase", venue: "Currumbin", item: "Large Seasonal Berry Tarte" })
const PAT = line({ id: "90032-1", customer: "Pat Placeholder", venue: "Currumbin", date: "2026-11-29", time: "13:00", item: "Celebration cake 6in raspberries dulce de leche", notes: "Booked under Pat Other." })
const ALL = [SAM, ...ALEX, JO, PAT]

test("celebration cake is by the start of the item; cheesecake is a pastry item", () => {
  assert.equal(isCake("Celebration cake 6in raspberries"), true)
  assert.equal(isCake("celebration CAKE request"), true)
  assert.equal(isCake("Baked Ricotta Cheesecake"), false)
  assert.equal(cakeLabel("Celebration cake 6in raspberries dulce de leche"), "6in raspberries dulce de leche")
  assert.equal(cakeLabel("Celebration cake"), "Celebration cake")
})

test("gift cards, vouchers and refunds never show", () => {
  assert.equal(isHiddenItem("Tarte Gift Card $50"), true)
  assert.equal(isHiddenItem("Gift voucher"), true)
  assert.equal(isHiddenItem("Refund for order 03011"), true)
  assert.equal(isHiddenItem("Strawberry Tarte"), false)
  assert.equal(openLines([line({ id: "1-1", item: "eGift Card" }), JO], TODAY).length, 1)
})

test("open = today or later or no date; customer-cancelled rows are hidden", () => {
  const rows = [line({ id: "a-1", date: "2026-11-27" }), line({ id: "b-1", date: "" }), line({ id: "c-1", status: "cancelled" }), JO]
  assert.deepEqual(openLines(rows, TODAY).map((l) => l.id), ["b-1", "90040-1"])
})

test("lines group into one card per order and day, in line order", () => {
  const cards = groupCards([ALEX[2], ALEX[0], ALEX[1], JO])
  assert.equal(cards.length, 2)
  const b = cards.find((c) => c.order === "90036")!
  assert.deepEqual(b.lines.map((l) => l.id), ["90036-1", "90036-2", "90036-3"])
  assert.equal(b.state, "confirmed")
  // the same order number on two days is two cards
  assert.equal(groupCards([line({ id: "9-1" }), line({ id: "9-2", date: "2026-11-30" })]).length, 2)
})

test("counts match the tracker on 28 Nov: 3 today, 1 tomorrow here, 5 items, 1 cake", () => {
  const cards = groupCards(openLines(ALL, TODAY))
  const c = countCards(cards, TODAY)
  assert.equal(c.today, 3)
  assert.equal(c.tomorrow, 1)
  assert.equal(c.cakes, 2)
  assert.equal(c.attention, 1)
  assert.equal(c.next7, 4)
  assert.equal(todayLine(cards, TODAY), "Today, Saturday 28 November: 5 items to make, 3 pickups, 1 cake")
  const make = toMake(showCards(cards, "today", TODAY))
  assert.deepEqual(make.map((m) => [m.venue, m.total]), [["Burleigh", 3], ["Currumbin", 2]])
  assert.equal(countCards(byVenue(cards, "Burleigh"), TODAY).today, 1)
  assert.equal(countCards(byVenue(cards, "Currumbin"), TODAY).today, 2)
})

test("cancelled and refunded stay listed but leave counts and To make; not collected stays in To make", () => {
  const rows = [
    ...ALEX.map((l) => ({ ...l, staffStatus: "cancelled" })),
    { ...JO, staffStatus: "notcollected" },
    line({ id: "5-1", customer: "Ref", staffStatus: "refunded" }),
  ]
  const cards = groupCards(rows)
  assert.equal(cards.length, 3)
  assert.equal(cards.filter((c) => c.dead).length, 2)
  assert.equal(showCards(cards, "today", TODAY).length, 3)
  assert.equal(countCards(cards, TODAY).today, 1)
  const make = toMake(cards)
  assert.equal(make[0].total, 0)
  assert.equal(make[1].total, 1)
})

test("To make adds the same item up and lists the biggest first", () => {
  const cards = groupCards([line({ id: "1-1", item: "Cruller", qty: 2 }), line({ id: "2-1", item: "Cruller", qty: 4 }), line({ id: "3-1", item: "Tarte", qty: 3 })])
  assert.deepEqual(toMake(cards, "Burleigh")[0].items, [{ item: "Cruller", qty: 6 }, { item: "Tarte", qty: 3 }])
})

test("card states: picked up, attention, resolved flag", () => {
  assert.equal(groupCards(ALEX.map((l) => ({ ...l, pickedUp: true })))[0].state, "pickedup")
  assert.equal(groupCards([{ ...ALEX[0], pickedUp: true }, ALEX[1]])[0].state, "confirmed")
  assert.equal(groupCards([SAM])[0].state, "attention")
  const res = groupCards([{ ...SAM, flagResolved: true, resolvedBy: "Jess", resolvedNote: "Called" }])[0]
  assert.equal(res.state, "confirmed")
  assert.equal(res.resolved?.by, "Jess")
})

test("gold strips: cakes due today, tomorrow, in 2 days", () => {
  const strips = cakeStrips(groupCards(ALL), TODAY)
  assert.deepEqual(strips.map((s) => s.when), ["Due today", "Due tomorrow"])
  assert.equal(strips[0].text, "Sam Example, request (Black Forest style, not confirmed), 11:30am, Currumbin (needs attention)")
  assert.equal(strips[1].text, "Pat Placeholder, 6in raspberries dulce de leche, 1pm, Currumbin")
})

test("search finds a customer by name, order number and item", () => {
  const cards = groupCards(ALL)
  assert.equal(searchCards(cards, "alex")[0].order, "90036")
  assert.equal(searchCards(cards, "#90040")[0].customer, "Jo Testcase")
  assert.equal(searchCards(cards, "muffin")[0].order, "90036")
  assert.equal(searchCards(cards, "zzz").length, 0)
})

test("times and source lines read like the tracker", () => {
  assert.equal(niceTime("11:30"), "11:30am")
  assert.equal(niceTime("14:00"), "2pm")
  assert.equal(niceTime(""), "")
  assert.equal(sourceLine({ source: "Squarespace", channel: "", payment: "", takenBy: "" }), "Online order · Paid online")
  assert.equal(sourceLine({ source: "Manual", channel: "Phone", payment: "Deposit paid", takenBy: "Jess" }), "Phone order · taken by Jess · Deposit paid")
  assert.equal(sourceLine({ source: "Email or form", channel: "", payment: "", takenBy: "" }), "Email order")
})

test("log ids sort newest first and manual order numbers are M + 6", () => {
  const a = logId(1795854000000, "90036")
  const b = logId(1795854000001, "90036")
  assert.match(a, /^\d{13}-90036$/)
  assert.ok(b < a)
  assert.equal(logIdMs(a), 1795854000000)
  assert.match(manualOrderNo(), /^M[A-Z2-9]{6}$/)
  assert.equal(brisbaneIso(new Date("2026-11-28T08:13:05Z")), "2026-11-28T18:13:05+10:00")
})

test("bell: unseen entries and NEW / UPDATED tags", () => {
  const now = Date.parse("2026-11-28T18:00:00+10:00")
  const log = [
    { id: "1", at: "2026-11-28T17:00:00+10:00", order: "90040", customer: "Jo", action: "Added", detail: "", by: "Inbox scan", byId: "" },
    { id: "2", at: "2026-11-28T16:00:00+10:00", order: "90036", customer: "Alex", action: "Changed", detail: "", by: "Inbox scan", byId: "" },
    { id: "3", at: "2026-11-26T16:00:00+10:00", order: "03001", customer: "Old", action: "Added", detail: "", by: "Inbox scan", byId: "" },
  ]
  assert.equal(unseenEntries(log, null, now).length, 2)
  assert.equal(unseenEntries(log, Date.parse("2026-11-28T16:30:00+10:00"), now).length, 1)
  const unseen = unseenEntries(log, null, now)
  assert.equal(cardTag("90040", unseen), "NEW")
  assert.equal(cardTag("90036", unseen), "UPDATED")
  assert.equal(cardTag("03001", unseen), null)
})

test("scan intake: cleans rows, keeps ids, refuses rows without one", () => {
  const l = cleanLine({ id: "90035-2", customer: " Helen ", venue: "currumbin", date: "2026-12-24", time: "9:30", item: "Cherry Pie", qty: "2", pickedUp: true, staffStatus: "weird" })!
  assert.equal(l.id, "90035-2")
  assert.equal(l.order, "90035")
  assert.equal(l.venue, "Currumbin")
  assert.equal(l.time, "09:30")
  assert.equal(l.qty, 2)
  assert.equal(l.pickedUp, true)
  assert.equal(l.staffStatus, "")
  assert.equal(cleanLine({ customer: "No id" }), null)
  assert.equal(cleanLine({ id: "bad id/with slash" }), null)
  assert.equal(cleanLine({ id: "x-1", date: "24 Dec" })!.date, "")
  assert.equal(cleanLog({ id: "8204145999999-90035", action: "Added", order: "90035" })!.at.endsWith("+10:00"), true)
  assert.equal(cleanLog({ id: "x" }), null)
})

test("the scan never changes staff-owned fields or Manual rows", () => {
  const was = { ...JO, pickedUp: true, pickedUpBy: "Jess", staffStatus: "notcollected", changeNote: "swapped (Jess)", payment: "Paid" }
  const incoming = { ...JO, venue: "Burleigh", pickedUp: false, pickedUpBy: "", staffStatus: "", changeNote: "", payment: "", updatedAt: "2026-11-28T19:00:00+10:00" }
  const patch = scanPatch(was, incoming)!
  assert.deepEqual(Object.keys(patch).sort(), ["updatedAt", "venue"])
  for (const k of STAFF_FIELDS) assert.equal(k in patch, false)
  assert.equal(scanPatch(was, { ...was }), null)
  // only updatedAt differs: not a real change
  assert.equal(scanPatch(was, { ...was, updatedAt: "later" }), null)
  const manual = line({ id: "MABC234-1", source: "Manual" })
  assert.equal(scanPatch(manual, { ...manual, item: "Changed by scan" }), null)
})

test("push wording", () => {
  const cards = groupCards(ALL)
  const jo = cards.find((c) => c.order === "90040")!
  assert.deepEqual(newOrderPush(jo, TODAY), { title: "New pastry order: Jo Testcase", body: "1x Large Seasonal Berry Tarte. Pickup today 2pm, Currumbin." })
  assert.equal(cakesTomorrowPush(cards, TODAY)!.title, "1 cake due tomorrow")
  assert.match(cakesTomorrowPush(cards, TODAY)!.body, /Pat Placeholder, 6in raspberries dulce de leche, 1pm, Currumbin/)
  assert.equal(cakesTomorrowPush(cards, "2026-12-10"), null)
  const m = morningPush(cards, TODAY)!
  assert.equal(m.title, "Pastry orders today: 3 pickups")
  assert.equal(m.body, "Burleigh: 3 items. Currumbin: 2 items. 1 cake. 1 need attention this week.")
  assert.equal(morningPush(cards, "2026-12-10"), null)
  for (const t of [m.title, m.body]) assert.equal(/[\u2013\u2014]/.test(t), false)
})

test("feed rows: one per card still to be picked up, never cancelled or collected", () => {
  const rows = pastryFeedRows([...ALL, line({ id: "7-1", staffStatus: "cancelled" }), line({ id: "8-1", pickedUp: true }), line({ id: "9-1", date: "" })], TODAY, "2026-12-12")
  assert.deepEqual(rows.map((r) => r.id).sort(), ["pastry:90032:2026-11-29", "pastry:90036:2026-11-28", "pastry:90040:2026-11-28", "pastry:NBI-10000001:2026-11-28"])
  const b = rows.find((r) => r.id.includes("90036"))!
  assert.equal(b.venue, "BURLEIGH")
  assert.equal(b.title, "Alex Sample, 1x Cruller Dulce de Leche, 1x Strawberry Muffin Top, 1x Strawberry Tarte")
  assert.equal(rows.find((r) => r.id.includes("NBI"))!.flagged, true)
  assert.equal(rows.find((r) => r.id.includes("90032"))!.venue, "BEACH_HOUSE")
})
