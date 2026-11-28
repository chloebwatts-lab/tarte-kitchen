import { test } from "node:test"
import assert from "node:assert/strict"
import type { RawCalendarEvent } from "@/lib/functions/calendar"
import {
  buildFeed,
  cakeItems,
  calendarEntries,
  clockText,
  functionsFromInvoices,
  nameWords,
  startMinutesOf,
  validDay,
  type CakeRowIn,
  type FeedItem,
  type InvoiceRowIn,
} from "./merge"

// The hello@ calendar and tarte-inbox invoices as they stood on Sat 28 Nov
// 2026 (titles and booking details as written by the team; no contact details).
const RANGE = { from: "2026-11-28", to: "2026-12-12" }

let nextId = 1
function inv(
  invoiceNumber: string,
  threadId: string,
  ed: Record<string, unknown>,
  opts: { kind?: string; amount?: number; bookingState?: string | null; id?: number } = {}
): InvoiceRowIn {
  return {
    id: opts.id ?? (Number(invoiceNumber.slice(-5)) || nextId++),
    invoiceNumber,
    kind: opts.kind ?? "standard",
    threadId,
    customerName: (ed.customer_name as string) ?? null,
    amount: opts.amount ?? 0,
    editable: { customer_confirmed: true, booking_type: "private_hire", ...ed },
    bookingState: opts.bookingState ?? null,
  }
}

