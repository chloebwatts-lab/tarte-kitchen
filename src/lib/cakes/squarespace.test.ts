import { test } from "node:test"
import assert from "node:assert/strict"
import { datesInText, flatten, importDecision, isMadeToOrder, isPlainDate, parseItemDate, parseTime, parseWebsiteOrder, venueFromText } from "./squarespace"

// Layouts copied from real hello@ order emails (Nov 2026); every name, email,
// address and phone number is made up.
const HEAD = (no: string, billed: string, place: string, address: string) =>
  `Tarte.: A New Order has Arrived (${no}) | Squarespace &nbsp; &nbsp; Commerce Tarte.: A New Order has Arrived (${no}) After shipping the package, mark the order as fulfilled. Order #${no}. Placed on November 24, 2026 at 6:19 PM GMT+10. View in Stripe BILLED TO: PICKUP OPTION: ${billed} ${place} Pickup Information: ${address} Open 7 Days 6:30am-3:00pm &nbsp; Order Summary &nbsp; ITEM QTY UNIT PRICE SUBTOTAL &nbsp; `
const TAIL = (date: string, time: string, notes: string) =>
  ` &nbsp; &nbsp; Item Subtotal Shipping &amp; Handling Net Subtotal Tax TOTAL &nbsp; A$165.00 A$0.00 A$165.00 A$0.00 A$165.00 &nbsp; &nbsp; Requested Pickup Date: ${date} Requested Pickup Time: ${time} Extra Notes: ${notes} blog • Help Center • Webinars • Contact Us`

const CURRUMBIN = ["Currumbin Beach House", "4/4 Thrower Drive Currumbin, QLD, 4223"] as const
const BURLEIGH = ["Burleigh Heads", "Shop 2, 2 West St Burleigh Heads, QLD, 4220"] as const

test("signature cake: options, venue, date, time, notes", () => {
  const body =
    HEAD("03032", "Jane Citizen 12 Example Way Karalee, QLD, 4306 Australia Apple Pay jane.citizen@example.com", ...CURRUMBIN) +
    "Tarte Signature Celebration Cake SQ2490270 Raspberries / 6 Inch / Dulce De Leche 1 A$165.00 A$165.00" +
    TAIL("29/11/2026", "13:00", "Booking under Jane Smith")
  const o = parseWebsiteOrder(body, "2026-11-24")
  assert.ok(o)
  assert.equal(o.orderNo, "03032")
  assert.equal(o.customerName, "Jane Citizen")
  assert.equal(o.customerEmail, "jane.citizen@example.com")
  assert.equal(o.venue, "BEACH_HOUSE")
  assert.equal(o.notes, "Booking under Jane Smith")
  assert.equal(o.items.length, 1)
  const it = o.items[0]
  assert.equal(it.product, "Tarte Signature Celebration Cake")
  assert.equal(it.details, "Raspberries / 6 Inch / Dulce De Leche")
  assert.equal(it.quantity, 1)
  assert.equal(it.venue, "BEACH_HOUSE")
  assert.equal(it.pickupDate, "2026-11-29")
  assert.equal(it.pickupTime, "13:00")
  assert.deepEqual(it.checkNotes, [])
})

test("free-text pickup box: date read, flagged for a person", () => {
  const body =
    HEAD("03031", "Sam Example 6 Sample Avenue Kunda Park, QLD, 4556 Australia CC: XXXX-1234 sam@example.com +61400000001", ...CURRUMBIN) +
    "Tarte Signature Celebration Cake SQ6832532 Naked / 6 Inch / Dulce De Leche 1 A$155.00 A$155.00" +
    TAIL("Lunch at Tarte 12pm -2pm Thursday 26th Nov Birthday", "14:00", "We have a lunch booked for 6")
  const o = parseWebsiteOrder(body, "2026-11-24")!
  assert.equal(o.customerPhone, "+61400000001")
  const it = o.items[0]
  assert.equal(it.pickupDate, "2026-11-26")
  assert.equal(it.customerPhone, "+61400000001")
  assert.equal(it.checkNotes.length, 1)
  assert.match(it.checkNotes[0], /Date read from what the customer wrote/)
})

