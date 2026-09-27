import { test } from "node:test"
import assert from "node:assert/strict"
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_BY_KEY,
  serviceCategoryLabel,
  addDays,
  computeSchedule,
  STATUS_LABEL,
} from "./constants"

// computeSchedule snaps to host-local midnight, so all fixtures use local
// noon to keep the calendar day unambiguous on any host TZ.
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12)
const NOW = local(2026, 9, 27) // Sunday 27 Sep 2026

test("category table is well formed and keyed", () => {
  const keys = SERVICE_CATEGORIES.map((c) => c.key)
  assert.equal(new Set(keys).size, keys.length, "keys unique")
  assert.ok(keys.includes("grease-trap"))
  assert.ok(keys.includes("other"))
  assert.equal(SERVICE_CATEGORY_BY_KEY["hood-filters"].defaultIntervalDays, 28)
  assert.equal(SERVICE_CATEGORY_BY_KEY.other.defaultIntervalDays, null)
  for (const c of SERVICE_CATEGORIES) {
    if (c.defaultIntervalDays != null) assert.ok(c.defaultIntervalDays > 0, c.key)
  }
})

test("serviceCategoryLabel prefers a program's own label, then the category, then the raw key", () => {
  assert.equal(serviceCategoryLabel("grease-trap"), "Grease trap pump-out")
  assert.equal(serviceCategoryLabel("grease-trap", "  Trap pump (JJ's)  "), "Trap pump (JJ's)")
  assert.equal(serviceCategoryLabel("grease-trap", "   "), "Grease trap pump-out")
  assert.equal(serviceCategoryLabel("grease-trap", null), "Grease trap pump-out")
  assert.equal(serviceCategoryLabel("unknown-thing"), "unknown-thing")
})

test("addDays walks calendar days without mutating the input", () => {
  const base = local(2026, 9, 30)
  const out = addDays(base, 1)
  assert.equal(out.getDate(), 1)
  assert.equal(out.getMonth(), 9) // October
  assert.equal(base.getDate(), 30)
  assert.equal(addDays(local(2028, 2, 28), 1).getDate(), 29) // leap day
})

test("no visits at all: NO_RECORD", () => {
  const s = computeSchedule({ intervalDays: 91 }, [], NOW)
  assert.equal(s.status, "NO_RECORD")
  assert.equal(s.lastDone, null)
  assert.equal(s.nextDue, null)
})

test("a future booking wins regardless of how overdue the cycle is", () => {
  const s = computeSchedule(
    { intervalDays: 91 },
    [
      { kind: "COMPLETED", serviceDate: local(2026, 1, 10) }, // long overdue
      { kind: "BOOKED", serviceDate: local(2026, 10, 14) },
      { kind: "BOOKED", serviceDate: local(2026, 10, 2) }, // earliest future wins
    ],
    NOW
  )
  assert.equal(s.status, "BOOKED")
  assert.equal(s.nextBooked?.getDate(), 2)
  assert.equal(s.nextDue?.getTime(), s.nextBooked?.getTime())
  assert.equal(s.lastDone?.getMonth(), 0)
})

test("a booking dated today still counts as booked; a booking in the past is ignored", () => {
  const today = computeSchedule({ intervalDays: 91 }, [{ kind: "BOOKED", serviceDate: local(2026, 9, 27) }], NOW)
  assert.equal(today.status, "BOOKED")
  const stale = computeSchedule(
    { intervalDays: 91 },
    [
      { kind: "BOOKED", serviceDate: local(2026, 9, 20) },
      { kind: "COMPLETED", serviceDate: local(2026, 6, 1) },
    ],
    NOW
  )
  assert.equal(stale.status, "OVERDUE")
  assert.equal(stale.nextBooked, null)
})

test("most recent COMPLETED visit is lastDone, whatever order they arrive in", () => {
  const s = computeSchedule(
    { intervalDays: 365 },
    [
      { kind: "COMPLETED", serviceDate: local(2026, 3, 1) },
      { kind: "COMPLETED", serviceDate: local(2026, 8, 15) },
      { kind: "COMPLETED", serviceDate: local(2025, 12, 1) },
    ],
    NOW
  )
  assert.equal(s.lastDone?.getMonth(), 7)
  assert.equal(s.status, "OK")
})

test("interval null: done before, never due", () => {
  const s = computeSchedule({ intervalDays: null }, [{ kind: "COMPLETED", serviceDate: local(2020, 1, 1) }], NOW)
  assert.equal(s.status, "OK")
  assert.equal(s.nextDue, null)
})

test("28-day filter swap warns a week out, not two", () => {
  // due 3 Oct, today 27 Sep -> 6 days away, window = min(14, round(28/4)=7) -> DUE_SOON
  const soon = computeSchedule({ intervalDays: 28 }, [{ kind: "COMPLETED", serviceDate: local(2026, 9, 5) }], NOW)
  assert.equal(soon.status, "DUE_SOON")
  assert.equal(soon.nextDue?.getDate(), 3)
  // due 5 Oct -> 8 days away -> OK
  const ok = computeSchedule({ intervalDays: 28 }, [{ kind: "COMPLETED", serviceDate: local(2026, 9, 7) }], NOW)
  assert.equal(ok.status, "OK")
  // due exactly at the edge of the window (4 Oct = 7 days) -> DUE_SOON
  const edge = computeSchedule({ intervalDays: 28 }, [{ kind: "COMPLETED", serviceDate: local(2026, 9, 6) }], NOW)
  assert.equal(edge.status, "DUE_SOON")
})

test("annual services cap the due-soon window at 14 days", () => {
  // 8 Oct 2025 + 365 = 8 Oct 2026 -> 11 days out -> DUE_SOON
  const soon = computeSchedule({ intervalDays: 365 }, [{ kind: "COMPLETED", serviceDate: local(2025, 10, 8) }], NOW)
  assert.equal(soon.status, "DUE_SOON")
  // 15 Oct 2025 -> 18 days out -> OK
  const ok = computeSchedule({ intervalDays: 365 }, [{ kind: "COMPLETED", serviceDate: local(2025, 10, 15) }], NOW)
  assert.equal(ok.status, "OK")
})

test("tiny intervals still get at least a 2-day warning window", () => {
  // 3-day cycle: round(3/4)=1 -> clamped to 2. Done 25 Sep, due 28 Sep, 1 day out -> DUE_SOON.
  const s = computeSchedule({ intervalDays: 3 }, [{ kind: "COMPLETED", serviceDate: local(2026, 9, 25) }], NOW)
  assert.equal(s.status, "DUE_SOON")
})

test("due yesterday is OVERDUE, due today is DUE_SOON", () => {
  const overdue = computeSchedule({ intervalDays: 91 }, [{ kind: "COMPLETED", serviceDate: local(2026, 6, 27) }], NOW)
  assert.equal(overdue.status, "OVERDUE") // 27 Jun + 91 = 26 Sep
  const today = computeSchedule({ intervalDays: 91 }, [{ kind: "COMPLETED", serviceDate: local(2026, 6, 28) }], NOW)
  assert.equal(today.status, "DUE_SOON") // 28 Jun + 91 = 27 Sep
})

test("every status has a label", () => {
  for (const k of ["OVERDUE", "DUE_SOON", "BOOKED", "OK", "NO_RECORD"] as const) {
    assert.ok(STATUS_LABEL[k].length > 0)
  }
})
