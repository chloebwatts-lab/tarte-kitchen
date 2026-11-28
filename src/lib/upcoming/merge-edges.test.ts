import { test } from "node:test"
import assert from "node:assert/strict"
import type { RawCalendarEvent } from "@/lib/functions/calendar"
import {
  addDays,
  brisbaneToday,
  buildFeed,
  cakeItems,
  calendarEntries,
  clockText,
  daySpan,
  functionsFromInvoices,
  inRange,
  nameWords,
  sortFeed,
  startMinutesOf,
  validDay,
  type CakeRowIn,
  type FeedItem,
  type InvoiceRowIn,
} from "./merge"

// Edge cases for the upcoming events feed (pre-push guard, 28 Nov 2026).
// Customer names are made up.

const RANGE = { from: "2026-11-28", to: "2026-12-12" }

const inv = (
  invoiceNumber: string,
  threadId: string,
  ed: Record<string, unknown>,
  opts: { kind?: string; amount?: number; bookingState?: string | null } = {}
): InvoiceRowIn => ({
  id: Number(invoiceNumber.slice(-5)),
  invoiceNumber,
  kind: opts.kind ?? "standard",
  threadId,
  customerName: (ed.customer_name as string) ?? null,
  amount: opts.amount ?? 0,
  editable: { customer_confirmed: true, ...ed },
  bookingState: opts.bookingState ?? null,
})

const team = { email: "hello@tarte.com.au", self: true }
const allDay = (id: string, day: string, summary: string): RawCalendarEvent => ({
  id,
  status: "confirmed",
  summary,
  eventType: "default",
  organizer: team,
  start: { date: day },
  end: { date: day },
})
const timed = (id: string, start: string, end: string, summary: string): RawCalendarEvent => ({
  id,
  status: "confirmed",
  summary,
  eventType: "default",
  organizer: team,
  start: { dateTime: start },
  end: { dateTime: end },
})

const byId = (items: FeedItem[], id: string) => {
  const it = items.find((i) => i.id === id)
  assert.ok(it, `missing ${id}`)
  return it
}

test("Brisbane today flips at 14:00 UTC; day maths across month and year ends", () => {
  assert.equal(brisbaneToday(new Date("2026-11-28T13:59:59Z")), "2026-11-28")
  assert.equal(brisbaneToday(new Date("2026-11-28T14:00:00Z")), "2026-11-29")
  assert.equal(brisbaneToday(new Date("2026-12-31T14:00:00Z")), "2027-01-01")
  assert.equal(brisbaneToday(new Date("2026-11-28T00:00:00Z"), 14), "2026-12-12")
  // The route's default window and its 60-day cap.
  assert.equal(addDays("2026-12-25", 14), "2027-01-08")
  assert.equal(addDays("2028-02-28", 1), "2028-02-29")
  assert.equal(daySpan("2026-11-28", "2027-01-27"), 60)
  assert.equal(daySpan("2026-11-28", "2026-11-28"), 0)
})

test("range bounds are inclusive at both ends; only real YYYY-MM-DD days count", () => {
  assert.equal(inRange("2026-11-28", RANGE), true)
  assert.equal(inRange("2026-12-12", RANGE), true)
  assert.equal(inRange("2026-11-27", RANGE), false)
  assert.equal(inRange("2026-12-13", RANGE), false)
  assert.equal(inRange("2026-12-5", RANGE), false)
  assert.equal(inRange(null, RANGE), false)
  assert.equal(validDay("2028-02-29"), "2028-02-29")
  assert.equal(validDay("2027-02-29"), null)
  assert.equal(validDay("2026-12-05T00:00:00"), null)
  assert.equal(validDay(""), null)

  const rows = [
    inv("TARTE-2026-00101", "t-first", { event_date: "2026-11-28", customer_name: "Ava First" }, { amount: 900 }),
    inv("TARTE-2026-00102", "t-last", { event_date: "2026-12-12", customer_name: "Bea Last" }, { amount: 900 }),
    inv("TARTE-2026-00103", "t-before", { event_date: "2026-11-27", customer_name: "Cy Before" }, { amount: 900 }),
    inv("TARTE-2026-00104", "t-after", { event_date: "2026-12-13", customer_name: "Di After" }, { amount: 900 }),
    inv("TARTE-2026-00105", "t-junk", { event_date: "5 Dec", customer_name: "Ed Junk" }, { amount: 900 }),
  ]
  assert.deepEqual(
    functionsFromInvoices(rows, RANGE).map((f) => f.item.id).sort(),
    ["fn:TARTE-2026-00101", "fn:TARTE-2026-00102"]
  )
})