test("item form fields (US date) win, several items, lower-case name", () => {
  const body =
    HEAD("03029", "kate example 574 Sample Creek Road Tallebudgera Valley, QLD, 4228 Australia Link kate@example.ca +61400000002", ...BURLEIGH) +
    "Lemon Butter Cake SQ0199162 Name: kate example Date: 11/22/2026 Time: 2:00pm Number: 0400000002 Location: Tarte Bakery, Burleigh Heads. 1 A$85.00 A$85.00 &nbsp; " +
    "Strawberry Tarte SQ7815337 2 A$10.90 A$21.80" +
    TAIL("22/11/2026 Sunday", "14:00", "")
  const o = parseWebsiteOrder(body, "2026-11-20")!
  assert.equal(o.customerName, "Kate Example")
  assert.equal(o.venue, "BURLEIGH")
  assert.equal(o.notes, null)
  assert.equal(o.items.length, 2)
  const [cake, tarts] = o.items
  assert.equal(cake.product, "Lemon Butter Cake")
  assert.equal(cake.details, null)
  assert.equal(cake.pickupDate, "2026-11-22")
  assert.equal(cake.pickupTime, "14:00")
  assert.equal(cake.customerPhone, "0400000002")
  assert.deepEqual(cake.checkNotes, [])
  assert.equal(tarts.product, "Strawberry Tarte")
  assert.equal(tarts.quantity, 2)
  assert.equal(tarts.pickupDate, "2026-11-22")
})

test("Christmas layout: Location / Date: 24 DEC 2026 / Pick up Time, phone with a note after it", () => {
  const body =
    HEAD("03022", "Pat Example 9 Sample St Mudgeeraba, QLD, 4213 Australia Apple Pay pat@example.com", ...BURLEIGH) +
    "Mini Cherry Pie - 5 Pack SQ4270066 Location: Tarte Bakery, Burleigh Heads. Date: 24 DEC 2026 Pick up Time: 1:00pm Confirmation: Pickup Location, Pickup Date & Time Contact Number: 0400 000 003 Lovely Baker 1 A$85.00 A$85.00" +
    TAIL("24 Dec", "13:00", "")
  const it = parseWebsiteOrder(body, "2026-11-17")!.items[0]
  assert.equal(it.product, "Mini Cherry Pie - 5 Pack")
  assert.equal(it.details, null)
  assert.equal(it.pickupDate, "2026-12-24")
  assert.equal(it.pickupTime, "13:00")
  assert.equal(it.customerPhone, "0400 000 003")
  assert.deepEqual(it.checkNotes, [])
})

test("item place differs from the order's pickup place: item wins, flagged", () => {
  const body =
    HEAD("03035", "Cath Example 1 Sample Rd Elanora, QLD, 4221 Australia Apple Pay cath@example.com", ...BURLEIGH) +
    "Baked Ricotta Cheesecake SQ6776854 Name: Cath Example Date: 12/1/2026 Time: 7:30am Number: 0400000004 Location: Tarte Beach House, Currumbin. 1 A$85.00 A$85.00" +
    TAIL("Tuesday 1st December 7.30am", "07:00", "")
  const it = parseWebsiteOrder(body, "2026-11-24")!.items[0]
  assert.equal(it.venue, "BEACH_HOUSE")
  assert.equal(it.pickupDate, "2026-12-01")
  assert.equal(it.pickupTime, "07:30")
  assert.equal(it.checkNotes.length, 1)
  assert.match(it.checkNotes[0], /order says pick up at Burleigh, the item says Currumbin/)
})

test("pickup box with no date and no item date: no date, flagged", () => {
  const body =
    HEAD("03027", "Lee Example 3 Sample Pde Tugun, QLD, 4224 Australia Apple Pay lee@example.com", ...BURLEIGH) +
    "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" +
    TAIL("Currumbin Tarte", "09:00", "0400000005")
  const it = parseWebsiteOrder(body, "2026-11-19")!.items[0]
  assert.equal(it.details, "BAKED")
  assert.equal(it.pickupDate, null)
  assert.match(it.checkNotes[0], /No pickup date we could read.*Currumbin Tarte/)
})

