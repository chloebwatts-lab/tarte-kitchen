import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { groupByDay, toFunctionEvent } from "./calendar"

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
})