test("calendar times near midnight UTC land on the Brisbane day", () => {
  const cs = calendarEntries(
    [
      // 12:30am Brisbane on 5 Dec, still 4 Dec in UTC.
      timed("early", "2026-12-04T14:30:00Z", "2026-12-04T16:00:00Z", "Smith hideout breakfast"),
      // 11:59pm Brisbane on 5 Dec.
      timed("late", "2026-12-05T13:59:00Z", "2026-12-05T15:00:00Z", "Jones hideout"),
      // 11:59pm Brisbane on 4 Dec: the day before the range.
      timed("before", "2026-12-04T13:59:00Z", "2026-12-04T14:30:00Z", "Brown hideout"),
    ],
    { from: "2026-12-05", to: "2026-12-05" }
  )
  assert.deepEqual(
    cs.map((c) => [c.item.id, c.item.date, c.item.time, c.item.startMinutes]),
    [
      ["cal:early", "2026-12-05", "12:30am - 2:00am", 30],
      // Ends after midnight: the start only.
      ["cal:late", "2026-12-05", "11:59pm", 1439],
    ]
  )
})

test("start times from typed labels", () => {
  assert.equal(startMinutesOf("12pm"), 720)
  assert.equal(startMinutesOf("12:30am"), 30)
  assert.equal(startMinutesOf("9:00"), 540)
  assert.equal(startMinutesOf("11am-2pm"), 660)
  assert.equal(startMinutesOf("0pm"), null)
  assert.equal(startMinutesOf("25:00"), null)
  assert.equal(startMinutesOf(""), null)
  assert.equal(clockText(1439), "11:59pm")
  assert.equal(clockText(720), "12:00pm")
  assert.equal(clockText(1440), "12:00am")
})

test("name words: accents, apostrophes and hyphens; whole-word match on a shouted title", () => {
  assert.deepEqual(nameWords("Zo\u00eb O'Brien-Smith"), ["zo\u00eb", "brien", "smith"])
  assert.deepEqual(nameWords(null), [])
  assert.deepEqual(nameWords("Bo"), [])
  const rows = [inv("TARTE-2026-00110", "t-ob", { event_date: "2026-12-03", customer_name: "Siobhan O'Brien", venue_space: "The Hideout" }, { amount: 1780 })]
  const items = buildFeed({
    range: RANGE,
    invoices: rows,
    calendar: [allDay("ob", "2026-12-03", "O'BRIEN HIDEOUT LUNCH 20PAX"), allDay("tbc", "2026-12-03", "TBC Kim TG high tea")],
    cakes: [],
  })
  const f = byId(items, "fn:TARTE-2026-00110")
  assert.equal(f.onCalendar, true)
  assert.equal(f.guests, 20)
  assert.equal(items.find((i) => i.id === "cal:ob"), undefined)
  assert.ok(byId(items, "cal:tbc"))
})

test("two invoices on one day each claim the entry naming them, whatever the calendar order", () => {
  const rows = [
    inv("TARTE-2026-00120", "t-ava", { event_date: "2026-12-06", customer_name: "Ava Murphy", venue_space: "The Hideout", time_label: "12:00pm" }, { amount: 1600 }),
    inv("TARTE-2026-00121", "t-ruby", { event_date: "2026-12-06", customer_name: "Ruby Nguyen", venue_space: "Tea Garden" }, { amount: 2200 }),
  ]
  const calendar = [
    timed("ruby", "2026-12-06T01:00:00Z", "2026-12-06T04:00:00Z", "NGUYEN TG HIGH TEA 30pax"),
    allDay("ava", "2026-12-06", "Ava hideout lunch"),
  ]
  const items = buildFeed({ range: RANGE, invoices: rows, calendar, cakes: [] })
  assert.deepEqual(items.map((i) => [i.id, i.onCalendar]), [
    ["fn:TARTE-2026-00121", true],
    ["fn:TARTE-2026-00120", true],
  ])
  const ruby = byId(items, "fn:TARTE-2026-00121")
  // No time or numbers on the invoice: the calendar fills both.
  assert.equal(ruby.time, "11:00am - 2:00pm")
  assert.equal(ruby.startMinutes, 660)
  assert.equal(ruby.guests, 30)
  assert.equal(ruby.venue, "TEA_GARDEN")
})

