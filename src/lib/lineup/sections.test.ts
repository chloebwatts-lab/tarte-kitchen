import { test } from "node:test"
import assert from "node:assert/strict"
import { groupShifts, sectionOf, compareShifts } from "./sections"
import type { LineUpShift } from "@/lib/actions/lineup"

// Times are AEST on Mon 28 Sep 2026, written as the UTC instants the DB holds
// (AEST = UTC+10, so 5:30am AEST is 19:30Z the evening before).
const aest = (hhmm: string, day = 28): string => {
  const [h, m] = hhmm.split(":").map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 10, m)).toISOString()
}

const shift = (name: string, area: string | null, start: string, end: string, unfilled = false): LineUpShift => ({
  name,
  area,
  start: aest(start),
  end: aest(end),
  unfilled,
})

// Georgia's FOH roster from the report, deliberately shuffled.
const foh = [
  shift("Lacey Corby", "FOH Burleigh", "9:00", "13:30"),
  shift("Georgia Farquhar", "FOH Burleigh", "7:30", "15:30"),
  shift("Addy", "FOH Burleigh", "8:30", "15:00"),
  shift("Savannah Hjorth", "FOH Burleigh", "6:00", "13:30"),
  shift("Seika", "FOH Burleigh", "8:30", "15:30"),
  shift("El Mckenna", "FOH Burleigh", "7:00", "14:00"),
  shift("Dani Reynard", "FOH Burleigh", "8:00", "14:00"),
  shift("Jazzmine Croswell", "FOH Burleigh", "6:30", "15:30"),
]

test("within a section the first starter is listed first, the latest starter last", () => {
  const [[name, list]] = groupShifts(foh)
  assert.equal(name, "FOH")
  assert.deepEqual(
    list.map((s) => s.name.split(" ")[0]),
    ["Savannah", "Jazzmine", "El", "Georgia", "Dani", "Seika", "Addy", "Lacey"]
  )
})

test("two starters at the same time: the longer shift first, so 8:30-3:30 sits above 8:30-3", () => {
  const seika = shift("Seika", "FOH", "8:30", "15:30")
  const addy = shift("Addy", "FOH", "8:30", "15:00")
  assert.ok(compareShifts(seika, addy) < 0)
  assert.ok(compareShifts(addy, seika) > 0)
})

test("same start and end falls back to name so the order never jumps between renders", () => {
  const a = shift("Addy", "FOH", "8:30", "15:00")
  const b = shift("Seika", "FOH", "8:30", "15:00")
  assert.ok(compareShifts(a, b) < 0)
  assert.equal(compareShifts(a, a), 0)
})

test("sections read front to back: FOH, Barista, Takeaway area, Juice bar, then the kitchen", () => {
  const sections = groupShifts([
    shift("Jhett Duncan", "Juice Bar Burleigh", "6:15", "14:00"),
    shift("Chef One", "Kitchen Burleigh", "5:00", "13:00"),
    shift("Mami Matsuoka", "Barista Burleigh", "6:00", "15:30"),
    shift("Ayla", "Takeaway Area Burleigh", "5:30", "12:30"),
    ...foh,
    shift("Pastry One", "Pastry Burleigh", "4:00", "12:00"),
  ])
  // Deputy's capitalisation is kept ("Takeaway Area"); the screen uppercases
  // it, and the rank lookup is case-insensitive.
  assert.deepEqual(
    sections.map(([n]) => n),
    ["FOH", "Barista", "Takeaway Area", "Juice Bar", "Kitchen", "Pastry"]
  )
})

test("an unknown section goes after the known ones, alphabetically", () => {
  const sections = groupShifts([
    shift("Z", "Zebra Burleigh", "9:00", "12:00"),
    shift("A", "Admin Burleigh", "9:00", "12:00"),
    shift("K", "KP Burleigh", "9:00", "12:00"),
  ])
  assert.deepEqual(sections.map(([n]) => n), ["KP", "Admin", "Zebra"])
})

test("salary placeholder cards are dropped; a real person on a salary area is re-homed", () => {
  const sections = groupShifts([
    shift("Salary Chefs Burleigh", "Salary Chefs Burleigh", "9:00", "10:00"),
    shift("Head Chef", "Salary Chefs Burleigh", "6:00", "14:00"),
  ])
  assert.deepEqual(sections, [["Chefs", [sections[0][1][0]]]])
  assert.equal(sections[0][1][0].name, "Head Chef")
})

test("an unfilled Deputy open shift stays and sorts by its start like anyone else", () => {
  const [[, list]] = groupShifts([
    shift("Unfilled", "FOH", "7:00", "14:00", true),
    shift("Savannah Hjorth", "FOH", "6:00", "13:30"),
    shift("Lacey Corby", "FOH", "9:00", "13:30"),
  ])
  assert.deepEqual(list.map((s) => s.name), ["Savannah Hjorth", "Unfilled", "Lacey Corby"])
})

