import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { brisbaneDay, buildHighTeaDay, changesSince, checkLabel, extraFor, niceTime, type HighTeaBooking } from "./prep"

const b = (ref: string, pax: number, status = "Confirmed", time = "10:00"): HighTeaBooking => ({
  ref, pax, status, time, name: `Guest ${ref}`, notes: null, tags: null,
})
const STAND = [
  { name: "Scone", perGuest: 1 },
  { name: "Finger sandwich", perGuest: 2 },
  { name: "Shared tart", perGuest: 0.5 },
]

describe("high tea prep list", () => {
  test("4 extra of each on weekdays, 8 on Saturday and Sunday", () => {
    assert.equal(extraFor("2026-10-09"), 4) // Friday
    assert.equal(extraFor("2026-10-10"), 8) // Saturday
    assert.equal(extraFor("2026-10-11"), 8) // Sunday
    assert.equal(extraFor("2026-10-12"), 4) // Monday
  })

  test("guests x per guest, plus the extras; unconfirmed still counted", () => {
    const d = buildHighTeaDay("2026-10-10", [b("1", 29), b("2", 19, "Unconfirmed")], new Map(), STAND)
    assert.equal(d.guests, 48)
    assert.equal(d.unconfirmedGuests, 19)
    assert.deepEqual(d.lines.map((l) => l.total), [48 + 8, 96 + 8, 24 + 8])
    assert.equal(d.uncheckedBookings, 2)
  })

  test("cancelled and no-show bookings are left out", () => {
    const d = buildHighTeaDay("2026-10-07", [b("1", 2), b("2", 6, "Cancelled"), b("3", 4, "No Show")], new Map(), STAND)
    assert.equal(d.bookedGuests, 2)
    assert.equal(d.lines[0].total, 2 + 4)
  })

  test("the day-before check lowers the count, never raises it, and half portions round up", () => {
    const checks = new Map([["1", 3], ["2", 0], ["3", 99]])
    const d = buildHighTeaDay("2026-10-07", [b("1", 4), b("2", 6), b("3", 2)], checks, STAND)
    assert.equal(d.bookedGuests, 12)
    assert.equal(d.guests, 5) // 3 + 0 + 2 (99 capped at the 2 booked)
    assert.equal(d.lines[2].forBookings, 3) // 2.5 shared tarts rounds up
    assert.equal(d.uncheckedBookings, 0)
    assert.deepEqual(d.bookings.map(checkLabel), ["High tea for 3 of 4", "Not having high tea", "Full high tea"])
  })

  test("no bookings still makes the walk-in extras", () => {
    const d = buildHighTeaDay("2026-10-07", [], new Map(), STAND)
    assert.deepEqual(d.lines.map((l) => l.total), [4, 4, 4])
  })

  test("changes since the earlier list", () => {
    const c = changesSince(
      [{ name: "Scone", total: 30 }, { name: "Tart", total: 20 }],
      [{ name: "Scone", total: 36 }, { name: "Tart", total: 20 }, { name: "Macaron", total: 12 }]
    )
    assert.deepEqual(c, [
      { name: "Scone", before: 30, now: 36, delta: 6 },
      { name: "Macaron", before: null, now: 12, delta: 12 },
    ])
  })

  test("Brisbane day rolls over at 2pm UTC, and times read like a clock", () => {
    assert.equal(brisbaneDay(0, new Date("2026-10-05T13:59:00Z")), "2026-10-05")
    assert.equal(brisbaneDay(0, new Date("2026-10-05T14:00:00Z")), "2026-10-06")
    assert.equal(brisbaneDay(2, new Date("2026-10-04T23:00:00Z")), "2026-10-07")
    assert.equal(niceTime("09:30"), "9:30 am")
    assert.equal(niceTime("12:00"), "12:00 pm")
  })
})