test("two dates in the pickup box for one undated item: first one, flagged", () => {
  const body =
    HEAD("03023", "Lily Example 2 Sample Ct Palm Beach, QLD, 4221 Australia Apple Pay lily@example.com", ...CURRUMBIN) +
    "Gingerbread House SQ2141613 1 A$99.00 A$99.00" +
    TAIL("24th December for Christmas Cakes. 1st december for gingerbread", "08:00", "")
  const it = parseWebsiteOrder(body, "2026-11-17")!.items[0]
  assert.equal(it.pickupDate, "2026-12-24")
  assert.match(it.checkNotes[0], /Check which date is for this item/)
})

test("not an order email: null", () => {
  assert.equal(parseWebsiteOrder("Your Squarespace invoice is ready", "2026-11-24"), null)
})

test("dates in free text, day first", () => {
  assert.deepEqual(datesInText("Friday 20.11.26", "2026-11-19"), ["2026-11-20"])
  assert.deepEqual(datesInText("Saturday, 14/11/2026", "2026-11-11"), ["2026-11-14"])
  assert.deepEqual(datesInText("Tuesday, 17 November 2026", "2026-11-09"), ["2026-11-17"])
  assert.deepEqual(datesInText("November 20", "2026-11-07"), ["2026-11-20"])
  assert.deepEqual(datesInText("28th November", "2026-11-25"), ["2026-11-28"])
  assert.deepEqual(datesInText("7/11/26", "2026-11-06"), ["2026-11-07"])
  // Year-less date well before the order means next year.
  assert.deepEqual(datesInText("3rd January", "2026-11-25"), ["2027-01-03"])
  // A few days back is a late email, not next year.
  assert.deepEqual(datesInText("22 Nov", "2026-11-25"), ["2026-11-22"])
  assert.deepEqual(datesInText("Currumbin Tarte", "2026-11-25"), [])
  assert.deepEqual(datesInText("31/02/2026", "2026-01-25"), [])
})

test("item dates are US month first or DD MON YYYY", () => {
  assert.equal(parseItemDate("11/27/2026"), "2026-11-27")
  assert.equal(parseItemDate("12/1/2026"), "2026-12-01")
  assert.equal(parseItemDate("24 DEC 2026"), "2026-12-24")
  assert.equal(parseItemDate(""), null)
  assert.equal(parseItemDate("13/27/2026"), null)
})

test("times", () => {
  assert.equal(parseTime("8:30am"), "08:30")
  assert.equal(parseTime("2:00pm"), "14:00")
  assert.equal(parseTime("12:00pm"), "12:00")
  assert.equal(parseTime("12am"), "00:00")
  assert.equal(parseTime("13:00"), "13:00")
  assert.equal(parseTime("8.30 am"), "08:30")
  assert.equal(parseTime("1"), null)
  assert.equal(parseTime(""), null)
})

test("venues and what gets made", () => {
  assert.equal(venueFromText("Tarte Bakery, Burleigh Heads."), "BURLEIGH")
  assert.equal(venueFromText("Tarte Beach House, Currumbin."), "BEACH_HOUSE")
  assert.equal(venueFromText("Tea Garden"), "TEA_GARDEN")
  assert.equal(venueFromText("Brisbane"), null)
  assert.equal(isMadeToOrder("Tarte Gift Card"), false)
  assert.equal(isMadeToOrder("Cherry Pie"), true)
  assert.equal(flatten("a&nbsp;&amp;\n\n b"), "a & b")
})

