import { test } from "node:test"
import assert from "node:assert/strict"
import {
  brisbaneDay,
  changedAlert,
  clean,
  cleanDay,
  cleanQty,
  cleanTime,
  dayHeading,
  dueForReminder,
  groupUpcoming,
  isShortNotice,
  morningAlert,
  newOrderAlert,
  niceTime,
  type AlertOrder,
  type GroupableOrder,
} from "./shared"

const g = (id: string, pickupDate: string | null, status: GroupableOrder["status"] = "SEEN", pickupTime: string | null = null): GroupableOrder => ({
  id,
  pickupDate,
  pickupTime,
  status,
  orderRef: null,
})

test("groupUpcoming: no date, then overdue, then by day and time", () => {
  const groups = groupUpcoming(
    [
      g("a", "2026-11-28", "SEEN", "14:00"),
      g("b", "2026-11-28", "NEW", "08:00"),
      g("c", null, "NEW"),
      g("d", "2026-11-24", "READY"),
      g("e", "2026-11-24", "COLLECTED"),
      g("f", "2026-11-26", "NEW"),
      g("x", null, "CANCELLED"),
    ],
    "2026-11-26"
  )
  assert.deepEqual(
    groups.map((x) => [x.key, x.title, x.orders.map((o) => o.id).join("")]),
    [
      ["nodate", "No pickup date yet", "c"],
      ["overdue", "Past pickup day, not marked collected", "d"],
      ["2026-11-26", "Today", "f"],
      ["2026-11-28", "Saturday 28 November", "ba"],
    ]
  )
  assert.equal(groups[2].tone, "today")
})

test("short notice is under 3 days", () => {
  assert.equal(isShortNotice("2026-11-24", "2026-11-26"), true)
  assert.equal(isShortNotice("2026-11-24", "2026-11-27"), false)
  assert.equal(isShortNotice("2026-11-24", null), false)
})

test("day headings and times", () => {
  assert.equal(dayHeading("2026-11-26", "2026-11-26"), "Today")
  assert.equal(dayHeading("2026-11-27", "2026-11-26"), "Tomorrow")
  assert.equal(niceTime("13:00"), "1pm")
  assert.equal(niceTime("08:30"), "8:30am")
  assert.equal(niceTime("12:00"), "12pm")
  assert.equal(niceTime("00:15"), "12:15am")
  assert.equal(niceTime(null), null)
  assert.equal(brisbaneDay(new Date("2026-11-26T15:00:00Z")), "2026-11-27")
})

test("input cleaning", () => {
  assert.equal(clean("  Happy   birthday  ", 120), "Happy birthday")
  assert.equal(clean("   ", 120), null)
  assert.equal(clean(5, 120), null)
  assert.equal(clean("line one\n\n\n\nline two", 600, true), "line one\n\nline two")
  assert.equal(cleanDay("2026-11-31"), null)
  assert.equal(cleanDay("2026-11-30"), "2026-11-30")
  assert.equal(cleanDay("30/11/2026"), null)
  assert.equal(cleanTime("9:05"), "09:05")
  assert.equal(cleanTime("25:00"), null)
  assert.equal(cleanQty("3"), 3)
  assert.equal(cleanQty("0"), 1)
  assert.equal(cleanQty("abc"), 1)
  assert.equal(cleanQty(9999), 500)
})

const a = (over: Partial<AlertOrder> = {}): AlertOrder => ({
  venue: "BEACH_HOUSE",
  pickupDate: "2026-11-29",
  pickupTime: "13:00",
  customerName: "Jane Citizen",
  product: "Tarte Signature Celebration Cake",
  details: "6 Inch / Raspberries",
  quantity: 1,
  status: "NEW",
  checkNote: null,
  orderedDay: "2026-11-24",
  ...over,
})

test("new order alert wording", () => {
  const one = newOrderAlert([a()], "2026-11-24")
  assert.equal(one.title, "New cake order: Sun 29 Nov, 1pm, Currumbin")
  assert.equal(one.body, "Tarte Signature Celebration Cake (6 Inch / Raspberries) for Jane Citizen.")
  const two = newOrderAlert([a({ pickupDate: "2026-11-25", quantity: 2, product: "Cherry Pie", details: null }), a({ checkNote: "x" })], "2026-11-24")
  assert.equal(two.title, "New cake order, 2 items: tomorrow, 1pm, Currumbin")
  assert.match(two.body, /^2 x Cherry Pie; Tarte Signature Celebration Cake/)
  assert.match(two.body, /Short notice/)
  assert.match(two.body, /Needs checking/)
  assert.match(newOrderAlert([a({ pickupDate: null })], "2026-11-24").title, /no date yet/)
})

test("changed and cancelled alerts", () => {
  assert.equal(changedAlert(a(), "2026-11-29", false).title, "Cake order changed: today, 1pm, Currumbin")
  assert.match(changedAlert(a(), "2026-11-24", true).title, /^Cake order cancelled/)
})

test("morning alert: today's list, the next 3 days, gaps; null when quiet", () => {
  const m = morningAlert(
    [
      a({ pickupDate: "2026-11-29", pickupTime: "13:00", status: "SEEN" }),
      a({ pickupDate: "2026-11-29", pickupTime: "08:00", venue: "BURLEIGH", product: "Lemon Butter Cake", details: null, status: "READY" }),
      a({ pickupDate: "2026-12-01" }),
      a({ pickupDate: "2026-12-09" }),
      a({ pickupDate: null, status: "SEEN" }),
      a({ pickupDate: "2026-11-29", status: "CANCELLED" }),
    ],
    "2026-11-29"
  )
  assert.ok(m)
  assert.equal(m.title, "Cakes today: 2")
  assert.equal(
    m.body,
    "8am Burleigh Lemon Butter Cake; 1pm Currumbin Tarte Signature Celebration Cake (6 Inch / Raspberries). Next 3 days: 1. 1 with no pickup date. 2 not opened yet."
  )
  assert.equal(morningAlert([a({ pickupDate: "2026-12-09" })], "2026-11-29"), null)
  assert.equal(morningAlert([a({ pickupDate: "2026-11-30" })], "2026-11-29")?.title, "No cakes out today")
})

test("reminder: once, after 2 hours, only 7am to 3pm Brisbane", () => {
  const created = new Date("2026-11-26T00:00:00Z") // 10am Brisbane
  const at = (iso: string) => new Date(iso)
  assert.equal(dueForReminder({ status: "NEW", createdAt: created, remindedAt: null }, at("2026-11-26T01:00:00Z")), false)
  assert.equal(dueForReminder({ status: "NEW", createdAt: created, remindedAt: null }, at("2026-11-26T02:10:00Z")), true)
  assert.equal(dueForReminder({ status: "SEEN", createdAt: created, remindedAt: null }, at("2026-11-26T02:10:00Z")), false)
  assert.equal(dueForReminder({ status: "NEW", createdAt: created, remindedAt: at("2026-11-26T02:00:00Z") }, at("2026-11-26T03:00:00Z")), false)
  // 6pm Brisbane: wait for the morning.
  assert.equal(dueForReminder({ status: "NEW", createdAt: created, remindedAt: null }, at("2026-11-26T08:00:00Z")), false)
})
