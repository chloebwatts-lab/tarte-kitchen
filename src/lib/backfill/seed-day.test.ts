import { test } from "node:test"
import assert from "node:assert/strict"
import { seedDay, type Exec } from "./seed-day"

// A fake Exec: no database. Templates and lines come from the fixtures below,
// every ChecklistRunItem insert is recorded so the test can see which lines
// landed on the seeded run, and cooling logs report "already there" so none
// are written.

interface Tpl {
  id: string
  name: string
  venue: string
  cadence: string
  shift: string
  area: string | null
  dueByHour: number | null
}
interface Line {
  id: string
  label: string
  requireTemp: boolean
  requireNote: boolean
  hotCheck: boolean
  days: number[] | null
  alsoOnPublicHolidays: boolean
}

function fakeDb(templates: Tpl[], lines: Record<string, Line[]>) {
  let runN = 0
  const runTemplate = new Map<string, string>()
  const runVenue = new Map<string, string>()
  /** templateId|venue -> template line ids put on the run, in insert order */
  const seeded = new Map<string, string[]>()
  const exec: Exec = async (sql, params) => {
    if (sql.includes(`FROM "ChecklistTemplate" `)) return templates as unknown as Record<string, unknown>[]
    if (sql.includes(`FROM "ChecklistTemplateItem"`)) {
      return (lines[String(params[0])] ?? []) as unknown as Record<string, unknown>[]
    }
    if (sql.includes(`INSERT INTO "ChecklistRun" `)) {
      const id = `run-${++runN}`
      runTemplate.set(id, String(params[0]))
      runVenue.set(id, String(params[1]))
      return [{ id }]
    }
    if (sql.includes(`INSERT INTO "ChecklistRunItem"`)) {
      const runId = String(params[0])
      const key = `${runTemplate.get(runId)}|${runVenue.get(runId)}`
      seeded.set(key, [...(seeded.get(key) ?? []), String(params[1])])
      return []
    }
    if (sql.includes(`FROM "CoolingLog"`)) return [{ "?column?": 1 }]
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 60)}`)
  }
  return { exec, seeded }
}

const line = (id: string, days: number[] | null = [], alsoOnPublicHolidays = false): Line => ({
  id,
  label: id,
  requireTemp: false,
  requireNote: false,
  hotCheck: false,
  days,
  alsoOnPublicHolidays,
})

const closing: Tpl = {
  id: "t-close",
  name: "Cafe Closing Checklist",
  venue: "BEACH_HOUSE",
  cadence: "DAILY",
  shift: "CLOSE",
  area: "Cafe",
  dueByHour: 17,
}
const closingLines = [
  line("Lights off"),
  line("Order: alcohol", [3, 5, 1]), // Wed, Fri, Mon
  line("Order: up for the weekend", [4, 5]), // Thu, Fri
  line("Surcharge sign away", [0], true), // Sunday + public holidays
]

test("seedDay: a past Thursday's daily run only gets the lines on Thursday's list", async () => {
  const { exec, seeded } = fakeDb([closing], { "t-close": closingLines })
  const res = await seedDay(exec, { date: "2026-11-19" }) // Thursday
  assert.deepEqual(seeded.get("t-close|BEACH_HOUSE"), ["Lights off", "Order: up for the weekend"])
  assert.equal(res.itemsCreated, 2)
  assert.equal(res.runsCreated, 1)
})

test("seedDay: King's Birthday Monday 5 Oct 2026 adds the public holiday surcharge line", async () => {
  const { exec, seeded } = fakeDb([closing], { "t-close": closingLines })
  await seedDay(exec, { date: "2026-10-05" })
  assert.deepEqual(seeded.get("t-close|BEACH_HOUSE"), [
    "Lights off",
    "Order: alcohol",
    "Surcharge sign away",
  ])
})

test("seedDay: an existing list (every line days = []) keeps every line, null days too", async () => {
  const fridge: Tpl = {
    id: "t-fridge",
    name: "Fridge temps AM",
    venue: "BOTH",
    cadence: "DAILY",
    shift: "OPEN",
    area: "Food Safety",
    dueByHour: 10,
  }
  const fridgeLines = [line("Walk-in cool room"), line("Pastry fridge"), line("Bar fridge", null)]
  for (const date of ["2026-11-15", "2026-11-17", "2026-10-05"]) {
    const { exec, seeded } = fakeDb([fridge], { "t-fridge": fridgeLines })
    await seedDay(exec, { date })
    for (const v of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]) {
      assert.deepEqual(
        seeded.get(`t-fridge|${v}`),
        ["Walk-in cool room", "Pastry fridge", "Bar fridge"],
        `${date} ${v}`
      )
    }
  }
})

test("seedDay: a weekly list ignores day rules (one run spans the week)", async () => {
  const weekly: Tpl = {
    id: "t-week",
    name: "Weekly deep clean",
    venue: "BURLEIGH",
    cadence: "WEEKLY",
    shift: "ANY",
    area: "Kitchen",
    dueByHour: null,
  }
  const { exec, seeded } = fakeDb([weekly], {
    "t-week": [line("Degrease canopy"), line("Wed only line", [3])],
  })
  await seedDay(exec, { date: "2026-11-22" }) // Sunday: weekly seeds on Sundays
  assert.deepEqual(seeded.get("t-week|BURLEIGH"), ["Degrease canopy", "Wed only line"])
})