test("a line with no form fields borrows the name, number and date of the rest of the order", () => {
  const body =
    HEAD("03010", "La &amp; Gf Example 16 Sample Avenue 503 Palm Beach, QLD, 4221 Australia Apple Pay la@example.com", ...BURLEIGH) +
    "Blueberry Tarte SQ0729901 Name: Lynne Example Date: 11/8/2026 Time: 10:00am Number: 0400000006 3 A$11.90 A$35.70 &nbsp; " +
    "Strawberry Tarte SQ7815337 2 A$10.90 A$21.80" +
    TAIL("08/10/2026", "10:00", "")
  const o = parseWebsiteOrder(body, "2026-11-04")!
  assert.equal(o.customerName, "La & Gf Example")
  const [blue, straw] = o.items
  assert.equal(blue.pickupDate, "2026-11-08")
  assert.match(blue.checkNotes[0], /also wrote "08\/10\/2026"/)
  assert.equal(straw.pickupDate, "2026-11-08")
  assert.equal(straw.customerPhone, "0400000006")
  assert.equal(straw.customerName, "La & Gf Example")
  assert.match(straw.checkNotes[0], /date from the rest of the order/)
})

test("a date before the order was placed is flagged", () => {
  const body =
    HEAD("03100", "Max Example 1 Sample St Tugun, QLD, 4224 Australia Apple Pay max@example.com", ...BURLEIGH) +
    "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" +
    TAIL("08/10/2026", "10:00", "")
  const it = parseWebsiteOrder(body, "2026-11-04")!.items[0]
  assert.equal(it.pickupDate, "2026-10-08")
  assert.ok(it.checkNotes.some((n) => /before the order was placed/.test(n)))
})

test("an item with no place goes with the rest of the order's items, flagged when the order says elsewhere (03039 layout)", () => {
  const body =
    HEAD("03039", "Laura Example 75 Sample Cres Currumbin Waters, QLD, 4223 Australia Link laura@example.com", ...BURLEIGH) +
    "Blueberry Tarte SQ0729901 Name: Laura Example Date: 12/24/2026 Time: 1:00pm Number: 0400000007 Location: Tarte Beach House, Currumbin. 4 A$11.90 A$47.60 &nbsp; " +
    "Gingerbread House SQ2141613 Location: Tarte Beach House, Currumbin. Date: 24 DEC 2026 Pick up Time: 1:00pm Confirmation: Pickup Location, Pickup Date & Time Contact Number: 0400000007 1 A$99.00 A$99.00 &nbsp; " +
    "Raspberry Tarte SQ1133211 4 A$12.00 A$48.00" +
    TAIL("24/12/2026", "13:00", "")
  const o = parseWebsiteOrder(body, "2026-11-27")!
  assert.equal(o.venue, "BURLEIGH")
  assert.deepEqual(o.items.map((i) => i.venue), ["BEACH_HOUSE", "BEACH_HOUSE", "BEACH_HOUSE"])
  assert.deepEqual(o.items.map((i) => i.pickupDate), ["2026-12-24", "2026-12-24", "2026-12-24"])
  assert.equal(o.items[2].pickupTime, "13:00")
  assert.match(o.items[2].checkNotes[0], /No pickup place on this item, so it goes with the rest of the order \(Currumbin\)\. The order says Burleigh/)
})

test("an item with no place and no order place takes the other items' place quietly", () => {
  const body =
    HEAD("03101", "Ann Example 1 Sample St Tugun, QLD, 4224 Australia Apple Pay ann@example.com", "Somewhere Else", "1 Nowhere Rd") +
    "Pecan Pie SQ0475664 Location: Tarte Bakery, Burleigh Heads. Date: 24 DEC 2026 Pick up Time: 9:00am Confirmation: Pickup Location 1 A$85.00 A$85.00 &nbsp; " +
    "Raspberry Tarte SQ1133211 2 A$12.00 A$24.00" +
    TAIL("24/12/2026", "09:00", "")
  const o = parseWebsiteOrder(body, "2026-11-27")!
  assert.equal(o.venue, null)
  assert.equal(o.items[1].venue, "BURLEIGH")
  assert.deepEqual(o.items[1].checkNotes, [])
})

