import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { clashesFor, groupByDay, isGroupBooking, isTeamBooking, toFunctionEvent } from "./calendar"

describe("functions calendar", () => {
  test("TBC prefix becomes a flag and pax is pulled out of the title", () => {
    const e = toFunctionEvent({
      id: "nbi123",
      summary: "TBC — High Tea: Sarah Moore (17 pax)",
      start: { dateTime: "2026-10-10T00:30:00.000Z" },
      end: { dateTime: "2026-10-10T02:00:00.000Z" },
    })
    assert.equal(e?.tbc, true)
    assert.equal(e?.title, "High Tea: Sarah Moore")
    assert.equal(e?.pax, 17)
    assert.equal(e?.day, "2026-10-10")
    assert.equal(e?.time?.replace(/ | /g, " ").toLowerCase(), "10:30 am")
  })

  test("a late-evening UTC start lands on the next Brisbane day", () => {
    const e = toFunctionEvent({ summary: "Function Beach House: Kate", start: { dateTime: "2026-10-09T20:00:00.000Z" } })
    assert.equal(e?.day, "2026-10-10")
    assert.equal(e?.tbc, false)
    assert.equal(e?.pax, null)
  })

  test("cancelled and blank entries are dropped, all-day entries keep their date", () => {
    assert.equal(toFunctionEvent({ status: "cancelled", summary: "x", start: { date: "2026-10-10" } }), null)
    assert.equal(toFunctionEvent({ summary: "  ", start: { date: "2026-10-10" } }), null)
    const allDay = toFunctionEvent({ summary: "HIDEOUT HIGH TEA", start: { date: "2026-10-12" } })
    assert.equal(allDay?.day, "2026-10-12")
    assert.equal(allDay?.time, null)
  })

  test("groups by day in date then time order", () => {
    const days = groupByDay([
      { id: "c", summary: "C", start: { dateTime: "2026-10-11T01:00:00.000Z" } },
      { id: "b", summary: "B", start: { dateTime: "2026-10-10T04:00:00.000Z" } },
      { id: "a", summary: "A", start: { dateTime: "2026-10-10T00:00:00.000Z" } },
    ])
    assert.deepEqual(days.map((d) => d.day), ["2026-10-10", "2026-10-11"])
    assert.deepEqual(days[0].events.map((e) => e.id), ["a", "b"])
  })

  test("hand-written holds read as TBC, with the TBC word taken off the title", () => {
    assert.equal(toFunctionEvent({ summary: "Dominique Hideout Enquiry TBC", start: { date: "2026-11-14" } })?.tbc, true)
    const trailing = toFunctionEvent({ summary: "Hideout 17 pax lunch Jade Finch TBC", start: { date: "2026-11-21" } })
    assert.equal(trailing?.tbc, true)
    assert.equal(trailing?.title, "Hideout 17 pax lunch Jade Finch")
    assert.equal(trailing?.pax, 17)
    const lead = toFunctionEvent({ summary: "TBC - Pennie Hideout Lunch", start: { date: "2026-12-04" } })
    assert.equal(lead?.title, "Pennie Hideout Lunch")
    assert.equal(toFunctionEvent({ summary: "Chloe L TBC 40pax 2-5pm baby shower", start: { date: "2026-12-06" } })?.tbc, true)
    assert.equal(toFunctionEvent({ summary: "ENQUIRY - Madeleine Maris", start: { date: "2026-10-31" } })?.tbc, true)
    assert.equal(toFunctionEvent({ summary: "Ryan Devisser Hideout event", start: { date: "2026-11-14" } })?.tbc, false)
  })

  test("pax typed by hand: 40pax, 17PAX and the top of a 15-20pax range", () => {
    assert.equal(toFunctionEvent({ summary: "Chloe L TBC 40pax 2-5pm baby shower", start: { date: "2026-12-06" } })?.pax, 40)
    assert.equal(toFunctionEvent({ summary: "SARAH MOORE HIDEOUT HIGH TEA 17PAX", start: { date: "2026-08-22" } })?.pax, 17)
    assert.equal(toFunctionEvent({ summary: "Paige Amos Hideout High tea 15-20pax", start: { date: "2027-01-09" } })?.pax, 20)
  })

  test("team calendar keeps functions, drops paddle hire, Gmail cards, outside invites and cancelled", () => {
    assert.equal(isTeamBooking({ summary: "Ryan Devisser Hideout event", organizer: { email: "hello@tarte.com.au", self: true } }), true)
    assert.equal(isTeamBooking({ summary: "Gingerbread build from 1pm" }), true)
    assert.equal(isTeamBooking({ summary: "Hilda Lee: Paddleboard Hire (Tarte Paddle Hire)" }), false)
    assert.equal(isTeamBooking({ summary: "Hilda Lee: KAYAK Hire (Tarte Paddle Hire)" }), false)
    assert.equal(isTeamBooking({ summary: "Reservation at Tarte Beach House, Currumbin", eventType: "fromGmail" }), false)
    assert.equal(isTeamBooking({ summary: "Tarte Bakery + Square | POS Training", organizer: { email: "bbraun@squareup.com" } }), false)
    assert.equal(isTeamBooking({ summary: "CANCELLED - Nadine Glavas 80th hideout" }), false)
  })

  test("auto calendar shows high-tea groups of 10 or more only", () => {
    const two = toFunctionEvent({ summary: "Currumbin || Tea Garden High Tea: Angela Johnson (2 pax)", start: { dateTime: "2026-11-14T00:00:00.000Z" } })
    const twelve = toFunctionEvent({ summary: "Currumbin || Tea Garden High Tea: Tahlia Baker (12 pax)", start: { dateTime: "2026-11-21T22:30:00.000Z" } })
    assert.equal(isGroupBooking(two!), false)
    assert.equal(isGroupBooking(twelve!), true)
  })

  test("two team entries for one space on a day are flagged; high teas from Now Book It are not", () => {
    assert.deepEqual(clashesFor(["Dominique Hideout Enquiry TBC", "Ryan Devisser Hideout event"]), ["Hideout"])
    assert.deepEqual(clashesFor(["Hideout 17 pax lunch Jade Finch", "TG whole venue hire enquiry Emma Long"]), [])
    const days = groupByDay(
      [
        { id: "a", summary: "Dominique Hideout Enquiry TBC", start: { date: "2026-11-14" } },
        { id: "b", summary: "Ryan Devisser Hideout event", start: { date: "2026-11-14" } },
        { id: "n1", summary: "Tea Garden High Tea: A (12 pax)", start: { dateTime: "2026-11-14T00:00:00.000Z" } },
        { id: "n2", summary: "Tea Garden High Tea: B (10 pax)", start: { dateTime: "2026-11-14T01:00:00.000Z" } },
      ],
      new Set(["a", "b"])
    )
    assert.deepEqual(days[0].clashes, ["Hideout"])
  })
})
