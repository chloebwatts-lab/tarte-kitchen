import { test } from "node:test"
import assert from "node:assert/strict"
import { hoursVsRosterReading, type HoursRow } from "./readings"

const at = (iso: string) => new Date(iso)
/** Hourly rows only (the query drops salaried ones): 872 h rostered, 840 h worked, as a sample week. */
function week(extra: HoursRow[] = []): HoursRow[] {
  const rows: HoursRow[] = []
  for (let i = 0; i < 109; i++) rows.push({ source: "ROSTER", hours: 8, employeeName: `R${i}`, shiftStart: at("2026-11-11T21:00:00Z") })
  for (let i = 0; i < 105; i++) rows.push({ source: "TIMESHEET", hours: 8, employeeName: `T${i}`, shiftStart: at("2026-11-11T21:00:00Z") })
  return [...rows, ...extra]
}

test("hourly staff 3.7% under the roster passes, with the figure", () => {
  const r = hoursVsRosterReading(week())
  assert.equal(r.met, true)
  assert.equal(r.detail, "Hourly staff worked 840h against 872h rostered (-3.7%).")
})

test("a clock-in left open (221 h) is INCORRECT by name and kept out of the figure", () => {
  const r = hoursVsRosterReading(week([{ source: "TIMESHEET", hours: 221.26, employeeName: "Staff A", shiftStart: at("2026-11-14T00:44:00Z") }]))
  assert.equal(r.met, false)
  assert.match(r.detail, /^INCORRECT: 1 timesheet over 11 hours, a clock-in left open\. Fix in Shifts: Staff A Sat 14 Nov \(221h\)\. Without it: Hourly staff worked 840h/)
})

test("over 3% over the roster fails; exactly 11 hours is a real shift", () => {
  const over = week(Array.from({ length: 10 }, (_, i) => ({ source: "TIMESHEET", hours: 11, employeeName: `L${i}`, shiftStart: at("2026-11-12T20:00:00Z") })))
  const r = hoursVsRosterReading(over)
  assert.equal(r.met, false)
  assert.match(r.detail, /^Hourly staff worked 950h against 872h rostered \(\+8\.9%\)\.$/)
})

test("not enough data asks for a tick by hand", () => {
  assert.equal(hoursVsRosterReading([]).met, null)
})