test("the name stops at a PO box or unit, not only at a house number", () => {
  const po = parseWebsiteOrder(
    HEAD("03030", "Chris Example P.O.Box 93 New farm, QLD, 4005 Australia Link chris@example.com +61400000008", ...BURLEIGH) +
      "Cherry Pie SQ5193880 BAKED Location: Tarte Bakery, Burleigh Heads. Date: 24 DEC 2026 Pick up Time: 9:00am 1 A$85.00 A$85.00" +
      TAIL("24 Dec 2026", "07:00", ""),
    "2026-11-23"
  )!
  assert.equal(po.customerName, "Chris Example")
  assert.equal(po.items[0].pickupTime, "09:00")
  const unit = parseWebsiteOrder(
    HEAD("03102", "Liam Example Unit 5 Sample St Tugun, QLD, 4224 Australia Apple Pay liam@example.com", ...CURRUMBIN) +
      "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" +
      TAIL("3/11/26", "08:00", ""),
    "2026-10-30"
  )!
  assert.equal(unit.customerName, "Liam Example")
})

test("plain date pickup boxes need no person; anything more does", () => {
  assert.equal(isPlainDate("24/12/2026"), true)
  assert.equal(isPlainDate("22/11/2026 Sunday"), true)
  assert.equal(isPlainDate("28 November (Saturday)"), true)
  assert.equal(isPlainDate("Tuesday, 17 November 2026"), true)
  assert.equal(isPlainDate("Friday 27/11/26 8.30 am at Tarte Currumbin - blueberries please"), false)
  assert.equal(isPlainDate("Currumbin Tarte"), false)
})

test("import: a date before the order was placed comes in with no date, flagged; a real past date stays out", () => {
  // "12/5/2026" typed US style for 5 Dec reads as 12 May.
  const misread = importDecision({ pickupDate: "2026-05-12", checkNotes: ["That date is before the order was placed."] }, "2026-11-28", "2026-11-28")
  assert.equal(misread.keep, true)
  assert.equal(misread.pickupDate, null)
  assert.deepEqual(misread.checkNotes, ["We read the pickup date as 2026-05-12, before the order was placed. Set the right date."])
  // Ordered 24 Nov for 26 Nov, imported on 28 Nov by a catch-up: gone, leave it out.
  assert.equal(importDecision({ pickupDate: "2026-11-26", checkNotes: [] }, "2026-11-24", "2026-11-28").keep, false)
  // Today and later, and no date at all, always come in.
  assert.equal(importDecision({ pickupDate: "2026-11-28", checkNotes: [] }, "2026-11-24", "2026-11-28").keep, true)
  assert.equal(importDecision({ pickupDate: null, checkNotes: ["No pickup date on the order."] }, "2026-11-01", "2026-11-28").keep, true)
  // A two-month catch-up leaves old undated orders out.
  assert.equal(importDecision({ pickupDate: null, checkNotes: [] }, "2026-10-01", "2026-11-28").keep, false)
  assert.equal(importDecision({ pickupDate: "2026-05-12", checkNotes: [] }, "2026-10-01", "2026-11-28").keep, false)
})

test("names: accents, a Lot address, a payment word with no address", () => {
  const accent = parseWebsiteOrder(
    HEAD("03103", "Zoë Renée 4 Sample St Tugun, QLD, 4224 Australia Apple Pay zoe@example.com", ...CURRUMBIN) + "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" + TAIL("24/12/2026", "09:00", ""),
    "2026-11-28"
  )!
  assert.equal(accent.customerName, "Zoë Renée")
  const lot = parseWebsiteOrder(
    HEAD("03104", "Jane Citizen Lot 5 Sample Rd Tallebudgera, QLD, 4228 Australia Apple Pay jane@example.com", ...BURLEIGH) + "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" + TAIL("24/12/2026", "09:00", ""),
    "2026-11-28"
  )!
  assert.equal(lot.customerName, "Jane Citizen")
  const pay = parseWebsiteOrder(
    HEAD("03105", "Jane Citizen Apple Pay jane@example.com", ...BURLEIGH) + "Cherry Pie SQ5193880 BAKED 1 A$85.00 A$85.00" + TAIL("24/12/2026", "09:00", ""),
    "2026-11-28"
  )!
  assert.equal(pay.customerName, "Jane Citizen")
})