test("money status: amount_paid typed as text, within half a cent, and a balance-invoiced booking", () => {
  const status = (ed: Record<string, unknown>, amount: number, bookingState: string | null = null) =>
    functionsFromInvoices([inv("TARTE-2026-00130", "t-m", { event_date: "2026-12-04", customer_name: "Mia Example", ...ed }, { amount, bookingState })], RANGE)[0].item.status
  assert.equal(status({ amount_paid: "890.00" }, 1780), "deposit_paid")
  assert.equal(status({ amount_paid: 1423.996 }, 1424), "paid")
  assert.equal(status({ amount_paid: 1423.99 }, 1424), "deposit_paid")
  assert.equal(status({ amount_paid: 0 }, 1424), "booked")
  assert.equal(status({ amount_paid: "" }, 1424), "booked")
  assert.equal(status({}, 1424, "balance_invoiced"), "deposit_paid")
  assert.equal(status({}, 1424, "enquiry_received"), "booked")
  // A customer_confirmed that is not literally true is not a booking.
  assert.equal(functionsFromInvoices([inv("TARTE-2026-00131", "t-n", { event_date: "2026-12-04", customer_name: "Mia Example", customer_confirmed: "true" }, { amount: 900 })], RANGE).length, 0)
})

test("two different customers on one day are never folded together", () => {
  const rows = [
    inv("TARTE-2026-00140", "t-1", { event_date: "2026-12-05", customer_name: "Grace Kelly", venue_space: "The Hideout" }, { amount: 1500 }),
    inv("TARTE-2026-00141", "t-2", { event_date: "2026-12-05", customer_name: "Grace Kennedy", venue_space: "Tea Garden" }, { amount: 1500 }),
  ]
  assert.equal(functionsFromInvoices(rows, RANGE).length, 2)
})

const cake = (over: Partial<CakeRowIn>): CakeRowIn => ({
  id: "k1",
  venue: "BURLEIGH",
  pickupDate: "2026-12-12",
  pickupTime: "07:30",
  customerName: "Tom Example",
  product: "Gingerbread House",
  quantity: 1,
  details: null,
  message: null,
  dietary: null,
  status: "SEEN",
  ...over,
})

test("cakes: range ends inclusive, zero quantity reads 1x, long dashes become commas, unknown status left out", () => {
  const items = cakeItems(
    [
      cake({}),
      cake({ id: "k2", pickupDate: "2026-11-28", quantity: 0, product: "Mini Cherry Pie \u2013 5 Pack" }),
      cake({ id: "k3", pickupDate: "2026-12-13" }),
      cake({ id: "k4", pickupDate: "2026-11-27" }),
      cake({ id: "k5", status: "PENDING" }),
    ],
    RANGE
  )
  assert.deepEqual(items.map((i) => i.id), ["cake:k1", "cake:k2"])
  assert.equal(items[0].time, "7:30am")
  assert.equal(items[0].startMinutes, 450)
  assert.equal(items[1].title, "Cake pickup: Tom Example, 1x Mini Cherry Pie, 5 Pack")
  assert.equal(items[1].notes, null)
})

test("same day and minute: function before cake, then by title", () => {
  const base = { venue: "BEACH_HOUSE" as const, date: "2026-12-05", time: "11:00am", startMinutes: 660, guests: null, space: null, notes: null, onCalendar: null }
  const sorted = sortFeed([
    { ...base, id: "cake:z", kind: "cake", title: "Cake pickup: A", status: "new", source: "cake_order" },
    { ...base, id: "fn:2", kind: "function", title: "Zara Example, Function", status: "booked", source: "invoice" },
    { ...base, id: "fn:1", kind: "function", title: "Amy Example, Function", status: "booked", source: "invoice" },
    { ...base, id: "cal:x", kind: "function", title: "Early one", status: "booked", source: "calendar", startMinutes: null, time: null },
  ])
  assert.deepEqual(sorted.map((i) => i.id), ["cal:x", "fn:1", "fn:2", "cake:z"])
})