test("ordering is by instant, not by clock text: a 10am shift is not before a 5:30am one on the same day", () => {
  // The old bug window (10am today to 10am tomorrow) made this mix possible.
  // Even then, the sort must put the earlier instant first.
  const [[, list]] = groupShifts([
    shift("Late", "FOH", "10:00", "16:00"),
    shift("Early", "FOH", "5:30", "12:30"),
  ])
  assert.deepEqual(list.map((s) => s.name), ["Early", "Late"])
})

test("sectionOf normalises Deputy area names", () => {
  assert.equal(sectionOf("FOH Burleigh"), "FOH")
  assert.equal(sectionOf("BOH Beach House"), "Kitchen")
  assert.equal(sectionOf("KP Tea Garden"), "KP")
  assert.equal(sectionOf("takeaway area Burleigh"), "Takeaway area")
  assert.equal(sectionOf("Takeaway Area Burleigh"), "Takeaway Area")
  assert.equal(sectionOf(null), "Unassigned")
  assert.equal(sectionOf("Burleigh"), "Unassigned")
})

// ------------------------------------------------------------ edges

test("no roster synced: groupShifts of nothing is no sections, not a crash", () => {
  assert.deepEqual(groupShifts([]), [])
})

test("a day that is only salary cards renders no sections at all (no empty headings)", () => {
  const sections = groupShifts([
    shift("Salary Chefs Burleigh", "Salary Chefs Burleigh", "9:00", "10:00"),
    shift("  salary FOH Burleigh", "Salary FOH Burleigh", "9:00", "10:00"),
  ])
  assert.deepEqual(sections, [])
})

test("a real person on a salary FOH area is re-homed to FOH and still reads first, ahead of the kitchen", () => {
  const sections = groupShifts([
    shift("Chef One", "Kitchen Burleigh", "5:00", "13:00"),
    shift("Georgia Farquhar", "Salary FOH Burleigh", "7:30", "15:30"),
  ])
  assert.deepEqual(sections.map(([n]) => n), ["FOH", "Kitchen"])
  assert.equal(sections[0][1][0].name, "Georgia Farquhar")
})

test("nobody's area (null) lands in Unassigned, after every known section, alphabetically among unknowns", () => {
  const sections = groupShifts([
    shift("Mystery", null, "9:00", "12:00"),
    shift("Z", "Zebra Burleigh", "9:00", "12:00"),
    shift("A", "Admin Burleigh", "9:00", "12:00"),
    shift("Pastry One", "Pastry Burleigh", "4:00", "12:00"),
  ])
  assert.deepEqual(sections.map(([n]) => n), ["Pastry", "Admin", "Unassigned", "Zebra"])
})

test("input order does not matter: the roster reversed groups and sorts identically", () => {
  const forward = groupShifts(foh)
  const backward = groupShifts([...foh].reverse())
  assert.deepEqual(
    forward.map(([n, l]) => [n, l.map((s) => s.name)]),
    backward.map(([n, l]) => [n, l.map((s) => s.name)])
  )
})

test("groupShifts does not reorder or shrink the array it was given", () => {
  const input = [
    shift("Salary Chefs Burleigh", "Salary Chefs Burleigh", "9:00", "10:00"),
    shift("Lacey Corby", "FOH Burleigh", "9:00", "13:30"),
    shift("Savannah Hjorth", "FOH Burleigh", "6:00", "13:30"),
  ]
  const snapshot = input.map((s) => s.name)
  groupShifts(input)
  assert.deepEqual(input.map((s) => s.name), snapshot)
  assert.equal(input.length, 3)
})

test("a close shift that runs past AEST midnight sorts by its start instant and its tie-break uses the real end", () => {
  // Both start 10pm Mon 28 Sep AEST; one finishes 1am Tue, the other midnight.
  const longClose = { ...shift("Long Close", "Kitchen", "22:00", "23:00"), end: aest("1:00", 29) }
  const shortClose = { ...shift("Short Close", "Kitchen", "22:00", "23:00"), end: aest("0:00", 29) }
  const earlyBake = shift("Baker", "Kitchen", "4:00", "12:00")
  const [[, list]] = groupShifts([shortClose, longClose, earlyBake])
  assert.deepEqual(list.map((s) => s.name), ["Baker", "Long Close", "Short Close"])
  assert.ok(compareShifts(longClose, shortClose) < 0)
})

test("each section is sorted on its own: a late FOH starter does not push an early kitchen starter around", () => {
  const sections = groupShifts([
    shift("Lacey Corby", "FOH Burleigh", "9:00", "13:30"),
    shift("Chef Two", "Kitchen Burleigh", "7:00", "15:00"),
    shift("Savannah Hjorth", "FOH Burleigh", "6:00", "13:30"),
    shift("Chef One", "Kitchen Burleigh", "5:00", "13:00"),
  ])
  assert.deepEqual(
    sections.map(([n, l]) => [n, l.map((s) => s.name)]),
    [
      ["FOH", ["Savannah Hjorth", "Lacey Corby"]],
      ["Kitchen", ["Chef One", "Chef Two"]],
    ]
  )
})