const INVOICES: InvoiceRowIn[] = [
  inv("TARTE-2026-00078", "t-liz", { event_date: "2026-11-28", customer_name: "Liz Webber", guests: 12, venue_space: "The Hideout", time_label: "12:00pm - 2:00pm", package_name: "Family Style Lunch in The Hideout", per_person_price: 89 }, { amount: 1707, bookingState: "enquiry_received" }),
  inv("TARTE-2026-00043", "t-ashlee", { event_date: "2026-11-29", customer_name: "Ashlee Price", guests: 16, venue_space: "The Hideout", time_label: "11:00am - 2:00pm", package_name: "Family style Lunch", dietaries: "TBC", amount_paid: 1424, per_person_price: 89 }, { amount: 1424 }),
  inv("TARTE-2026-00044", "t-ashlee", { event_date: "2026-11-29", customer_name: "Ashlee Price", guests: 16, venue_space: "The Hideout", time_label: "11:00am - 2:00pm", package_name: "Family style Lunch", amount_paid: 1424 }, { kind: "balance", amount: 1424 }),
  inv("TARTE-2026-00072", "t-gemma", { event_date: "2026-12-02", customer_name: "Gemma", guests: 19, venue_space: "The Hideout", time_label: "12:00pm - 3:00pm", package_name: "Set Menu Lunch in The Hideout", dietaries: "1x gluten and lactose free", per_person_price: 89 }, { amount: 1691, bookingState: "enquiry_received" }),
  inv("TARTE-2026-00081", "t-nadeen", { event_date: "2026-12-04", customer_name: "Nadeen Stammer", guests: 20, venue_space: "The Hideout", time_label: "11:30am", package_name: "Family Style Lunch in The Hideout", per_person_price: 89 }, { amount: 1780, bookingState: "enquiry_received" }),
  inv("TARTE-2026-00061", "t-josh", { event_date: "2026-12-05", customer_name: "Josh Walker", guests: 17, venue_space: null, time_label: "1:30pm", package_name: "Set Lunch", booking_type: "table_booking", dietaries: "1x vegan", per_person_price: 65 }, { amount: 1105, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00080", "t-josh", { event_date: "2026-12-05", customer_name: "Josh Walker", guests: 17, time_label: "1:30pm", package_name: "Set Lunch", booking_type: "table_booking" }, { kind: "balance", amount: 1105, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00068", "t-jasmine", { event_date: "2026-12-05", customer_name: "Jasmine Green", guests: 20, venue_space: "The Hideout", time_label: "11:00am", package_name: "Private High Tea in The Hideout", amount_paid: 890, per_person_price: 89 }, { amount: 1780, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00069", "t-jasmine", { event_date: "2026-12-05", customer_name: "Jasmine Green", guests: 20, venue_space: "The Hideout", time_label: "11:00am", package_name: "Private High Tea in The Hideout", amount_paid: 890 }, { kind: "balance", amount: 1780, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00033", "t-hannah", { event_date: "2026-12-06", customer_name: "Hannah Peddie", guests: 21, venue_space: "Tea Garden", time_label: null, package_name: "Private High Tea in Tea Garden", amount_paid: 500, per_person_price: 89 }, { amount: 1869, bookingState: "paid" }),
  inv("TARTE-2026-00037", "t-hannah", { event_date: "2026-12-06", customer_name: "Hannah Peddie", guests: 21, venue_space: "Tea Garden", package_name: "Private High Tea in Tea Garden", amount_paid: 500 }, { kind: "balance", amount: 1869, bookingState: "paid" }),
  inv("TARTE-2026-00051", "t-chloe", { event_date: "2026-12-06", customer_name: "Chloe L", guests: 40, venue_space: "Tea Garden", time_label: "3:00pm onwards", package_name: "Full Tea Garden Venue Hire \u2013 Standard High Tea", per_person_price: 55 }, { amount: 3399, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00084", "t-chloe", { event_date: "2026-12-06", customer_name: "Chloe L", guests: 40, venue_space: "Tea Garden", time_label: "3:00pm onwards" }, { kind: "balance", amount: 3399, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00071", "t-felicity", { event_date: "2026-12-06", customer_name: "Felicity Robinson", guests: 16, venue_space: "The Hideout", time_label: "12:00pm (arrival from 11:30am)", package_name: "Hideout Family Lunch", per_person_price: 89 }, { amount: 1536, bookingState: "deposit_paid" }),
  inv("TARTE-2026-00079", "t-felicity", { event_date: "2026-12-06", customer_name: "Felicity Robinson", guests: 16, venue_space: "The Hideout", time_label: "12:00pm (arrival from 11:30am)" }, { kind: "balance", amount: 1536, bookingState: "deposit_paid" }),
  // Not confirmed by the customer: never a booking.
  inv("TARTE-2026-00031", "t-fiona", { event_date: "2026-12-08", customer_name: "Fiona Green", customer_confirmed: false, venue_space: "The Hideout" }, { amount: 1513 }),
  // Outside the range.
  inv("TARTE-2026-00075", "t-shahena", { event_date: "2026-12-18", customer_name: "Shahena Stanford", venue_space: "The Hideout" }, { amount: 1068 }),
]

const allDay = (id: string, day: string, summary: string, description?: string): RawCalendarEvent => ({
  id,
  status: "confirmed",
  summary,
  description,
  eventType: "default",
  organizer: { email: "hello@tarte.com.au", self: true },
  start: { date: day },
  end: { date: day },
})
const timed = (id: string, start: string, end: string, summary: string, extra: Partial<RawCalendarEvent> = {}): RawCalendarEvent => ({
  id,
  status: "confirmed",
  summary,
  eventType: "default",
  organizer: { email: "hello@tarte.com.au", self: true },
  start: { dateTime: start },
  end: { dateTime: end },
  ...extra,
})

const CALENDAR: RawCalendarEvent[] = [
  timed("ev-ashlee", "2026-11-29T11:00:00+10:00", "2026-11-29T14:00:00+10:00", "Ashlee Price Hideout Family lunch function ", { description: "deposit invoice sent" }),
  allDay("ev-emma", "2026-12-02", "EMMA EVOKE FUNCTION - deposit sent"),
  allDay("ev-megan", "2026-12-03", "Hideout Save Date Megan Bardsley"),
  allDay("ev-nadeen", "2026-12-04", "Nadeen hideout lunch"),
  allDay("ev-jasmine", "2026-12-05", "Hideout High Tea Jasmine Green deposit sent "),
  timed("ev-gmail", "2026-12-05T10:00:00+10:00", "2026-12-05T11:00:00+10:00", "Reservation at Tarte Beach House, Currumbin", { eventType: "fromGmail" }),
  allDay("ev-felicity", "2026-12-06", "Felicity hideout lunch 80th birthday "),
  timed("ev-hannah", "2026-12-06T11:00:00+10:00", "2026-12-06T14:00:00+10:00", " DEPOSIT INVOICE paid HANNAH PEDDIE PRIVATE TG HIGH TEA "),
  timed("ev-chloe", "2026-12-06T13:00:00+10:00", "2026-12-06T14:00:00+10:00", "Chloe L TBC 40pax 2-5pm baby shower "),
  timed("ev-paddle", "2026-12-16T09:10:00+10:00", "2026-12-16T10:10:00+10:00", "Kendall Grealy: Paddleboard Hire (Tarte Paddle Hire)"),
]

const feed = () => buildFeed({ range: RANGE, invoices: INVOICES, calendar: CALENDAR, cakes: [] })
const byId = (items: FeedItem[], id: string) => {
  const it = items.find((i) => i.id === id)
  assert.ok(it, `missing ${id}`)
  return it
}

test("28 Nov: Liz Webber's paid function has no calendar entry", () => {
  const liz = byId(feed(), "fn:TARTE-2026-00078")
  assert.equal(liz.title, "Liz Webber, Family Style Lunch in The Hideout")
  assert.equal(liz.date, "2026-11-28")
  assert.equal(liz.venue, "BEACH_HOUSE")
  assert.equal(liz.space, "The Hideout")
  assert.equal(liz.time, "12:00pm - 2:00pm")
  assert.equal(liz.startMinutes, 720)
  assert.equal(liz.guests, 12)
  assert.equal(liz.onCalendar, false)
  // amount_paid never typed in (the deposit went straight to Xero): neutral, never "unpaid".
  assert.equal(liz.status, "booked")
  assert.equal(liz.source, "invoice")
})

test("one item per thread: the standard invoice, never the balance one", () => {
  const items = feed()
  assert.ok(byId(items, "fn:TARTE-2026-00043"))
  assert.equal(items.find((i) => i.id === "fn:TARTE-2026-00044"), undefined)
  assert.equal(items.filter((i) => i.title.startsWith("Ashlee Price")).length, 1)
  const ashlee = byId(items, "fn:TARTE-2026-00043")
  assert.equal(ashlee.status, "paid")
  assert.equal(ashlee.onCalendar, true)
  assert.equal(ashlee.title, "Ashlee Price, Family style Lunch in The Hideout")
  assert.equal(ashlee.notes, "Dietaries: TBC")
  // The calendar entry it matched is not repeated.
  assert.equal(items.find((i) => i.id === "cal:ev-ashlee"), undefined)
})

test("2 Dec: Gemma's invoice is the only one that day and 'EMMA EVOKE FUNCTION' the only entry: same function", () => {
  const items = feed()
  const gemma = byId(items, "fn:TARTE-2026-00072")
  assert.equal(gemma.onCalendar, true)
  assert.equal(items.find((i) => i.id === "cal:ev-emma"), undefined)
  assert.equal(gemma.notes, "Dietaries: 1x gluten and lactose free")
})

test("3 Dec: a calendar-only save the date hold comes through as tbc", () => {
  const megan = byId(feed(), "cal:ev-megan")
  assert.equal(megan.kind, "function")
  assert.equal(megan.source, "calendar")
  assert.equal(megan.status, "tbc")
  assert.equal(megan.space, "The Hideout")
  assert.equal(megan.time, null)
  assert.equal(megan.startMinutes, null)
  assert.equal(megan.onCalendar, true)
})

test("4 Dec: Nadeen matched by first name", () => {
  const nadeen = byId(feed(), "fn:TARTE-2026-00081")
  assert.equal(nadeen.onCalendar, true)
  assert.equal(nadeen.startMinutes, 690)
})

test("5 Dec: Jasmine Green on the calendar, Josh Walker's table booking not", () => {
  const items = feed()
  const jasmine = byId(items, "fn:TARTE-2026-00068")
  assert.equal(jasmine.onCalendar, true)
  assert.equal(jasmine.status, "deposit_paid")
  const josh = byId(items, "fn:TARTE-2026-00061")
  assert.equal(josh.onCalendar, false)
  assert.equal(josh.title, "Josh Walker, Set Lunch")
  assert.equal(josh.guests, 17)
  assert.equal(josh.time, "1:30pm")
  assert.equal(josh.startMinutes, 810)
  assert.equal(josh.space, null)
  assert.equal(josh.venue, "BEACH_HOUSE")
  // The booking says the deposit landed although amount_paid is blank.
  assert.equal(josh.status, "deposit_paid")
  // Gmail's own "Reservation at" card is not a function.
  assert.equal(items.filter((i) => i.date === "2026-12-05").length, 2)
})

test("6 Dec: Felicity, Hannah Peddie and Chloe L all on the calendar; Tea Garden venue", () => {
  const items = feed()
  for (const id of ["fn:TARTE-2026-00071", "fn:TARTE-2026-00033", "fn:TARTE-2026-00051"]) assert.equal(byId(items, id).onCalendar, true, id)
  assert.equal(items.filter((i) => i.date === "2026-12-06").length, 3)
  const hannah = byId(items, "fn:TARTE-2026-00033")
  assert.equal(hannah.venue, "TEA_GARDEN")
  assert.equal(hannah.status, "deposit_paid")
  // No time on the invoice: the calendar's time fills it.
  assert.equal(hannah.time, "11:00am - 2:00pm")
  assert.equal(hannah.startMinutes, 660)
  const chloe = byId(items, "fn:TARTE-2026-00051")
  assert.equal(chloe.venue, "TEA_GARDEN")
  assert.equal(chloe.time, "3:00pm onwards")
  // Long dashes in the package name read as a comma (house rule: none on screen).
  assert.equal(chloe.title, "Chloe L, Full Tea Garden Venue Hire, Standard High Tea")
  assert.equal(chloe.startMinutes, 900)
})

test("unconfirmed, out of range and paddle hire never show; sorted by day then time", () => {
  const items = feed()
  assert.equal(items.find((i) => i.title.startsWith("Fiona")), undefined)
  assert.equal(items.find((i) => i.title.startsWith("Shahena")), undefined)
  assert.equal(items.find((i) => /paddle/i.test(i.title)), undefined)
  assert.deepEqual(
    items.map((i) => i.id),
    [
      "fn:TARTE-2026-00078",
      "fn:TARTE-2026-00043",
      "fn:TARTE-2026-00072",
      "cal:ev-megan",
      "fn:TARTE-2026-00081",
      "fn:TARTE-2026-00068",
      "fn:TARTE-2026-00061",
      "fn:TARTE-2026-00033",
      "fn:TARTE-2026-00071",
      "fn:TARTE-2026-00051",
    ]
  )
})

test("a cancelled booking (Tarte / Cancel Function label) is skipped", () => {
  const rows = [inv("TARTE-2026-00090", "t-x", { event_date: "2026-12-01", customer_name: "Sam Example", venue_space: "The Hideout" }, { amount: 900, bookingState: "cancelled" })]
  assert.equal(functionsFromInvoices(rows, RANGE).length, 0)
})

test("a thread with only a balance invoice still shows, under that number", () => {
  const rows = [inv("TARTE-2026-00091", "t-y", { event_date: "2026-12-01", customer_name: "Sam Example" }, { kind: "balance", amount: 900 })]
  const [f] = functionsFromInvoices(rows, RANGE)
  assert.equal(f.item.id, "fn:TARTE-2026-00091")
  assert.equal(f.item.title, "Sam Example, Function")
})

test("a save-the-date paid in full is only the deposit", () => {
  const rows = [inv("TARTE-2026-00045", "t-alice", { event_date: "2026-12-01", customer_name: "Alice Example", flat_deposit_amount: 500, guests: 28, amount_paid: 500, venue_space: "The Hideout" }, { amount: 500 })]
  assert.equal(functionsFromInvoices(rows, RANGE)[0].item.status, "deposit_paid")
})

test("the same customer on the same day in two threads is one function, the latest thread", () => {
  const rows = [
    inv("TARTE-2026-00035", "t-old", { event_date: "2026-12-01", customer_name: "Shannon Example", flat_deposit_amount: 500, amount_paid: 500 }, { amount: 500 }),
    inv("TARTE-2026-00073", "t-new", { event_date: "2026-12-01", customer_name: "Shannon Example", guests: 30, per_person_price: 89, venue_space: "The Hideout" }, { amount: 2670 }),
  ]
  const fs = functionsFromInvoices(rows, RANGE)
  assert.equal(fs.length, 1)
  assert.equal(fs[0].item.id, "fn:TARTE-2026-00073")
  assert.equal(fs[0].item.status, "deposit_paid")
})

test("the one-each fallback never pairs with a TBC hold or a different space", () => {
  const rows = [inv("TARTE-2026-00092", "t-z", { event_date: "2026-12-03", customer_name: "Pat Example", venue_space: "Tea Garden" }, { amount: 900 })]
  const hold = buildFeed({ range: RANGE, invoices: rows, calendar: [allDay("h", "2026-12-03", "Hideout Save Date Megan Bardsley")], cakes: [] })
  assert.equal(byId(hold, "fn:TARTE-2026-00092").onCalendar, false)
  assert.ok(byId(hold, "cal:h"))
  const other = buildFeed({ range: RANGE, invoices: rows, calendar: [allDay("o", "2026-12-03", "Hideout lunch Smith 14pax")], cakes: [] })
  assert.equal(byId(other, "fn:TARTE-2026-00092").onCalendar, false)
  assert.equal(byId(other, "cal:o").guests, 14)
})

test("names match whole words only, 3+ letters", () => {
  assert.deepEqual(nameWords("Chloe L"), ["chloe"])
  assert.deepEqual(nameWords("Liz Webber"), ["liz", "webber"])
  const rows = [
    inv("TARTE-2026-00093", "t-a", { event_date: "2026-12-03", customer_name: "Ann Example" }, { amount: 900 }),
    inv("TARTE-2026-00094", "t-b", { event_date: "2026-12-03", customer_name: "Bo Other" }, { amount: 900 }),
  ]
  const items = buildFeed({ range: RANGE, invoices: rows, calendar: [allDay("a", "2026-12-03", "Anniversary lunch Hideout")], cakes: [] })
  assert.equal(byId(items, "fn:TARTE-2026-00093").onCalendar, false)
  assert.ok(byId(items, "cal:a"))
})

test("calendar not readable: onCalendar unknown (null), invoices still listed", () => {
  const items = buildFeed({ range: RANGE, invoices: INVOICES, calendar: null, cakes: [] })
  const liz = byId(items, "fn:TARTE-2026-00078")
  assert.equal(liz.onCalendar, null)
  assert.equal(items.filter((i) => i.source === "calendar").length, 0)
})

test("calendar statuses: TBC, enquiry, deposit paid, booked", () => {
  const cs = calendarEntries(
    [
      allDay("1", "2026-12-01", "TBC - Pennie hideout 20pax"),
      allDay("2", "2026-12-01", "ENQUIRY - Tea Garden high tea"),
      allDay("3", "2026-12-01", "Smith TG high tea", "deposit receievd and balance sent"),
      allDay("4", "2026-12-01", "Jones hideout lunch - deposit sent"),
      allDay("5", "2026-12-01", "CANCELLED Brown hideout"),
    ],
    RANGE
  )
  assert.deepEqual(cs.map((c) => [c.item.id, c.item.status]), [
    ["cal:1", "tbc"],
    ["cal:2", "tbc"],
    ["cal:3", "deposit_paid"],
    ["cal:4", "booked"],
  ])
  assert.equal(cs[0].item.title, "Pennie hideout 20pax")
  assert.equal(cs[0].item.guests, 20)
  assert.equal(cs[1].item.venue, "TEA_GARDEN")
  assert.equal(cs[2].item.notes, "deposit receievd and balance sent")
})

const cake = (over: Partial<CakeRowIn>): CakeRowIn => ({
  id: "c1",
  venue: "BEACH_HOUSE",
  pickupDate: "2026-11-29",
  pickupTime: "13:00",
  customerName: "Tara Example",
  product: "Tarte Signature Celebration Cake",
  quantity: 1,
  details: "Raspberries / 6 Inch / Dulce De Leche",
  message: null,
  dietary: null,
  status: "NEW",
  ...over,
})

test("cakes: pickups still to happen, with notes, status and time", () => {
  const items = cakeItems(
    [
      cake({}),
      cake({ id: "c2", venue: "BURLEIGH", pickupTime: "07:30", quantity: 6, product: "Plain Croissant", details: "Baked", message: "Happy 40th", dietary: "Nut free", status: "SEEN" }),
      cake({ id: "c3", status: "COLLECTED" }),
      cake({ id: "c4", status: "CANCELLED" }),
      cake({ id: "c5", pickupDate: null }),
      cake({ id: "c6", pickupDate: "2026-12-24" }),
      cake({ id: "c7", venue: "BOTH", status: "READY", pickupTime: null }),
    ],
    RANGE
  )
  assert.deepEqual(items.map((i) => i.id), ["cake:c1", "cake:c2", "cake:c7"])
  const [a, b, c] = items
  assert.equal(a.title, "Cake pickup: Tara Example, 1x Tarte Signature Celebration Cake")
  assert.equal(a.time, "1:00pm")
  assert.equal(a.startMinutes, 780)
  assert.equal(a.status, "new")
  assert.equal(a.kind, "cake")
  assert.equal(a.source, "cake_order")
  assert.equal(a.onCalendar, null)
  assert.equal(a.notes, "Raspberries / 6 Inch / Dulce De Leche")
  assert.equal(b.venue, "BURLEIGH")
  assert.equal(b.title, "Cake pickup: Tara Example, 6x Plain Croissant")
  assert.equal(b.notes, 'Baked. On the cake: "Happy 40th". Dietary: Nut free')
  assert.equal(b.status, "seen")
  assert.equal(c.venue, "BURLEIGH")
  assert.equal(c.status, "ready")
  assert.equal(c.time, null)
})

test("cakes and functions share one list: day, then time, no-time first", () => {
  const items = buildFeed({
    range: RANGE,
    invoices: INVOICES,
    calendar: CALENDAR,
    cakes: [cake({ id: "late", pickupDate: "2026-11-28", pickupTime: "14:00" }), cake({ id: "early", pickupDate: "2026-11-28", pickupTime: "08:00" })],
  })
  assert.deepEqual(items.slice(0, 3).map((i) => i.id), ["cake:early", "fn:TARTE-2026-00078", "cake:late"])
})

test("times and days", () => {
  assert.equal(startMinutesOf("12:00pm - 2:00pm"), 720)
  assert.equal(startMinutesOf("12:00pm (arrival from 11:30am)"), 720)
  assert.equal(startMinutesOf("3pm onwards"), 900)
  assert.equal(startMinutesOf("12am"), 0)
  assert.equal(startMinutesOf("13:00"), 780)
  assert.equal(startMinutesOf("lunch"), null)
  assert.equal(startMinutesOf(null), null)
  assert.equal(clockText(810), "1:30pm")
  assert.equal(clockText(0), "12:00am")
  assert.equal(validDay("2026-02-30"), null)
  assert.equal(validDay("2026-12-24"), "2026-12-24")
})
