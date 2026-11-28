import { test } from "node:test"
import assert from "node:assert/strict"
import {
  brisbaneDay,
  cleanDay,
  cleanQty,
  dayHeading,
  daysBetween,
  dueForReminder,
  groupUpcoming,
  isShortNotice,
  morningAlert,
  newOrderAlert,
  niceTime,
  type AlertOrder,
  type GroupableOrder,
} from "./shared"
import { datesInText, parseItemDate, parseTime, parseWebsiteOrder } from "./squarespace"

// Edge cases for the cake order rules (pre-push guard, 28 Nov 2026). Names,
// emails and addresses are made up.

test("brisbaneDay flips at 14:00 UTC (midnight Brisbane), across month and year ends", () => {
  assert.equal(brisbaneDay(new Date("2026-11-26T13:59:59Z")), "2026-11-26")
  assert.equal(brisbaneDay(new Date("2026-11-26T14:00:00Z")), "2026-11-27")
  assert.equal(brisbaneDay(new Date("2026-11-30T14:00:00Z")), "2026-12-01")
  assert.equal(brisbaneDay(new Date("2026-12-31T14:00:00Z")), "2027-01-01")
  // The board's 30 and 60 day look-backs.
  assert.equal(brisbaneDay(new Date("2026-11-28T00:00:00Z"), -30), "2026-10-29")
  assert.equal(brisbaneDay(new Date("2026-11-27T20:00:00Z"), -60), "2026-09-29")
})

test("short notice: exactly 3 days is fine, 2 is short, across a month and a year end", () => {
  assert.equal(isShortNotice("2026-11-29", "2026-12-01"), true)
  assert.equal(isShortNotice("2026-11-28", "2026-12-01"), false)
  assert.equal(isShortNotice("2026-12-30", "2027-01-02"), false)
  assert.equal(isShortNotice("2026-12-31", "2027-01-02"), true)
  // Same day, and a pickup typed before the order day, are both short.
  assert.equal(isShortNotice("2026-11-28", "2026-11-28"), true)
  assert.equal(isShortNotice("2026-11-28", "2026-11-20"), true)
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1)
  assert.equal(dayHeading("2027-01-01", "2026-12-31"), "Tomorrow")
  assert.equal(dayHeading("2027-01-02", "2026-12-31"), "Saturday 2 January")
})

test("reminder window: due at exactly 2 hours, 7am to before 3pm Brisbane", () => {
  const r = (createdIso: string, nowIso: string) =>
    dueForReminder({ status: "NEW", createdAt: new Date(createdIso), remindedAt: null }, new Date(nowIso))
  // Created 10am Brisbane.
  assert.equal(r("2026-11-26T00:00:00Z", "2026-11-26T01:59:00Z"), false)
  assert.equal(r("2026-11-26T00:00:00Z", "2026-11-26T02:00:00Z"), true)
  // 2:59pm Brisbane is still inside, 3:00pm is not.
  assert.equal(r("2026-11-26T00:00:00Z", "2026-11-26T04:59:59Z"), true)
  assert.equal(r("2026-11-26T00:00:00Z", "2026-11-26T05:00:00Z"), false)
  // Came in at 6pm Brisbane: nothing overnight (UTC is already the next day at 2am Brisbane), then 7am.
  assert.equal(r("2026-11-26T08:00:00Z", "2026-11-26T16:00:00Z"), false)
  assert.equal(r("2026-11-26T08:00:00Z", "2026-11-26T20:59:00Z"), false)
  assert.equal(r("2026-11-26T08:00:00Z", "2026-11-26T21:00:00Z"), true)
  // Only NEW orders, and never twice.
  for (const status of ["SEEN", "READY", "COLLECTED", "CANCELLED"] as const) {
    assert.equal(dueForReminder({ status, createdAt: new Date("2026-11-26T00:00:00Z"), remindedAt: null }, new Date("2026-11-26T03:00:00Z")), false, status)
  }
})

const g = (id: string, pickupDate: string | null, status: GroupableOrder["status"], pickupTime: string | null = null, orderRef: string | null = null): GroupableOrder => ({
  id,
  pickupDate,
  pickupTime,
  status,
  orderRef,
})

test("groupUpcoming: overdue oldest first, no-time orders last in a day, today's cancelled stays visible", () => {
  const groups = groupUpcoming(
    [
      g("late", "2026-11-25", "SEEN", "09:00"),
      g("older", "2026-11-23", "NEW", "14:00"),
      g("gone", "2026-11-27", "CANCELLED"),
      g("t-any", "2026-11-28", "NEW", null, "03040"),
      g("t-2", "2026-11-28", "SEEN", "08:00", "03041"),
      g("t-1", "2026-11-28", "SEEN", "08:00", "03039"),
      g("t-x", "2026-11-28", "CANCELLED", "07:00"),
    ],
    "2026-11-28"
  )
  assert.deepEqual(
    groups.map((x) => [x.key, x.tone, x.orders.map((o) => o.id)]),
    [
      ["overdue", "alert", ["older", "late"]],
      ["2026-11-28", "today", ["t-x", "t-1", "t-2", "t-any"]],
    ]
  )
  assert.deepEqual(groupUpcoming([], "2026-11-28"), [])
})

const a = (over: Partial<AlertOrder> = {}): AlertOrder => ({
  venue: "BURLEIGH",
  pickupDate: "2026-11-28",
  pickupTime: "09:30",
  customerName: "Jane Citizen",
  product: "Lemon Butter Cake",
  details: null,
  quantity: 1,
  status: "SEEN",
  checkNote: null,
  orderedDay: "2026-11-20",
  ...over,
})

test("morning list: the third day ahead counts, the fourth does not; overdue is not today's", () => {
  const today = "2026-11-28"
  const m = morningAlert([a({ pickupDate: "2026-12-01" }), a({ pickupDate: "2026-12-02" })], today)
  assert.ok(m)
  assert.equal(m.title, "No cakes out today")
  assert.equal(m.body, "Next 3 days: 1.")
  assert.equal(morningAlert([a({ pickupDate: "2026-11-27" })], today), null)
  assert.equal(morningAlert([a({ status: "COLLECTED" })], today), null)
  // No time sorts after timed pickups, and the line drops the time.
  const t = morningAlert([a({ pickupTime: null, product: "Cherry Pie" }), a({ pickupTime: "07:00", quantity: 6, product: "Blueberry Tarte" })], today)
  assert.equal(t?.body, "7am Burleigh 6 x Blueberry Tarte; Burleigh Cherry Pie.")
})

test("same-day staff order: today, short notice, 12-hour times either side of noon", () => {
  const n = newOrderAlert([a({ orderedDay: "2026-11-28", pickupTime: "12:30", venue: "TEA_GARDEN" })], "2026-11-28")
  assert.equal(n.title, "New cake order: today, 12:30pm, Tea Garden")
  assert.match(n.body, /Short notice \(under 3 days\)\./)
  assert.doesNotMatch(n.body, /Needs checking/)
  assert.equal(niceTime("00:00"), "12am")
  assert.equal(niceTime("12:05"), "12:05pm")
  assert.equal(niceTime("23:45"), "11:45pm")
})

test("input cleaning: leap days, rounding and junk quantities", () => {
  assert.equal(cleanDay("2028-02-29"), "2028-02-29")
  assert.equal(cleanDay("2027-02-29"), null)
  assert.equal(cleanDay("2026-12-05T00:00:00Z"), null)
  assert.equal(cleanDay(null), null)
  assert.equal(cleanQty(2.4), 2)
  assert.equal(cleanQty(-3), 1)
  assert.equal(cleanQty(null), 1)
  assert.equal(cleanQty(""), 1)
  assert.equal(cleanQty(undefined), 1)
  assert.equal(cleanQty("60"), 60)
})

test("Squarespace times and dates at the edges", () => {
  assert.equal(parseTime("12:30pm"), "12:30")
  assert.equal(parseTime("12:15am"), "00:15")
  assert.equal(parseTime("9am"), "09:00")
  assert.equal(parseTime("7.30"), "07:30")
  assert.equal(parseTime("24:00"), null)
  assert.equal(parseTime("noon"), null)
  assert.equal(parseTime("2026"), null)
  assert.equal(parseItemDate("2/29/2028"), "2028-02-29")
  assert.equal(parseItemDate("2/29/2027"), null)
  assert.equal(parseItemDate("31 NOV 2026"), null)
  // Year-less dates around New Year: an order placed 28 Dec for "2nd January" is next year.
  assert.deepEqual(datesInText("2nd January", "2026-12-28"), ["2027-01-02"])
  assert.deepEqual(datesInText("Dec 24th, 2026", "2026-11-17"), ["2026-12-24"])
  assert.deepEqual(datesInText("1st of December", "2026-11-24"), ["2026-12-01"])
  // The same day written twice only counts once.
  assert.deepEqual(datesInText("24/12/2026 (24th December)", "2026-11-24"), ["2026-12-24"])
})

const HEAD = (no: string, billed: string) =>
  `Order #${no}. Placed on November 24, 2026 at 6:19 PM GMT+10. BILLED TO: PICKUP OPTION: ${billed} Burleigh Heads Pickup Information: Shop 2, 2 West St Burleigh Heads, QLD, 4220 Open 7 Days &nbsp; ITEM QTY UNIT PRICE SUBTOTAL &nbsp; `
const TAIL = (date: string, time: string) => ` &nbsp; Item Subtotal TOTAL A$0.00 Requested Pickup Date: ${date} Requested Pickup Time: ${time} Extra Notes:  blog • Help Center`

test("a gift card on the same order stays in the parse (the import drops it), prices over A$1,000 read", () => {
  const o = parseWebsiteOrder(
    HEAD("03050", "Max Example 1 Sample St Tugun, QLD, 4224 Australia Apple Pay max@example.com") +
      "Tarte Gift Card SQ1000001 1 A$100.00 A$100.00 &nbsp; " +
      "Large Seasonal Berry Tarte SQ2000002 Strawberry 12 A$105.00 A$1,260.00" +
      TAIL("Saturday 5th December", ""),
    "2026-11-28"
  )
  assert.ok(o)
  assert.deepEqual(o.items.map((i) => [i.product, i.quantity, i.pickupDate]), [
    ["Tarte Gift Card", 1, "2026-12-05"],
    ["Large Seasonal Berry Tarte", 12, "2026-12-05"],
  ])
  assert.equal(o.items[1].details, "Strawberry")
  // An empty time box is no time, not a guess.
  assert.equal(o.requestedTime, null)
  assert.equal(o.items[1].pickupTime, null)
  assert.equal(o.notes, null)
  assert.deepEqual(o.items[1].checkNotes, [])
})
